# Instrucciones para Agentes AI sobre el Proyecto FSM Node.js

Este documento proporciona una guía para trabajar con el proyecto de Máquina de Estados Finitos (FSM) desarrollada en Node.js.

## Estructura del Proyecto

El proyecto está organizado de la siguiente manera:

-   `package.json`: Define las dependencias del proyecto y los scripts principales.
    -   **Importante**: Las dependencias listadas (`express`, `ioredis`, `ari-client`, `dotenv`) **no se instalan automáticamente** como parte de las tareas de este agente. Se asume que estarán disponibles en el entorno de ejecución final.
-   `config/`: Contiene los archivos de configuración.
    -   `states.json`: Define la estructura de la máquina de estados. Cada estado incluye:
        -   `id`, `description`.
        -   `parameters`: Con `required` y `optional`.
        -   `payloadResponse`: Un objeto de formato libre. **Los strings dentro de este objeto son procesados por `src/templateProcessor.js` para sustituir placeholders (`{{param}}`, `{{current_date}}`) y ejecutar funciones predefinidas (ej: `{{toUpperCase(param)}}`) antes de ser devueltos por la FSM.**
        -   `transitions`: Para definir los siguientes estados basados en condiciones.
        -   `defaultNextState`.
-   `src/`: Contiene el código fuente de la aplicación.
    -   `index.js`: Punto de entrada. Carga `dotenv`, inicializa módulos.
    -   `configLoader.js`: Carga y valida `states.json`.
    -   `fsm.js`: Lógica central de la FSM. **Importante: Ahora procesa el `payloadResponse` usando `templateProcessor.js` antes de devolverlo.**
    -   `redisClient.js`: Cliente Redis.
    -   `apiServer.js`: Servidor API Express.
    -   `ariClient.js`: Cliente Asterisk ARI.
    -   `templateProcessor.js`: **Nuevo módulo** responsable de procesar strings en `payloadResponse` para sustituir placeholders y ejecutar funciones predefinidas.

## Flujo General de la Aplicación

1.  **Inicio (`src/index.js`)**: Similar a antes.

2.  **Interacción (Modo API / Socket / ARI)**:
    *   La solicitud llega a `fsm.js`.
    *   `fsm.js` determina el `nextStateId` y obtiene el `payloadResponse` crudo del `config/states.json`.
    *   **Nuevo Paso de Procesamiento**: `fsm.js` pasa el `payloadResponse` crudo y los `collectedParameters` a `templateProcessor.js`.
    *   `templateProcessor.js` devuelve el `payloadResponse` con todos los placeholders y funciones resueltos.
    *   `fsm.js` devuelve este `payloadResponse` procesado, junto con `nextStateId`, `parametersToCollect`, y `collectedParameters`.
    *   `apiServer.js` (o `socketServer.js` o `ariClient.js`) envía esta respuesta procesada al cliente.

## Consideraciones para el Desarrollo

*   **Procesamiento de Plantillas (`payloadResponse`)**:
    *   Los strings dentro de `payloadResponse` en `config/states.json` ahora son dinámicos.
    *   Sintaxis: `{{paramName}}` para parámetros, `{{current_date}}`, `{{current_time}}`, `{{current_datetime}}` para fecha/hora.
    *   Funciones predefinidas: `{{funcName(arg1, 'literal', ...)}}`. Consulta `src/templateProcessor.js` para la lista de funciones (`default`, `toUpperCase`, `toLowerCase`, `capitalize`, `formatNumber`, `add`, `subtract`).
    *   Este procesamiento ocurre dentro de `fsm.js` a través de `templateProcessor.js`. La aplicación cliente recibe el `payloadResponse` ya renderizado.
*   **Parámetros Acumulados**: Se mantiene igual: `collectedParameters` siempre contiene la fusión completa.
*   **No Instalar Dependencias**: Se mantiene (excepto `dotenv`).
*   **Pruebas**: Se mantiene.
*   **Variables de Entorno**:
    *   El proyecto ahora utiliza la librería `dotenv` para cargar automáticamente las variables de entorno desde un archivo `.env` ubicado en la raíz del proyecto.
    *   Se proporciona un archivo `.env.example` como plantilla. Los desarrolladores deben copiar este archivo a `.env` y ajustar los valores para su entorno local. `dotenv` ha sido añadido como una dependencia en `package.json`.
    *   Variables clave incluyen `ENABLE_API`, `ENABLE_ARI`, `ENABLE_SOCKET_SERVER`, `FSM_SOCKET_PATH` y `REDIS_SESSION_TTL`.
    *   Otras variables configuran la conexión a Redis (`REDIS_HOST`, `REDIS_PORT`, etc.) y Asterisk ARI (`ARI_URL`, `ARI_APP_NAME`, etc.).
    *   Consulta `.env.example` para la lista completa. `src/index.js` carga estas variables al inicio.
*   **Interfaces de Comunicación**: La FSM puede ser contactada vía API HTTP, socket UNIX (si está habilitado y configurado), o indirectamente a través de ARI.
*   **Manejo de Sesiones**: Las sesiones de la FSM se identifican por un `sessionId` y se persisten en Redis, con un TTL configurable mediante `REDIS_SESSION_TTL`. El `sessionId` es proporcionado en la URL para la API, como parte del mensaje JSON para sockets, y es el ID del canal para ARI.
*   **Documentación Detallada del Código**: Para una comprensión profunda de cada módulo, incluyendo `src/socketServer.js`, consulta [docs/CodebaseOverview.md](docs/CodebaseOverview.md).

## Cómo Ejecutar (con `.env`)

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
