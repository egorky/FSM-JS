const fs = require('fs');
const path = require('path');

const STATE_CONFIG_PATH = path.join(__dirname, '..', 'config', 'states.json');

let stateConfiguration = null;

/**
 * Carga la configuración de estados desde el archivo JSON.
 * @returns {object} La configuración de estados.
 * @throws {Error} Si el archivo de configuración no se encuentra o no es un JSON válido.
 */
function loadStateConfig() {
  if (stateConfiguration) {
    return stateConfiguration;
  }

  try {
    if (!fs.existsSync(STATE_CONFIG_PATH)) {
      throw new Error(`El archivo de configuración de estados no se encontró en: ${STATE_CONFIG_PATH}`);
    }
    const rawConfig = fs.readFileSync(STATE_CONFIG_PATH, 'utf-8');
    stateConfiguration = JSON.parse(rawConfig);

    // Validaciones básicas de la estructura
    if (!stateConfiguration.initialState || typeof stateConfiguration.initialState !== 'string') {
      throw new Error("La configuración de estados debe tener un 'initialState' de tipo string.");
    }
    if (!stateConfiguration.states || typeof stateConfiguration.states !== 'object' || Object.keys(stateConfiguration.states).length === 0) {
      throw new Error("La configuración de estados debe tener un objeto 'states' no vacío.");
    }
    if (!stateConfiguration.states[stateConfiguration.initialState]) {
        throw new Error(`El 'initialState' ("${stateConfiguration.initialState}") no existe en la definición de 'states'.`);
    }

    console.log('Configuración de estados cargada exitosamente.');
    return stateConfiguration;
  } catch (error) {
    console.error('Error al cargar la configuración de estados:', error);
    // En un escenario real, podrías querer que la aplicación falle si no puede cargar la configuración.
    // Por ahora, lanzamos el error para que se maneje más arriba o se detenga la app.
    throw error;
  }
}

/**
 * Obtiene la configuración de un estado específico por su ID.
 * @param {string} stateId El ID del estado a obtener.
 * @returns {object | undefined} El objeto de configuración del estado o undefined si no se encuentra.
 */
function getStateById(stateId) {
  const config = loadStateConfig();
  return config.states[stateId];
}

/**
 * Obtiene el ID del estado inicial.
 * @returns {string} El ID del estado inicial.
 */
function getInitialStateId() {
  const config = loadStateConfig();
  return config.initialState;
}

module.exports = {
  loadStateConfig,
  getStateById,
  getInitialStateId,
};
