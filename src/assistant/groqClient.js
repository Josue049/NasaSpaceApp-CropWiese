'use strict';
/**
 * Envoltorio mínimo sobre el SDK oficial `groq-sdk`. Solo se ejecuta en el servidor.
 * - Normaliza la respuesta y traduce los errores del SDK a códigos propios (sin exponer detalles ni la clave).
 * - Registra solo metadatos técnicos (código, estado HTTP, duración): jamás el contenido de la conversación ni claves.
 */
class AssistantError extends Error {
  constructor(code, message, { http = 502, retryAfter = null } = {}) { super(message); this.name = 'AssistantError'; this.code = code; this.http = http; this.retryAfter = retryAfter; }
}

const MESSAGES = {
  auth: 'La clave de Groq no es válida o no tiene permiso. Revisa GROQ_API_KEY en el servidor.',
  rate_limit: 'Groq está limitando las solicitudes. Intenta de nuevo en unos instantes.',
  timeout: 'Groq tardó demasiado en responder. Intenta de nuevo.',
  connection: 'No se pudo conectar con Groq. Revisa la conexión del servidor e intenta de nuevo.',
  model_not_found: 'El modelo configurado no está disponible en tu cuenta de Groq. Cambia GROQ_MODEL.',
  bad_request: 'Groq rechazó la solicitud (modelo o parámetros no admitidos).',
  server: 'Groq tuvo un problema interno. Intenta de nuevo en unos minutos.',
  unknown: 'Error inesperado al consultar a Groq.',
};

/** Traduce un error del SDK a AssistantError (por clase y, si no, por estado HTTP). */
function mapError(e, Sdk) {
  if (e instanceof AssistantError) return e;
  const is = (n) => Sdk && Sdk[n] && e instanceof Sdk[n];
  const st = e && e.status;
  const ra = (() => { const h = e && e.headers; const v = h && (typeof h.get === 'function' ? h.get('retry-after') : h['retry-after']); const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), 3600) : null; })();
  if (is('APIConnectionTimeoutError') || (e && /timed? ?out/i.test(String(e.name || '') + String(e.message || '')) && st == null)) return new AssistantError('timeout', MESSAGES.timeout, { http: 504 });
  if (is('APIUserAbortError')) return new AssistantError('timeout', MESSAGES.timeout, { http: 504 });
  if (is('AuthenticationError') || is('PermissionDeniedError') || st === 401 || st === 403) return new AssistantError('auth', MESSAGES.auth, { http: 502 });
  if (is('RateLimitError') || st === 429) return new AssistantError('rate_limit', MESSAGES.rate_limit, { http: 429, retryAfter: ra });
  if (is('NotFoundError') || st === 404) return new AssistantError('model_not_found', MESSAGES.model_not_found, { http: 502 });
  if (is('BadRequestError') || is('UnprocessableEntityError') || st === 400 || st === 422) return new AssistantError('bad_request', MESSAGES.bad_request, { http: 502 });
  if (is('InternalServerError') || (st >= 500 && st < 600)) return new AssistantError('server', MESSAGES.server, { http: 502 });
  if (is('APIConnectionError') || (st == null && e && /connect|fetch|network|ECONN|ENOTFOUND/i.test(String(e.message || '') + String(e.code || '')))) return new AssistantError('connection', MESSAGES.connection, { http: 502 });
  return new AssistantError('unknown', MESSAGES.unknown, { http: 502 });
}

/**
 * @param {object} cfg  de config.getConfig()
 * @param {{ sdk?: any, log?: (o:object)=>void }} [opts]  `sdk` solo se inyecta en pruebas (módulo con la forma de groq-sdk)
 */
function createGroqClient(cfg, opts = {}) {
  const Sdk = opts.sdk || require('groq-sdk');
  const Groq = Sdk.default || Sdk.Groq || Sdk;
  const log = opts.log || ((o) => console.error('[fieldi]', JSON.stringify(o)));
  let client = null;
  const get = () => (client ||= new Groq({ apiKey: cfg.apiKey, timeout: cfg.timeoutMs, maxRetries: 1 }));

  return {
    /** Una vuelta de chat. Devuelve { content, tool_calls:[{id,name,arguments}], finish_reason, usage }. */
    async chat({ messages, tools, toolChoice }) {
      const t0 = Date.now();
      const body = { model: cfg.model, messages, temperature: cfg.temperature, max_completion_tokens: cfg.maxOutputTokens };
      if (tools && tools.length) { body.tools = tools; body.tool_choice = toolChoice || 'auto'; body.parallel_tool_calls = false; }
      if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
      try {
        const r = await get().chat.completions.create(body);
        const m = r && r.choices && r.choices[0] && r.choices[0].message || {};
        return {
          content: typeof m.content === 'string' ? m.content : '',
          tool_calls: (m.tool_calls || []).map((c) => ({ id: c.id, name: c.function && c.function.name, arguments: c.function && c.function.arguments })),
          finish_reason: r && r.choices && r.choices[0] && r.choices[0].finish_reason || null,
          usage: r && r.usage ? { prompt: r.usage.prompt_tokens, completion: r.usage.completion_tokens } : null,
        };
      } catch (e) {
        const ae = mapError(e, Sdk);
        log({ event: 'groq_error', code: ae.code, status: e && e.status || null, ms: Date.now() - t0, model: cfg.model });
        throw ae;
      }
    },
    /** Comprueba (sin generar texto) que la clave es válida y que el modelo configurado existe en la cuenta. */
    async checkModel() {
      try {
        const r = await get().models.list();
        const ids = (r && r.data || []).map((m) => m.id);
        return { reachable: true, model_available: ids.includes(cfg.model) };
      } catch (e) { const ae = mapError(e, Sdk); log({ event: 'groq_status_error', code: ae.code, status: e && e.status || null }); return { reachable: false, error_code: ae.code }; }
    },
  };
}

module.exports = { createGroqClient, mapError, AssistantError, MESSAGES };
