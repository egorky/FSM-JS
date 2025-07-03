# Node.js FSM Service para Agendamiento Virtual

Este proyecto implementa una Máquina de Estados Finitos (FSM) utilizando Node.js. Está diseñada para gestionar flujos de conversación, como el agendamiento de citas, y puede ser integrada a través de una API RESTful o mediante Asterisk ARI para interacciones telefónicas.

## Características Principales

*   **Motor de FSM Configurable y Flexible en Respuestas**: La lógica de los estados, transiciones y parámetros a recolectar se define en `config/states.json`. Crucialmente, cada estado puede definir un objeto `payloadResponse` de formato libre. Este `payloadResponse` es devuelto tal cual por la FSM, permitiendo al diseñador de la conversación especificar exactamente qué información (ej: prompts, ganchos de API, datos para UI, herramientas a usar) debe recibir la aplicación cliente para cada estado.
*   **Persistencia de Sesión**: Utiliza Redis para almacenar el estado actual de cada conversación (`currentStateId`) y todos los parámetros acumulados (`collectedParameters`). Cada sesión se identifica con un `sessionId`.
*   **Interfaz API RESTful**: Expone un endpoint (`POST /fsm/:sessionId`). Acepta `intent` y `parameters` nuevos. Devuelve el `nextStateId`, los `parametersToCollect` para el nuevo estado, el `payloadResponse` completo definido para ese `nextStateId`, y la totalidad de `collectedParameters` (fusión de los parámetros de sesión y los nuevos).
*   **Integración con Asterisk ARI**: Incluye un módulo para conectar con Asterisk ARI. La FSM puede así guiar flujos de llamadas, con el `payloadResponse` proveyendo la información necesaria para las acciones ARI.
*   **Manejo de Intenciones**: Las intenciones del usuario o del sistema pueden dirigir el flujo a estados diferentes, independientemente de la recolección de parámetros.
*   **Modularidad**: El código está estructurado en módulos con responsabilidades claras:
    *   Carga de configuración (`configLoader.js`)
    *   Lógica de la FSM (`fsm.js`)
    *   Cliente Redis (`redisClient.js`)
    *   Servidor API (`apiServer.js`)
    *   Cliente ARI (`ariClient.js`)
    *   Punto de entrada (`index.js`)

## Funcionalidad Detallada

Cuando una interacción ocurre (ya sea una solicitud API o un evento en una llamada ARI):

1.  Se identifica o crea una **sesión** para el usuario/llamada, almacenada en Redis.
2.  Se provee el **estado actual** (recuperado de la sesión), la **intención** del usuario (si la hay) y los **parámetros** que se hayan podido recoger en la última interacción.
3.  La **FSM procesa** esta entrada:
    *   Evalúa si la intención actual implica una transición a un flujo diferente.
    *   Si no hay una intención prioritaria, verifica si los parámetros recolectados cumplen las condiciones para avanzar al siguiente estado definido.
    *   Actualiza el estado de la sesión en Redis (importante: `sessionData.parameters` ahora contiene la fusión de los parámetros de sesión anteriores y los parámetros recién llegados en la solicitud).
4.  La FSM **devuelve**:
    *   `nextStateId`: Identificador del nuevo estado de la conversación.
    *   `parametersToCollect`: Un objeto indicando qué parámetros son `required` y `optional` para el nuevo estado, y que aún no han sido proporcionados.
    *   `payloadResponse`: El objeto completo definido en el campo `payloadResponse` del estado de destino en `config/states.json`. La FSM lo devuelve tal cual, permitiendo flexibilidad total en su contenido (puede incluir `apiHooks`, `prompts`, `tools`, etc.).
    *   `collectedParameters`: Un objeto con **todos** los parámetros acumulados durante la sesión, incluyendo los que se recibieron en la solicitud actual y los que ya estaban en Redis.

## Escenario de Ejemplo: Agendamiento de Cita

1.  **Inicio**: El usuario interactúa. La FSM se inicializa en el estado "1\_welcome\_and\_age".
    *   Respuesta FSM (simplificada): `nextStateId: "1_welcome_and_age"`, `parametersToCollect: { required: ["patient_age"] }`, `payloadResponse: { customInstructions: "...", uiHints: {...}, apiHooks: { onEnterState: ["api_log_interaction_start"], ... } }`, `collectedParameters: {}`.
2.  **Usuario provee edad**: El sistema recolecta la edad (`patient_age: 30`).
    *   Entrada FSM: `intent: null`, `parameters: { "patient_age": 30 }`.
    *   Respuesta FSM: `nextStateId: "2_get_patient_id"`, `parametersToCollect: { required: ["patient_id_number"] }`, `payloadResponse: { prompts: {...}, apiHooks: { ... } }`, `collectedParameters: { "patient_age": 30 }`.
3.  **Usuario provee cédula**: El sistema recolecta la cédula (`patient_id_number: "123"`).
    *   Entrada FSM: `intent: null`, `parameters: { "patient_id_number": "123" }`.
    *   Respuesta FSM: `nextStateId: "3_get_specialty"`, etc., con su `payloadResponse`, y `collectedParameters: { "patient_age": 30, "patient_id_number": "123" }`.
4.  **Usuario cambia de intención**: En cualquier momento, el usuario podría indicar "quiero hablar con un agente".
    *   Entrada FSM: `intent: "request_human_agent"`, `parameters: {}` (o los que se tuvieran).
    *   Respuesta FSM: `nextStateId: "99_transfer_to_human"`, `parametersToCollect: {}`, `payloadResponse: { transferMessage: "...", apiHooks: { ... } }`, `collectedParameters: { "patient_age": 30, "patient_id_number": "123" }` (se mantienen los parámetros recolectados hasta el momento del cambio de intención).

## Configuración y Ejecución

*   **Dependencias**: `express`, `ioredis`, `ari-client`, `dotenv` (listadas en `package.json`).
*   **Configuración de Estados**: Definida en `config/states.json`.
*   **Servicios Externos**: Requiere una instancia de Redis accesible. Si se usa ARI (y `ENABLE_ARI="true"`), un servidor Asterisk configurado para ARI.
*   **Variables de Entorno**:
    *   El proyecto utiliza la librería `dotenv` para cargar automáticamente variables de entorno desde un archivo `.env` ubicado en la raíz del proyecto.
    *   Se proporciona un archivo `.env.example` como plantilla. Copie este archivo a `.env` y modifique los valores según su configuración local.
    *   **Variables Clave en `.env`**:
        *   `ENABLE_API`: Controla si se inicia el servidor API (`true` por defecto).
    *   `ENABLE_ARI`: Controla si se inicia la conexión ARI (`true` por defecto).
    *   `PORT`: Puerto para el servidor API (defecto: 3000, relevante si `ENABLE_API="true"`).
    *   `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`: Para la conexión a Redis.
    *   `ARI_APP_NAME`, `ARI_USERNAME`, `ARI_PASSWORD`, `ARI_URL`: Para la conexión ARI (relevante si `ENABLE_ARI="true"`).

Para ejecutar (asumiendo que las dependencias están instaladas y los servicios configurados):

```bash
npm start
```

## Nota Importante

Este proyecto fue desarrollado con la restricción de **no instalar dependencias** directamente en el entorno de desarrollo del agente AI. Solo se han registrado en `package.json`. La instalación y configuración completa del entorno de ejecución (Node.js, Redis, Asterisk, y las `npm install`) es responsabilidad del usuario final.
