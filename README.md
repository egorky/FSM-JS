# Node.js FSM Service para Agendamiento Virtual

Este proyecto implementa una Máquina de Estados Finitos (FSM) utilizando Node.js. Está diseñada para gestionar flujos de conversación, como el agendamiento de citas, y puede ser integrada a través de una API RESTful o mediante Asterisk ARI para interacciones telefónicas.

## Características Principales

*   **Motor de FSM Configurable**: La lógica de los estados, transiciones, parámetros a recolectar y APIs a invocar (en diferentes puntos del ciclo de vida del estado) se define en un archivo JSON externo (`config/states.json`). Esto permite flexibilidad para adaptar el flujo conversacional sin modificar el código fuente principal.
*   **Persistencia de Sesión**: Utiliza Redis para almacenar el estado actual de cada conversación (sesión), permitiendo retomar interacciones o manejar múltiples conversaciones concurrentemente. Cada sesión se identifica con un `sessionId`.
*   **Interfaz API RESTful**: Expone un endpoint (`POST /fsm/:sessionId`) que acepta el estado actual (implícito en el `sessionId`), una posible `intención` del usuario y los `parámetros` recolectados. Devuelve el siguiente estado, los parámetros que faltan por recoger para el nuevo estado y un objeto `apiHooks` que detalla las APIs a invocar en diferentes etapas (ej: al entrar al estado, antes de recolectar parámetros).
*   **Integración con Asterisk ARI**: Incluye un módulo para conectar con Asterisk a través de ARI. Esto permite que la FSM controle flujos de llamadas telefónicas, recibiendo información (como DTMF, que se traduciría a parámetros o intenciones) y dictando acciones (como reproducir audios), utilizando la información de `apiHooks` para guiar las interacciones o logging.
*   **Manejo de Intenciones**: El sistema está diseñado para que una `intención` del usuario (ej: "quiero hablar con un humano", "cancelar cita") pueda cambiar el flujo de la conversación, saltando a estados diferentes de los predefinidos en una secuencia lineal.
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
    *   Actualiza el estado de la sesión en Redis.
4.  La FSM **devuelve**:
    *   El `nextStateId`: Identificador del nuevo estado de la conversación.
    *   `parametersToCollect`: Un objeto indicando qué parámetros son `required` y `optional` para el nuevo estado, y que aún no han sido proporcionados.
    *   `apiHooks`: Un objeto que contiene diferentes arrays de identificadores de APIs, categorizados por el momento en que deberían ser invocados por el sistema cliente (ej: `onEnterState`, `beforeCollectingParameters`, `afterParametersCollected`). La FSM solo indica *qué* APIs llamar y *cuándo* (conceptualmente), no las ejecuta directamente.

## Escenario de Ejemplo: Agendamiento de Cita

1.  **Inicio**: El usuario interactúa. La FSM se inicializa en el estado "1\_welcome\_and\_age".
    *   Respuesta FSM (simplificada): `nextStateId: "1_welcome_and_age"`, `parametersToCollect: { required: ["patient_age"] }`, `apiHooks: { onEnterState: ["api_log_interaction_start"], beforeCollectingParameters: ["api_fetch_age_prompt_variations"], ... }`.
2.  **Usuario provee edad**: El sistema recolecta la edad.
    *   Entrada FSM: `intent: null`, `parameters: { "patient_age": 30 }`. La FSM procesa esto, ejecuta internamente el hook `afterParametersCollected` (ej: `api_check_age_eligibility`).
    *   Respuesta FSM: `nextStateId: "2_get_patient_id"`, `parametersToCollect: { required: ["patient_id_number"] }`, `apiHooks: { onEnterState: ["api_log_enter_get_id_state"], ... }`.
3.  **Usuario provee cédula**:
    *   Entrada FSM: `intent: null`, `parameters: { "patient_id_number": "123456789" }`.
    *   Respuesta FSM: `nextStateId: "3_get_specialty"`, etc., con sus respectivos `apiHooks`.
4.  **Usuario cambia de intención**: En cualquier momento, el usuario podría indicar "quiero hablar con un agente".
    *   Entrada FSM: `intent: "request_human_agent"`, `parameters: { ... }`.
    *   Respuesta FSM: `nextStateId: "99_transfer_to_human"`, `parametersToCollect: {}`, `apiHooks: { onEnterState: ["api_initiate_transfer_to_human_agent", ... ] }`.

## Configuración y Ejecución (Teórica)

*   **Dependencias**: `express`, `ioredis`, `ari-client` (listadas en `package.json`).
*   **Configuración de Estados**: Definida en `config/states.json`.
*   **Servicios Externos**: Requiere una instancia de Redis accesible. Si se usa ARI (y `ENABLE_ARI="true"`), un servidor Asterisk configurado para ARI.
*   **Archivo `.env.example`**: Se proporciona un archivo `.env.example` con todas las variables de entorno configurables. Se recomienda copiarlo a `.env` y ajustar los valores.
*   **Variables de Entorno Clave**:
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
