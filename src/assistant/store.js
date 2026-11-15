'use strict';
/**
 * Almacén EN MEMORIA de análisis y conversaciones por sesión. Sin persistencia en disco: se pierde al reiniciar el servidor
 * y caduca por inactividad. Un análisis solo es accesible desde la sesión (cookie HttpOnly) que lo generó: el navegador no puede
 * pedir el análisis de otra sesión indicando un identificador.
 */
const crypto = require('crypto');

const TTL_MS = 2 * 3600 * 1000, MAX_SESSIONS = 300, MAX_ANALYSES = 3;
const SID_RE = /^[a-f0-9]{32}$/;

class Store {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.sessions = new Map(); }
  static newSessionId() { return crypto.randomBytes(16).toString('hex'); }
  static validSessionId(s) { return typeof s === 'string' && SID_RE.test(s); }

  session(sid) {
    this.sweep();
    let s = this.sessions.get(sid);
    if (!s) {
      if (this.sessions.size >= MAX_SESSIONS) { const oldest = [...this.sessions.entries()].sort((a, b) => a[1].touched - b[1].touched)[0]; if (oldest) this.sessions.delete(oldest[0]); }
      s = { analyses: [], activeId: null, chat: [], lastChatAnalysisId: null, touched: this.now() };
      this.sessions.set(sid, s);
    }
    s.touched = this.now();
    return s;
  }
  sweep() { const t = this.now(); for (const [k, s] of this.sessions) if (t - s.touched > TTL_MS) this.sessions.delete(k); }

  /** Registra un análisis y lo deja como activo. Devuelve su identificador (UUID aleatorio, solo válido en esta sesión). */
  put(sid, input, result) {
    const s = this.session(sid), id = crypto.randomUUID();
    s.analyses.push({ id, created_at: new Date(this.now()).toISOString(), input: JSON.parse(JSON.stringify(input)), result });
    while (s.analyses.length > MAX_ANALYSES) s.analyses.shift();
    s.activeId = id;
    return id;
  }
  active(sid) { const s = this.sessions.get(sid); if (!s) return null; s.touched = this.now(); return s.analyses.find((a) => a.id === s.activeId) || null; }
  get(sid, id) { const s = this.sessions.get(sid); return s ? s.analyses.find((a) => a.id === id) || null : null; }
  chat(sid) { return this.session(sid); }
  resetChat(sid) { const s = this.sessions.get(sid); if (s) { s.chat = []; s.lastChatAnalysisId = null; } }
}

/** Limitador de solicitudes de ventana deslizante. */
class RateLimiter {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.hits = new Map(); }
  /** @returns {{ok:boolean, retryAfter:number}} */
  check(key, max, windowMs) {
    const t = this.now(), arr = (this.hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= max) { this.hits.set(key, arr); return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (t - arr[0])) / 1000)) }; }
    arr.push(t); this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.length || t - v[v.length - 1] > 24 * 3600 * 1000) this.hits.delete(k);
    return { ok: true, retryAfter: 0 };
  }
}

module.exports = { Store, RateLimiter, TTL_MS };
