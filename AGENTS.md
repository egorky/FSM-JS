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
        -   `payloadResponse`: Un objeto de formato libre definido por el usuario que se devuelve tal cual cuando se alcanza el estado. Puede contener cualquier estructura JSON (ej: `apiHooks`, `prompts`, `tools`, etc.). Reemplaza al antiguo campo `apiHooks` (que ahora podría estar anidado dentro de `payloadResponse` si se desea).
        -   `transitions`: Para definir los siguientes estados basados en condiciones (intención, parámetros cumplidos).
        -   `defaultNextState`.
-   `src/`: Contiene el código fuente de la aplicación.
    -   `index.js`: Punto de entrada principal de la aplicación. Carga `dotenv` y orquesta la inicialización de los módulos.
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
    *   `fsm.js` utiliza `redisClient.js` para obtener/guardar el estado de la sesión (incluyendo todos los parámetros acumulados).
    *   `fsm.js` consulta `configLoader.js` para la lógica del estado actual.
    *   `fsm.js` devuelve el nuevo estado (`nextStateId`), los parámetros a recolectar (`parametersToCollect`), el `payloadResponse` definido para el nuevo estado, y todos los `collectedParameters` (fusión de los de sesión y los nuevos).
    *   `apiServer.js` responde al cliente con esta información completa en formato JSON.

3.  **Interacción (Modo ARI)**:
    *   Una llamada entrante en Asterisk es dirigida a la aplicación Stasis registrada por `ariClient.js`.
    *   `ariClient.js` maneja el evento `StasisStart`. El ID del canal de Asterisk se usa como `sessionId`.
    *   Se llama a `fsm.js` para procesar la interacción.
    *   La respuesta de `fsm.js` (incluyendo `nextStateId`, `parametersToCollect`, `payloadResponse`, y `collectedParameters`) se utiliza para guiar la interacción. `ariClient.js` ahora recibe el `payloadResponse` completo y puede (conceptualmente) usar esta estructura para decidir las acciones de llamada.
    *   **Nota**: La lógica de interacción detallada en `ariClient.js` es un esqueleto. La interpretación del `payloadResponse` para acciones ARI es responsabilidad del desarrollador que integre con Asterisk.

## Consideraciones para el Desarrollo

*   **Configuración de Estados (`config/states.json`)**: Cualquier cambio en la lógica de la conversación (nuevos estados, cambio en parámetros, contenido del `payloadResponse` para cada estado, etc.) debe realizarse en este archivo. Asegúrate de que la estructura del JSON sea válida. El `payloadResponse` es un objeto de formato libre.
*   **Parámetros Acumulados**: La FSM se encarga de fusionar los parámetros recibidos en cada solicitud con los ya existentes en la sesión de Redis. La respuesta siempre incluirá todos los parámetros recolectados hasta el momento en el campo `collectedParameters`.
*   **No Instalar Dependencias**: Recuerda la restricción de no instalar dependencias (`npm install`). Solo debes modificar el `package.json` si se requiere añadir o cambiar una dependencia, pero no ejecutar la instalación (esto aplica a menos que se acuerde explícitamente lo contrario, como con `dotenv`).
*   **Pruebas**: Dado que no se pueden instalar dependencias (generalmente), las pruebas unitarias o de integración que dependan de estos módulos no se podrán ejecutar directamente en este entorno. El desarrollo debe enfocarse en la correcta implementación lógica.
*   **Variables de Entorno**:
    *   El proyecto ahora utiliza la librería `dotenv` para cargar automáticamente las variables de entorno desde un archivo `.env` ubicado en la raíz del proyecto.
    *   Se proporciona un archivo `.env.example` como plantilla. Los desarrolladores deben copiar este archivo a `.env` y ajustar los valores para su entorno local. `dotenv` ha sido añadido como una dependencia en `package.json`.
    *   Variables clave incluyen `ENABLE_API`, `ENABLE_ARI` y `REDIS_SESSION_TTL`.
    *   Otras variables configuran la conexión a Redis (`REDIS_HOST`, `REDIS_PORT`, etc.) y Asterisk ARI (`ARI_URL`, `ARI_APP_NAME`, etc.).
    *   Consulta `.env.example` para la lista completa. `src/index.js` carga estas variables al inicio.
*   **Manejo de Sesiones**: Las sesiones de la FSM se identifican por un `sessionId` y se persisten en Redis, con un TTL configurable mediante `REDIS_SESSION_TTL`. El `sessionId` es proporcionado en la URL para la API y es el ID del canal para ARI.
*   **Documentación Detallada del Código**: Para una comprensión profunda de cada módulo, consulta [docs/CodebaseOverview.md](docs/CodebaseOverview.md).

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
