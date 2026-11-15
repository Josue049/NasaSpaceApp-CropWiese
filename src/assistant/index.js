'use strict';
/** Ensambla Fieldi: configuración (.env), almacén en memoria, limitador, herramientas y cliente de Groq (SDK oficial, solo servidor). */
const { getConfig, loadDotEnv, isConfigured } = require('./config');
const { Store, RateLimiter } = require('./store');
const { createTools } = require('./tools');
const { createGroqClient } = require('./groqClient');
const { AssistantService } = require('./chat');

/**
 * @param {{ env?: object, runSimulation?: Function, groq?: object|null, log?: Function, loadEnvFile?: boolean }} opts
 *   `groq` solo se inyecta en pruebas (doble del cliente); en producción se crea con el SDK oficial si hay clave.
 */
function createAssistant({ env = process.env, runSimulation, groq, log, loadEnvFile = false } = {}) {
  if (loadEnvFile) loadDotEnv(undefined, env);
  const cfg = getConfig(env), store = new Store(), limiter = new RateLimiter();
  const client = groq !== undefined ? groq : (isConfigured(cfg) ? createGroqClient(cfg, { log }) : null);
  const tools = createTools({ runSimulation });
  const service = new AssistantService({ cfg, store, limiter, groq: client, tools, log });
  return { cfg, store, limiter, tools, service };
}

module.exports = { createAssistant };
