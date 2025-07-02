# Instrucciones para Agentes AI sobre el Proyecto FSM Node.js

Este documento proporciona una guía para trabajar con el proyecto de Máquina de Estados Finitos (FSM) desarrollada en Node.js.

## Estructura del Proyecto

El proyecto está organizado de la siguiente manera:

-   `package.json`: Define las dependencias del proyecto y los scripts principales.
    -   **Importante**: Las dependencias listadas (`express`, `ioredis`, `ari-client`) **no se instalan automáticamente** como parte de las tareas de este agente. Se asume que estarán disponibles en el entorno de ejecución final.
-   `config/`: Contiene los archivos de configuración.
    -   `states.json`: Define la estructura de la máquina de estados. Cada estado incluye:
        -   `id`, `description`.
        -   `parameters`: Con `required` y `optional`.
        -   `apiHooks`: Un objeto que mapea puntos del ciclo de vida del estado (ej: `onEnterState`, `beforeCollectingParameters`, `afterParametersCollected`) a arrays de IDs de API que la aplicación externa debe llamar. Reemplaza al antiguo campo `apisToCall`.
        -   `transitions`: Para definir los siguientes estados basados en condiciones (intención, parámetros cumplidos).
        -   `defaultNextState`.
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
    *   `fsm.js` devuelve el nuevo estado, parámetros a recolectar y el objeto `apiHooks` (en lugar del antiguo `apisToCall`).
    *   `apiServer.js` responde al cliente con esta información en formato JSON. La aplicación externa debe interpretar `apiHooks` para llamar a las APIs en los momentos adecuados.

3.  **Interacción (Modo ARI)**:
    *   Una llamada entrante en Asterisk es dirigida a la aplicación Stasis registrada por `ariClient.js`.
    *   `ariClient.js` maneja el evento `StasisStart`. El ID del canal de Asterisk se usa como `sessionId`.
    *   Se llama a `fsm.js` para procesar la interacción.
    *   La respuesta de `fsm.js` (siguiente estado, parámetros a recolectar, `apiHooks`) se utiliza para guiar la interacción. `ariClient.js` ahora recibe `apiHooks` y puede (conceptualmente) usar esta estructura para decidir qué APIs (representadas por logs o variables de canal) son relevantes en diferentes puntos de la interacción de voz.
    *   **Nota**: La lógica de interacción detallada en `ariClient.js` es un esqueleto. La interpretación y ejecución de los `apiHooks` en un flujo de voz real es compleja.

## Consideraciones para el Desarrollo

*   **Configuración de Estados (`config/states.json`)**: Cualquier cambio en la lógica de la conversación (nuevos estados, cambio en parámetros, estructura de `apiHooks`, etc.) debe realizarse en este archivo. Asegúrate de que la estructura del JSON sea válida, incluyendo el objeto `apiHooks` y sus arrays de APIs para cada hook.
*   **No Instalar Dependencias**: Recuerda la restricción de no instalar dependencias (`npm install`). Solo debes modificar el `package.json` si se requiere añadir o cambiar una dependencia, pero no ejecutar la instalación.
*   **Pruebas**: Dado que no se pueden instalar dependencias, las pruebas unitarias o de integración que dependan de estos módulos no se podrán ejecutar directamente en este entorno. El desarrollo debe enfocarse en la correcta implementación lógica.
*   **Variables de Entorno**:
    *   El proyecto ahora utiliza la librería `dotenv` para cargar automáticamente las variables de entorno desde un archivo `.env` ubicado en la raíz del proyecto.
    *   Se proporciona un archivo `.env.example` como plantilla. Los desarrolladores deben copiar este archivo a `.env` y ajustar los valores para su entorno local. `dotenv` ha sido añadido como una dependencia en `package.json`.
    *   Variables clave incluyen `ENABLE_API` y `ENABLE_ARI` para activar/desactivar los respectivos módulos.
    *   Otras variables configuran la conexión a Redis (`REDIS_HOST`, `REDIS_PORT`, etc.) y Asterisk ARI (`ARI_URL`, `ARI_APP_NAME`, etc.).
    *   Consulta `.env.example` para la lista completa. `src/index.js` carga estas variables al inicio.
*   **Manejo de Sesiones**: Las sesiones de la FSM se identifican por un `sessionId` y se persisten en Redis. El `sessionId` es proporcionado en la URL para la API y es el ID del canal para ARI.

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
