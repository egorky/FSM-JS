# Instrucciones para Agentes AI sobre el Proyecto FSM Node.js

Este documento proporciona una guía para trabajar con el proyecto de Máquina de Estados Finitos (FSM) desarrollada en Node.js.

## Estructura del Proyecto

El proyecto está organizado de la siguiente manera:

-   `package.json`: Define las dependencias del proyecto y los scripts principales.
    -   **Importante**: Las dependencias listadas (`express`, `ioredis`, `asterisk-ari-client`) **no se instalan automáticamente** como parte de las tareas de este agente. Se asume que estarán disponibles en el entorno de ejecución final.
-   `config/`: Contiene los archivos de configuración.
    -   `states.json`: Define la estructura de la máquina de estados, incluyendo estados, transiciones, parámetros esperados y APIs a llamar. La estructura detallada se discutió durante la fase de diseño.
-   `src/`: Contiene el código fuente de la aplicación.
    -   `index.js`: Punto de entrada principal de la aplicación. Orquesta la inicialización de todos los módulos.
    -   `configLoader.js`: Módulo responsable de cargar y validar el archivo `config/states.json`.
    -   `fsm.js`: Contiene la lógica central de la máquina de estados. Procesa entradas, gestiona estados y determina las acciones siguientes.
    -   `redisClient.js`: Gestiona la conexión y las interacciones con la base de datos Redis, utilizada para persistir el estado de las sesiones de la FSM.
    -   `apiServer.js`: Implementa un servidor Express para exponer la FSM a través de una API RESTful (JSON).
    -   `ariClient.js`: Implementa la conexión con Asterisk mediante ARI (Asterisk REST Interface) para integrar la FSM con un sistema de telefonía.

## Flujo General de la Aplicación

1.  **Inicio (`src/index.js`)**:
    *   Carga la configuración de estados (`config/states.json`).
    *   Establece conexión con Redis.
    *   Inicia el servidor API (`src/apiServer.js`).
    *   Opcionalmente (controlado por `ENABLE_ARI`), conecta con Asterisk ARI (`src/ariClient.js`).

2.  **Interacción (Modo API)**:
    *   El cliente envía una solicitud `POST` a `/fsm/:sessionId` con `intent` y `parameters` en el cuerpo.
    *   `apiServer.js` recibe la solicitud y la pasa a `fsm.js`.
    *   `fsm.js` utiliza `redisClient.js` para obtener/guardar el estado de la sesión.
    *   `fsm.js` consulta `configLoader.js` para la lógica del estado actual.
    *   `fsm.js` devuelve el nuevo estado, parámetros a recolectar y APIs a llamar.
    *   `apiServer.js` responde al cliente con esta información en formato JSON.

3.  **Interacción (Modo ARI)**:
    *   Una llamada entrante en Asterisk es dirigida a la aplicación Stasis registrada por `ariClient.js`.
    *   `ariClient.js` maneja el evento `StasisStart`. El ID del canal de Asterisk se usa como `sessionId`.
    *   Se llama a `fsm.js` para procesar la interacción (inicialmente sin `intent` ni `parameters` específicos).
    *   La respuesta de `fsm.js` (siguiente estado, parámetros a recolectar, APIs a llamar) se utiliza para guiar la interacción con el llamante a través de acciones ARI (ej: reproducir audio, esperar DTMF).
    *   **Nota**: La lógica de interacción detallada en `ariClient.js` (manejo de DTMF, ASR, etc.) es un esqueleto y requeriría una implementación más profunda.

## Consideraciones para el Desarrollo

*   **Configuración de Estados (`config/states.json`)**: Cualquier cambio en la lógica de la conversación (nuevos estados, cambio en parámetros, etc.) debe realizarse en este archivo. Asegúrate de que la estructura del JSON sea válida según lo definido.
*   **No Instalar Dependencias**: Recuerda la restricción de no instalar dependencias (`npm install`). Solo debes modificar el `package.json` si se requiere añadir o cambiar una dependencia, pero no ejecutar la instalación.
*   **Pruebas**: Dado que no se pueden instalar dependencias, las pruebas unitarias o de integración que dependan de estos módulos no se podrán ejecutar directamente en este entorno. El desarrollo debe enfocarse en la correcta implementación lógica.
*   **Variables de Entorno**: Varios módulos (Redis, ARI, API server) utilizan variables de entorno para su configuración (ej: `REDIS_HOST`, `ARI_URL`, `PORT`). Consulta los respectivos archivos `.js` para ver cuáles se utilizan.
*   **Manejo de Sesiones**: Las sesiones de la FSM se identifican por un `sessionId` y se persisten en Redis. El `sessionId` es proporcionado en la URL para la API y es el ID del canal para ARI.

## Cómo (teóricamente) Ejecutar

Si las dependencias estuvieran instaladas, la aplicación se ejecutaría con:

```bash
npm start
```

O para desarrollo con recarga automática (si `nodemon` estuviera instalado):

```bash
npm run dev
```

Asegúrate de que una instancia de Redis esté accesible y, si `ENABLE_ARI` es `true`, que un servidor Asterisk con ARI configurado también lo esté.
La configuración de conexión para Redis y ARI se realiza mediante variables de entorno o valores por defecto en `redisClient.js` y `ariClient.js`.
El archivo `config/states.json` debe existir y ser válido.
