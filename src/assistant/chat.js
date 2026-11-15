'use strict';
/**
 * Servicio de Cropi. «La IA interpreta y explica. El motor agrícola calcula.»
 * - Con GROQ_API_KEY: bucle modelo ⇄ herramientas de solo lectura (límite de vueltas y de tiempo).
 * - Sin clave: MODO LIMITADO determinista; responde con datos reales del motor y lo avisa. No simula una IA.
 * El cliente de Groq se inyecta (las pruebas usan un doble; en producción es el SDK oficial).
 */
const { isConfigured, publicConfig } = require('./config');
const { SYSTEM_PROMPT, PROMPT_VERSION, contextMessage } = require('./prompt');
const { toToolMessageContent } = require('./tools');
const C = require('./context');
const { AssistantError } = require('./groqClient');

const LIMITED_NOTICE = 'Cropi está en modo limitado: la conversación con IA (Groq) aún no está activada en este servidor. Las respuestas salen directamente de los resultados del motor.';

const withTimeout = (p, ms, label) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`${label}: tiempo agotado`)), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

class AssistantService {
  constructor({ cfg, store, limiter, groq = null, tools, log = () => {}, now = () => Date.now() }) {
    Object.assign(this, { cfg, store, limiter, groq, tools, log, now }); this._model = null;
  }

  err(http, code, error, extra = {}) { return { status: http, body: { error, code, ...extra } }; }

  /** Estado público (nunca expone la clave). `model_available` solo se consulta si hay clave, con caché de 60 s. */
  async status(sid) {
    const out = { ...publicConfig(this.cfg), has_analysis: !!this.store.active(sid), mode: isConfigured(this.cfg) ? 'ai' : 'limited', prompt_version: PROMPT_VERSION };
    delete out.timeout_ms; delete out.max_output_tokens; delete out.reasoning_effort;
    if (isConfigured(this.cfg) && this.groq && this.groq.checkModel) {
      if (!this._model || this.now() - this._model.at > 60000) this._model = { at: this.now(), v: await this.groq.checkModel() };
      Object.assign(out, { reachable: this._model.v.reachable, model_available: this._model.v.model_available ?? null, error_code: this._model.v.error_code });
    }
    return out;
  }

  reset(sid) { this.store.resetChat(sid); return { status: 200, body: { ok: true } }; }

  suggestions(sid, lang) {
    const a = this.store.active(sid);
    if (!a || a.result.unsupported) return { status: 200, body: { suggestions: [] } };
    const r = a.result;
    if (lang === 'en') {
      const e = ['Why is this the best option?', 'What are the risks of my current rotation?', 'How much water does each option need?', 'How certain are these results?'];
      if (r.sensitive_to_assumptions) e.splice(1, 0, 'How firm is this recommendation?');
      e.push(!r.economics || !r.economics.complete ? 'How much will I earn?' : 'What economic margin did I declare?');
      return { status: 200, body: { suggestions: e.slice(0, 5) } };
    }
    const s = ['¿Por qué esta es la mejor opción?', '¿Qué riesgos tiene mi rotación actual?', '¿Cuánta agua necesita cada opción?', '¿Qué tan seguros son estos resultados?'];
    if (r.sensitive_to_assumptions) s.splice(1, 0, '¿Qué tan firme es esta recomendación?');
    if (!r.economics || !r.economics.complete) s.push('¿Cuánto voy a ganar?');
    else s.push('¿Qué margen económico declaré?');
    return { status: 200, body: { suggestions: s.slice(0, 5) } };
  }

  async chat({ sid, ip, message, lang }) {
    if (typeof message !== 'string' || !message.trim()) return this.err(400, 'invalid_message', 'Escribe una pregunta.');
    message = message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    if (message.length > this.cfg.messageMaxChars) return this.err(400, 'message_too_long', `Tu mensaje es muy largo (máximo ${this.cfg.messageMaxChars} caracteres).`);
    const R = this.cfg.rate, rl = [
      this.limiter.check(`s:${sid}:m`, R.perSessionPerMin, 60000), this.limiter.check(`s:${sid}:d`, R.perSessionPerDay, 86400000), this.limiter.check(`ip:${ip}`, R.perIpPerMin, 60000)].find((x) => !x.ok);
    if (rl) return this.err(429, 'too_many_requests', 'Estás enviando muchos mensajes. Espera un momento.', { retry_after: rl.retryAfter });

    const analysis = this.store.active(sid), sess = this.store.chat(sid);
    if (!analysis) return { status: 200, body: { reply: 'Todavía no tengo resultados de tu parcela. Genera primero una recomendación (elige el punto en el mapa y pulsa «Generar») y luego te ayudo a entenderla.', mode: 'no_analysis', analysis_id: null } };

    const notes = [];
    if (sess.lastChatAnalysisId && sess.lastChatAnalysisId !== analysis.id) { sess.chat = []; notes.push('El análisis cambió desde el mensaje anterior: la conversación previa se descartó y se usan SOLO los resultados nuevos.'); }
    sess.lastChatAnalysisId = analysis.id;
    const changed = notes.length ? 'Actualicé la conversación con tu nuevo análisis. ' : '';

    let body;
    if (!isConfigured(this.cfg) || !this.groq) body = { reply: changed + this.limitedReply(message, analysis), mode: 'limited', notice: LIMITED_NOTICE };
    else {
      try { const r = await this.aiReply(message, analysis, sess, notes, lang); body = { reply: r.reply, mode: 'ai', tools_used: r.tools }; }
      catch (e) {
        if (e instanceof AssistantError) return this.err(e.http, e.code, e.message, e.retryAfter ? { retry_after: e.retryAfter } : {});
        this.log({ event: 'assistant_internal_error', msg: String(e && e.message).slice(0, 120) });
        return this.err(500, 'internal', 'Cropi tuvo un problema inesperado. Intenta de nuevo.');
      }
    }
    sess.chat.push({ role: 'user', content: message }, { role: 'assistant', content: body.reply });
    this.trim(sess);
    return { status: 200, body: { ...body, analysis_id: analysis.id, prompt_version: PROMPT_VERSION } };
  }

  trim(sess) {
    const { historyMaxMessages: n, historyMaxChars: ch } = this.cfg;
    if (sess.chat.length > n) sess.chat = sess.chat.slice(-n);
    while (sess.chat.length > 2 && sess.chat.reduce((a, m) => a + m.content.length, 0) > ch) sess.chat.shift();
    while (sess.chat.length && sess.chat[0].role !== 'user') sess.chat.shift();
  }

  /** Llama al modelo. Si Groq rechaza la solicitud (p. ej. una llamada a herramienta mal formada, algo conocido en gpt-oss), reintenta una vez y,
   *  si persiste, responde SIN herramientas usando solo el resumen del análisis (nunca inventa: el prompt lo prohíbe). */
  async callModel(messages, noTools) {
    const withTools = { messages, tools: this.tools.definitions, toolChoice: noTools ? 'none' : 'auto' };
    try { return await this.groq.chat(withTools); }
    catch (e) {
      if (!(e instanceof AssistantError) || e.code !== 'bad_request') throw e;
      this.log({ event: 'bad_request_retry' });
      try { return await this.groq.chat(withTools); }
      catch (e2) { if (!(e2 instanceof AssistantError) || e2.code !== 'bad_request') throw e2; this.log({ event: 'bad_request_no_tools' }); return this.groq.chat({ messages: messages.filter((m) => m.role !== 'tool' && !m.tool_calls) }); }
    }
  }

  async aiReply(message, analysis, sess, notes, lang) {
    const cfg = this.cfg, ctx = { analysis, sims: 0 }, used = [];
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'system', content: contextMessage(C.contextJson(analysis.result, analysis.input), notes) }, ...(lang === 'en' ? [{ role: 'system', content: 'LANGUAGE: the user interface is in English. Reply in clear, simple English (keep every rule above). Tool results and context may be in Spanish: translate them faithfully; never change numbers or facts.' }] : []), ...sess.chat, { role: 'user', content: message }];
    for (let it = 0; it <= cfg.maxToolIterations; it++) {
      const last = it === cfg.maxToolIterations;
      const r = await this.callModel(messages, last);
      if (!r.tool_calls.length || last) {
        const text = (r.content || '').trim();
        if (!text) throw new AssistantError('empty', 'Cropi no pudo generar una respuesta. Intenta reformular tu pregunta.', { http: 502 });
        return { reply: text, tools: [...new Set(used)] };
      }
      const calls = r.tool_calls.slice(0, cfg.maxToolCallsPerTurn);
      messages.push({ role: 'assistant', content: r.content || null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {}) } })) });
      for (const c of calls) {
        used.push(c.name);
        let out;
        try { out = await withTimeout(this.tools.run(c.name, c.arguments, ctx), cfg.toolTimeoutMs, c.name); }
        catch (e) { out = { ok: false, error: 'la herramienta falló o excedió el tiempo' }; this.log({ event: 'tool_error', tool: String(c.name).slice(0, 40), msg: String(e && e.message).slice(0, 80) }); }
        messages.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: toToolMessageContent(out) });
      }
    }
    throw new AssistantError('empty', 'Cropi no pudo completar la respuesta.', { http: 502 });
  }

  /** Respuestas deterministas (sin IA) construidas SOLO con datos reales del motor. */
  limitedReply(message, a) {
    const r = a.result, m = message.toLowerCase();
    if (r.unsupported) return 'El motor no generó estrategias para esta ubicación: ' + (r.limitations || []).join(' ');
    const names = C.cropNames(r), seq = (s) => (s.sequence || []).map((c) => names[c] || c).join(' → ');
    const by = Object.fromEntries((r.strategies || []).map((s) => [s.id, s])), best = by.alt_a || r.strategies[0], cur = by.current;
    if (/(rendimiento|cosech|ganar|ganancia|rentab|dinero|ingreso|produc|toneladas|cu[aá]nto (voy|va)|margen|precio)/.test(m)) {
      const e = r.economics;
      return 'Field Shift no estima rendimientos ni ganancias por sí mismo: solo compara rotaciones con puntajes relativos (0–100) y no son cosechas ni dinero.' + (e && e.complete ? ' Tú declaraste rendimiento, precio y costos de ambos cultivos, así que el motor puede mostrar un margen declarado en cada rotación.' : ' Para ver un margen económico tendrías que declarar rendimiento, precio y costos de ambos cultivos en el modo Precisa (y serían tus datos, no una medición).');
    }
    if (/(riesgo|peligro|problema|plaga)/.test(m)) {
      const t = cur || best; const rk = (t.risks || []).slice(0, 3);
      return `Riesgos que señala el motor para «${t.label}» (${seq(t)}):\n` + (rk.length ? rk.map((x) => '- ' + C.cut(x, 240)).join('\n') : '- No registra riesgos específicos.') + (r.sensitive_to_assumptions ? '\nOjo: el resultado es sensible a supuestos.' : '');
    }
    if (/(agua|riego|lluvia|sequ)/.test(m)) {
      const t = best; const rows = (t.timeline || []).map((x) => `- Campaña ${x.campaign} (${x.crop_name}): necesita unos ${x.water_need_mm} mm de riego${x.water_need_range_mm ? ` (podría ir de ${x.water_need_range_mm[0]} a ${x.water_need_range_mm[1]} mm)` : ''}`);
      return `Esto es lo que calculó el motor sobre el agua para «${t.label}»:\n${rows.join('\n')}\nSon estimaciones; para saber si el agua te alcanza, cuéntame cuánta tienes.`;
    }
    if (/(dato|origen|fuente|hip[oó]tesis|confiable|observado|declarado|bibliogr)/.test(m) && r.provenance) {
      const s = r.provenance.summary || {}, L = r.provenance.legend || {};
      return 'De dónde salen los datos del análisis: ' + ['A', 'B', 'C', 'D', 'E'].filter((k) => s[k]).map((k) => `${s[k]} ${String(L[k] || k).split(':')[0].toLowerCase()}`).join(', ') + '. Los que son suposiciones del equipo no se toman como hechos.';
    }
    const lines = (r.strategies || []).map((s) => `- ${s.label}: ${seq(s)} — puntaje ${s.score}/100`);
    return `Esto es lo que calculó el motor:\n${lines.join('\n')}\n` + (best && best.reasons && best.reasons[0] ? `\nPor qué «${best.label}»: ${C.cut(best.reasons[0], 260)}` : '') + (r.sensitive_to_assumptions ? '\nEl resultado es sensible a supuestos.' : '') + '\nLos puntajes sirven para comparar opciones; no son cosecha.';
  }
}

module.exports = { AssistantService, LIMITED_NOTICE };
