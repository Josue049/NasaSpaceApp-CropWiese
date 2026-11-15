'use strict';
/**
 * Configuración del asistente Fieldi. TODO viene de variables de entorno (backend); ningún secreto llega al navegador.
 *   GROQ_API_KEY             clave de Groq (sin ella el asistente funciona en modo limitado, sin IA)
 *   GROQ_MODEL               modelo (por defecto openai/gpt-oss-120b); se puede cambiar sin tocar código
 *   GROQ_TIMEOUT_MS          tiempo de espera por solicitud (1 000–120 000)
 *   GROQ_MAX_OUTPUT_TOKENS   máximo de tokens de salida (100–8 000)
 *   GROQ_REASONING_EFFORT    opcional: low | medium | high (solo modelos que lo admiten, p. ej. gpt-oss)
 */
const fs = require('fs');
const path = require('path');

/** Carga `.env` (si existe) sin sobrescribir variables ya definidas. Parser mínimo: KEY=VALUE, comentarios con #. */
function loadDotEnv(file = path.join(__dirname, '..', '..', '.env'), env = process.env) {
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch { return false; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/); if (!m || line.trim().startsWith('#')) continue;
    let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = v;
  }
  return true;
}

const int = (x, d, lo, hi) => { const n = Number.parseInt(x, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const PLACEHOLDER = /^(|tu[_-]?clave.*|your[_-]?key.*|changeme|xxx+|<.*>)$/i;

function getConfig(env = process.env) {
  const key = String(env.GROQ_API_KEY || '').trim();
  const effort = String(env.GROQ_REASONING_EFFORT || '').trim().toLowerCase();
  return {
    apiKey: PLACEHOLDER.test(key) ? '' : key,
    model: String(env.GROQ_MODEL || '').trim() || 'openai/gpt-oss-120b',
    timeoutMs: int(env.GROQ_TIMEOUT_MS, 30000, 1000, 120000),
    maxOutputTokens: int(env.GROQ_MAX_OUTPUT_TOKENS, 1200, 100, 8000),
    reasoningEffort: ['low', 'medium', 'high'].includes(effort) ? effort : null,
    temperature: 0.3,               // la guía de Groq recomienda 0,0–0,5 para tool calling
    maxToolIterations: 4,           // vueltas máximas modelo → herramientas → modelo
    toolTimeoutMs: 15000,           // tiempo máximo de una herramienta (la simulación puede consultar caché y recalcular)
    maxToolCallsPerTurn: 6,
    messageMaxChars: 1000,
    historyMaxMessages: 12,         // mensajes (usuario/asistente) que se reenvían a Groq
    historyMaxChars: 9000,
    rate: { perSessionPerMin: 12, perSessionPerDay: 150, perIpPerMin: 40 },
  };
}

const isConfigured = (cfg) => !!cfg.apiKey;

/** Estado público: NUNCA incluye la clave ni parte de ella. */
function publicConfig(cfg) { return { configured: isConfigured(cfg), model: cfg.model, timeout_ms: cfg.timeoutMs, max_output_tokens: cfg.maxOutputTokens, reasoning_effort: cfg.reasoningEffort }; }

module.exports = { getConfig, loadDotEnv, isConfigured, publicConfig };
