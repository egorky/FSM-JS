/**
 * Resuelve el valor de un parámetro, que puede ser una referencia a collectedParameters
 * o un literal.
 * @param {string|number|boolean} arg El argumento a resolver.
 * @param {object} parameters El objeto collectedParameters.
 * @returns {*} El valor resuelto.
 */
function resolveArgument(arg, parameters) {
  console.log(`TEMPLATE_PROCESSOR_DEBUG: resolveArgument received - arg: [${arg}] (type: ${typeof arg})`);
  console.log(`TEMPLATE_PROCESSOR_DEBUG: resolveArgument parameters context: ${JSON.stringify(parameters)}`);
  if (typeof arg === 'string') {
    // Es un literal string si está entre comillas (simples o dobles)
    if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
      return arg.substring(1, arg.length - 1);
    }
    // Si no, es una referencia a un parámetro
    return parameters.hasOwnProperty(arg) ? parameters[arg] : undefined;
  }
  // Si es número o booleano, se devuelve tal cual
  return arg;
}

const PREDEFINED_FUNCTIONS = {
  default: (value, defaultValue) => {
    console.log(`TEMPLATE_PROCESSOR_DEBUG: default received - value: [${value}] (type: ${typeof value}), defaultValue: [${defaultValue}]`);
    return (value !== null && value !== undefined && value !== '') ? value : defaultValue;
  },
  toUpperCase: (str) => {
    console.log(`TEMPLATE_PROCESSOR_DEBUG: toUpperCase received - str: [${str}] (type: ${typeof str})`);
    return (str !== null && str !== undefined) ? String(str).toUpperCase() : '';
  },
  toLowerCase: (str) => {
    console.log(`TEMPLATE_PROCESSOR_DEBUG: toLowerCase received - str: [${str}] (type: ${typeof str})`);
    return (str !== null && str !== undefined) ? String(str).toLowerCase() : '';
  },
  capitalize: (str) => {
    console.log(`TEMPLATE_PROCESSOR_DEBUG: capitalize received - str: [${str}] (type: ${typeof str})`);
    if (str === null || str === undefined || str === '') return '';
    const s = String(str);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },
  formatNumber: (num, decimalPlaces = 2) => {
    console.log(`TEMPLATE_PROCESSOR_DEBUG: formatNumber received - num: [${num}], decimalPlaces: [${decimalPlaces}]`);
    const n = parseFloat(num);
    if (isNaN(n)) return '[ERROR: formatNumber espera un número]';
    const dp = parseInt(decimalPlaces, 10);
    if (isNaN(dp) || dp < 0) return '[ERROR: formatNumber espera un número positivo de decimales]';
    return n.toFixed(dp);
  },
  add: (...nums) => {
    return nums.reduce((sum, num) => {
      const n = parseFloat(num);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  },
  subtract: (num1, num2) => {
    const n1 = parseFloat(num1);
    const n2 = parseFloat(num2);
    if (isNaN(n1) || isNaN(n2)) return '[ERROR: subtract espera dos números]';
    return n1 - n2;
  },
};

/**
 * Procesa un string de plantilla, reemplazando placeholders y ejecutando funciones.
 * @param {string} text El string de plantilla.
 * @param {object} parameters El objeto collectedParameters.
 * @returns {string} El string procesado.
 */
function renderString(text, parameters) {
  if (typeof text !== 'string') return text;

  let processedText = text;

  // 1. Reemplazar placeholders de fecha/hora
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  processedText = processedText.replace(/\{\{current_date\}\}/g, `${year}-${month}-${day}`);
  processedText = processedText.replace(/\{\{current_time\}\}/g, `${hours}:${minutes}:${seconds}`);
  processedText = processedText.replace(/\{\{current_datetime\}\}/g, `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);

  // 2. Reemplazar placeholders de funciones {{functionName(arg1, 'literal', arg3)}}
  processedText = processedText.replace(/\{\{([a-zA-Z0-9_]+)\(([^)]*)\)\}\}/g, (match, functionName, argsString) => {
    if (PREDEFINED_FUNCTIONS.hasOwnProperty(functionName)) {
      try {
        const args = [];
        if (argsString.trim() !== '') {
          console.log(`TEMPLATE_PROCESSOR_DEBUG: Parsing function args for ${functionName} from string: "${argsString}"`);
          // Regex para parsear argumentos:
          // - Parámetros (identificadores)
          // - Strings literales (entre comillas simples o dobles)
          // - Números (enteros o decimales)
          // - Booleanos (true/false)
          const argRegex = /(?:([a-zA-Z_][a-zA-Z0-9_]*)|"([^"]*)"|'([^']*)'|([0-9]+\.?[0-9]*)|(true|false))/g;
          let argMatch;
          while((argMatch = argRegex.exec(argsString)) !== null) {
            if (argMatch[1] !== undefined) args.push(argMatch[1]); // Parámetro
            else if (argMatch[2] !== undefined) args.push(`"${argMatch[2]}"`); // String literal (dobles)
            else if (argMatch[3] !== undefined) args.push(`'${argMatch[3]}'`); // String literal (simples)
            else if (argMatch[4] !== undefined) args.push(parseFloat(argMatch[4])); // Número
            else if (argMatch[5] !== undefined) args.push(argMatch[5].toLowerCase() === 'true'); // Booleano
          }
        }

        const resolvedArgs = args.map(arg => resolveArgument(arg, parameters));
        const result = PREDEFINED_FUNCTIONS[functionName](...resolvedArgs);
        return (result !== undefined && result !== null) ? String(result) : '';
      } catch (e) {
        console.error(`TemplateProcessor: Error ejecutando función '${functionName}' con args '${argsString}':`, e.message);
        return `[ERROR: ${functionName} - ${e.message}]`;
      }
    }
    // Si la función no es conocida pero el patrón {{func(...)} existe, devolvemos el match original para no romper el string
    // o un string de error más específico. Por ahora, devolvemos un error indicativo.
    return `[ERROR: Función desconocida '${functionName}']`;
  });

  // 3. Reemplazar placeholders de parámetros {{paramName}}
  // Este regex es más simple y solo captura identificadores válidos.
  processedText = processedText.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match, paramName) => {
    if (parameters.hasOwnProperty(paramName) && parameters[paramName] !== null && parameters[paramName] !== undefined) {
      return String(parameters[paramName]); // Asegurar que sea string
    }
    return ''; // Parámetro no encontrado o es null/undefined
  });

  return processedText;
}

/**
 * Procesa recursivamente una plantilla (string, array u objeto)
 * @param {*} template La plantilla a procesar.
 * @param {object} parameters El objeto collectedParameters.
 * @returns {*} La plantilla procesada.
 */
function processTemplate(template, parameters) {
  if (typeof template === 'string') {
    return renderString(template, parameters);
  }
  if (Array.isArray(template)) {
    return template.map(item => processTemplate(item, parameters));
  }
  if (typeof template === 'object' && template !== null) {
    const result = {};
    for (const key in template) {
      if (template.hasOwnProperty(key)) {
        result[key] = processTemplate(template[key], parameters);
      }
    }
    return result;
  }
  // Devolver otros tipos de datos (números, booleanos, null) tal cual
  return template;
}

module.exports = { processTemplate };
