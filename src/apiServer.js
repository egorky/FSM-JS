const express = require('express');
const fsm = require('./fsm');
const { loadStateConfig } = require('./configLoader');

const app = express();
app.use(express.json()); // Middleware para parsear JSON en las solicitudes

const PORT = process.env.PORT || 3000;

// Endpoint para procesar la lógica de la FSM
app.post('/fsm/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { intent, parameters } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId es requerido en la URL.' });
  }

  try {
    const result = await fsm.processInput(sessionId, intent, parameters);

    // La respuesta debe incluir:
    // - El siguiente estado (o el actual si no cambió)
    // - Los parámetros que se deben recoger en el nuevo estado
    // - Las APIs que deben ser llamadas por el proceso que recibe esta información

    res.json({
      sessionId: sessionId,
      currentStateId: result.sessionData.currentStateId, // El estado después del procesamiento
      nextStateId: result.nextStateId, // Alias para claridad, es el mismo que currentStateId en sessionData
      parametersToCollect: result.parametersToCollect,
      apisToCall: result.apisToCall,
      collectedParameters: result.sessionData.parameters, // Todos los parámetros acumulados
      // Opcional: podrías devolver más detalles del estado si es útil para el cliente
      // nextStateDescription: result.nextStateConfig.description
    });

  } catch (error) {
    console.error(`Error procesando FSM para session ${sessionId}:`, error);
    if (error.message.includes('Configuración no encontrada') || error.message.includes('no existe en la definición de \'states\'')) {
        return res.status(404).json({ error: 'Estado no encontrado o error de configuración.', details: error.message });
    }
    if (error.message.includes('Redis no está conectado')) {
        return res.status(503).json({ error: 'Servicio no disponible temporalmente (Redis).', details: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud.', details: error.message });
  }
});

// Endpoint de health check (opcional pero útil)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

function startApiServer() {
  try {
    loadStateConfig(); // Cargar y validar la configuración de estados al inicio
    app.listen(PORT, () => {
      console.log(`Servidor API de FSM escuchando en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor API:', error);
    process.exit(1); // Terminar la aplicación si la configuración de estados falla
  }
}

module.exports = { startApiServer, app }; // Exportar 'app' puede ser útil para tests
