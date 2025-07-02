const { getStateById, getInitialStateId } = require('./configLoader');
const redisClient = require('./redisClient'); // Asumimos que este módulo existe

const FSM_SESSION_PREFIX = 'fsm_session:';

/**
 * Inicializa una nueva sesión de FSM o recupera una existente.
 * @param {string} sessionId ID único para la sesión de conversación.
 * @returns {Promise<object>} El estado actual de la FSM para la sesión.
 *                            { currentStateId: string, parameters: object, history: array }
 */
async function initializeOrRestoreSession(sessionId) {
  const sessionKey = `${FSM_SESSION_PREFIX}${sessionId}`;
  let sessionData = await redisClient.get(sessionKey);

  if (sessionData) {
    return JSON.parse(sessionData);
  } else {
    const initialStateId = getInitialStateId();
    const initialSession = {
      currentStateId: initialStateId,
      parameters: {}, // Parámetros recolectados
      history: [initialStateId], // Historial de estados visitados
    };
    await redisClient.set(sessionKey, JSON.stringify(initialSession));
    return initialSession;
  }
}

/**
 * Procesa una entrada para la FSM.
 * @param {string} sessionId ID de la sesión.
 * @param {string} [intent] La intención detectada del usuario (opcional).
 * @param {object} [inputParameters] Parámetros proporcionados en esta interacción (ej: { "age": 30 }).
 * @returns {Promise<object>} Un objeto con:
 *                            - nextStateId: El ID del nuevo estado.
 *                            - parametersToCollect: Parámetros requeridos/opcionales del nuevo estado.
 *                            - apisToCall: APIs a llamar para el nuevo estado.
 *                            - sessionData: Datos actualizados de la sesión.
 */
async function processInput(sessionId, intent, inputParameters = {}) {
  const sessionKey = `${FSM_SESSION_PREFIX}${sessionId}`;
  let sessionData = await initializeOrRestoreSession(sessionId);
  let currentStateId = sessionData.currentStateId;
  let currentParameters = { ...sessionData.parameters, ...inputParameters }; // Merge con nuevos parámetros

  const currentStateConfig = getStateById(currentStateId);
  if (!currentStateConfig) {
    throw new Error(`Configuración no encontrada para el estado: ${currentStateId}`);
  }

  let nextStateId = null;
  let matchedTransition = false;

  // 1. Evaluar transiciones basadas en intención (tienen prioridad)
  if (intent && currentStateConfig.transitions && currentStateConfig.transitions.length > 0) {
    for (const transition of currentStateConfig.transitions) {
      if (transition.condition && transition.condition.intent === intent) {
        // Aquí podríamos añadir lógica más compleja para la condición de intención si fuera necesario
        // Por ejemplo, si la condición también depende de ciertos parámetros + la intención.
        // Por ahora, si la intención coincide, se transita.
        nextStateId = transition.nextState;
        matchedTransition = true;
        break;
      }
    }
  }

  // 2. Si no hay transición por intención, evaluar transiciones basadas en parámetros
  if (!matchedTransition && currentStateConfig.transitions && currentStateConfig.transitions.length > 0) {
    for (const transition of currentStateConfig.transitions) {
      if (transition.condition) {
        if (typeof transition.condition.allParametersMet === 'undefined' || transition.condition.allParametersMet) {
          const requiredParams = currentStateConfig.parameters?.required || [];
          const allRequiredMet = requiredParams.every(param => currentParameters.hasOwnProperty(param) && currentParameters[param] !== null && currentParameters[param] !== '');
          if (allRequiredMet) {
            nextStateId = transition.nextState;
            matchedTransition = true;
            break;
          }
        } else if (transition.condition.allParametersMet === false && !transition.condition.intent) {
            // Transición explícita que no requiere todos los parámetros y no es por intención (caso raro, pero posible)
            nextStateId = transition.nextState;
            matchedTransition = true;
            break;
        }
      }
    }
  }

  // 3. Si no hay transición específica y se cumplen los parámetros requeridos, usar defaultNextState
  if (!matchedTransition && currentStateConfig.defaultNextState) {
    const requiredParams = currentStateConfig.parameters?.required || [];
    const allRequiredMet = requiredParams.every(param => currentParameters.hasOwnProperty(param) && currentParameters[param] !== null && currentParameters[param] !== '');
    if (allRequiredMet) {
      nextStateId = currentStateConfig.defaultNextState;
    }
  }

  // 4. Si no hay cambio de estado, permanecemos en el actual
  if (!nextStateId) {
    nextStateId = currentStateId;
  }

  // Actualizar sesión
  sessionData.currentStateId = nextStateId;
  sessionData.parameters = currentParameters; // Guardar todos los parámetros acumulados
  if (nextStateId !== currentStateId) {
    sessionData.history.push(nextStateId);
  }
  await redisClient.set(sessionKey, JSON.stringify(sessionData));

  const nextStateConfig = getStateById(nextStateId);
  if (!nextStateConfig) {
    throw new Error(`Configuración no encontrada para el siguiente estado: ${nextStateId}`);
  }

  // Determinar parámetros a recolectar para el nuevo estado
  // Estos son los parámetros que el nuevo estado define, menos los que ya tenemos.
  const collectedParametersForNextState = {};
  const requiredForNext = nextStateConfig.parameters?.required || [];
  const optionalForNext = nextStateConfig.parameters?.optional || [];

  const parametersToCollect = {
      required: requiredForNext.filter(p => !currentParameters.hasOwnProperty(p) || currentParameters[p] === null || currentParameters[p] === ''),
      optional: optionalForNext.filter(p => !currentParameters.hasOwnProperty(p) || currentParameters[p] === null || currentParameters[p] === '')
  };

  return {
    nextStateId: nextStateId,
    currentStateConfig: currentStateConfig, // Estado desde el que se partió para esta transición
    nextStateConfig: nextStateConfig,       // Estado al que se llegó
    parametersToCollect: parametersToCollect,
    apisToCall: nextStateConfig.apisToCall || [],
    sessionData: sessionData, // Devuelve el estado completo de la sesión actualizado
  };
}

module.exports = {
  initializeOrRestoreSession,
  processInput,
};
