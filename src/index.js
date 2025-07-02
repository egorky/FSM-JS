const { startApiServer } = require('./apiServer');
const redisClient = require('./redisClient');
const { connectAri, closeAri } = require('./ariClient');
const { loadStateConfig } = require('./configLoader');

async function main() {
  let ariConnected = false;
  try {
    // 1. Cargar configuración de la FSM (ya se hace en apiServer y ariClient al iniciar, pero podemos asegurar aquí)
    console.log('Inicializando aplicación FSM...');
    loadStateConfig();
    console.log('Configuración de estados cargada.');

    // 2. Conectar a Redis
    await redisClient.connect();
    console.log('Conexión con Redis establecida.');

    // 3. Iniciar el servidor API
    // startApiServer ya maneja su propia carga de config y logging
    startApiServer();
    // No hay un 'await' aquí porque app.listen es asíncrono pero no devuelve una promesa
    // que necesitemos esperar para continuar con ARI. El log de 'escuchando en puerto X'
    // se manejará dentro de startApiServer.

    // 4. Conectar al cliente ARI de Asterisk (si está habilitado o configurado)
    // Podríamos tener una variable de entorno para habilitar/deshabilitar ARI
    const enableAri = process.env.ENABLE_ARI !== 'false'; // Habilitado por defecto
    if (enableAri) {
      console.log('Intentando conectar a Asterisk ARI...');
      await connectAri(); // connectAri maneja sus propios reintentos iniciales si falla
      ariConnected = true;
      console.log('Módulo ARI iniciado y conectado.');
    } else {
      console.log('Módulo ARI está deshabilitado por configuración.');
    }

    console.log('Aplicación FSM iniciada y lista.');

  } catch (error) {
    console.error('Error fatal durante la inicialización de la aplicación:', error);
    // Intentar cerrar conexiones abiertas antes de salir
    if (ariConnected) {
      await closeAri().catch(err => console.error('Error al cerrar ARI durante el apagado por error:', err));
    }
    await redisClient.quit().catch(err => console.error('Error al cerrar Redis durante el apagado por error:', err));
    process.exit(1);
  }
}

// Manejar cierre gracefully
async function shutdown(signal) {
  console.log(`\nRecibida señal ${signal}. Cerrando la aplicación FSM...`);

  // Aquí no cerramos el servidor HTTP explícitamente con server.close()
  // porque no guardamos la instancia del servidor desde startApiServer.
  // Para un cierre más limpio, startApiServer debería devolver el servidor.
  // Por ahora, las conexiones existentes podrían interrumpirse.

  if (process.env.ENABLE_ARI !== 'false') {
      await closeAri().catch(err => console.error('Error al cerrar ARI:', err));
  }
  await redisClient.quit().catch(err => console.error('Error al cerrar Redis:', err));

  console.log('Aplicación FSM cerrada.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('Excepción no capturada:', error);
  // Considera si quieres intentar un shutdown aquí o simplemente salir.
  // Si el estado es muy inestable, un shutdown podría fallar o empeorar las cosas.
  // shutdown('uncaughtException').then(() => process.exit(1)).catch(() => process.exit(1));
  process.exit(1); // Salir directamente para evitar estado inconsistente
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Rechazo de promesa no manejado:', promise, 'razón:', reason);
  // Similar a uncaughtException, decide la estrategia de salida.
  // shutdown('unhandledRejection').then(() => process.exit(1)).catch(() => process.exit(1));
  process.exit(1);
});

main();
