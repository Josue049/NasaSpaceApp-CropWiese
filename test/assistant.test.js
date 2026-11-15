'use strict';
/**
 * Pruebas de Cropi. IMPORTANTE: usan DOBLES de Groq (no hay red ni clave). Verifican la construcción de solicitudes, el bucle de
 * herramientas, la validación, el aislamiento y el mapeo de errores con las clases REALES del SDK. NO sustituyen la validación
 * con credenciales reales (scripts/probar_groq.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { gatherData, analyze, SCENARIOS } = require('../src/pipeline');
const { createAssistant } = require('../src/assistant');
const { getConfig, publicConfig } = require('../src/assistant/config');
const { parseAndValidate } = require('../src/assistant/validate');
const { createGroqClient, mapError, AssistantError } = require('../src/assistant/groqClient');
const { Store } = require('../src/assistant/store');
const SDK = require('groq-sdk');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const input = () => ({ lat: -5.19, lon: -79.99, area_ha: 1, irrigation: true, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {}, engine: 'v2' });
const runSimulation = async (inp) => analyze(inp, await gatherData(inp.lat, inp.lon), SCENARIOS.base);
const FAKE_KEY = 'gsk_PRUEBA_NO_REAL_1234567890';

/** Ensambla el asistente con un doble de Groq (o ninguno) y un análisis real del motor. */
async function setup({ key = FAKE_KEY, groq } = {}) {
  const A = createAssistant({ env: { GROQ_API_KEY: key }, groq: groq === undefined ? null : groq, runSimulation, log: () => {} });
  const sid = Store.newSessionId();
  const inp = input(), result = await withDomain(async () => analyze(inp, await gatherData(inp.lat, inp.lon)));
  const id = A.store.put(sid, inp, result);
  return { A, sid, id, result, inp };
}
const chat = (A, sid, message) => A.service.chat({ sid, ip: '1.2.3.4', message });
/** Doble de Groq: responde con la cola indicada y registra las solicitudes. */
const fakeGroq = (queue) => { const calls = []; return { calls, async chat(req) { calls.push(JSON.parse(JSON.stringify(req))); const n = queue.shift(); if (n instanceof Error) throw n; return n; }, async checkModel() { return { reachable: true, model_available: true }; } }; };
const say = (content) => ({ content, tool_calls: [], finish_reason: 'stop' });
const call = (name, args, id = 'c1') => ({ content: '', tool_calls: [{ id, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }], finish_reason: 'tool_calls' });

test('config: valores por defecto, marcadores de posición y estado público sin clave', () => {
  const c = getConfig({});
  assert.equal(c.model, 'openai/gpt-oss-120b'); assert.equal(c.timeoutMs, 30000); assert.equal(c.maxOutputTokens, 1200); assert.equal(c.apiKey, '');
  assert.equal(getConfig({ GROQ_API_KEY: 'tu_clave_aqui' }).apiKey, '', 'un marcador de posición no cuenta como clave');
  assert.equal(getConfig({ GROQ_MODEL: 'otro/modelo' }).model, 'otro/modelo', 'el modelo se cambia por entorno');
  assert.equal(getConfig({ GROQ_TIMEOUT_MS: '999999999' }).timeoutMs, 120000);
  const pub = JSON.stringify(publicConfig(getConfig({ GROQ_API_KEY: FAKE_KEY })));
  assert.ok(!pub.includes(FAKE_KEY) && !/gsk_/.test(pub));
});

test('validador: rechaza propiedades no declaradas, tipos y rangos incorrectos, y JSON inválido', () => {
  const S = { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 4 }, s: { type: 'string', enum: ['a', 'b'] } }, required: ['n'], additionalProperties: false };
  assert.ok(parseAndValidate(S, '{"n":2,"s":"a"}').ok);
  assert.ok(!parseAndValidate(S, '{"n":2,"extra":1}').ok);
  assert.ok(!parseAndValidate(S, '{"n":9}').ok);
  assert.ok(!parseAndValidate(S, '{"n":"2"}').ok);
  assert.ok(!parseAndValidate(S, '{"s":"c","n":1}').ok);
  assert.ok(!parseAndValidate(S, '{}').ok);
  assert.ok(!parseAndValidate(S, 'no es json').ok);
  assert.ok(!parseAndValidate(S, '[1]').ok);
});

test('herramientas: lista blanca; no aceptan ids de análisis, rutas ni propiedades extra', async () => {
  const { A, sid } = await setup();
  const ctx = { analysis: A.store.active(sid), sims: 0 };
  assert.deepEqual(A.tools.names.sort(), ['compare_rotations', 'get_climate_evidence', 'get_current_analysis', 'get_parameter_provenance', 'get_rotation_details', 'get_water_requirements', 'simulate_scenario']);
  assert.equal((await A.tools.run('read_file', {}, ctx)).ok, false);
  assert.equal((await A.tools.run('get_current_analysis', { analysis_id: 'otro' }, ctx)).ok, false, 'el modelo no puede indicar el análisis');
  assert.equal((await A.tools.run('get_rotation_details', { strategy: '../../etc/passwd' }, ctx)).ok, false);
  assert.equal((await A.tools.run('get_rotation_details', { strategy: 'alt_a', campaign: 99 }, ctx)).ok, false);
  assert.equal((await A.tools.run('get_current_analysis', {}, { analysis: null })).ok, false, 'sin análisis activo no hay datos');
});

test('herramientas: los datos devueltos coinciden con el motor (nada inventado)', async () => {
  const { A, sid, result } = await setup();
  const ctx = { analysis: A.store.active(sid), sims: 0 };
  const cur = (await A.tools.run('get_current_analysis', {}, ctx)).data;
  assert.deepEqual(cur.strategies.map((s) => s.score_0_100), result.strategies.map((s) => s.score));
  const det = (await A.tools.run('get_rotation_details', { strategy: 'alt_a' }, ctx)).data;
  assert.equal(det.score_0_100, result.strategies.find((s) => s.id === 'alt_a').score);
  const w = (await A.tools.run('get_water_requirements', {}, ctx)).data;
  assert.equal(w.by_strategy[0].campaigns[0].water_need_mm, result.strategies[0].timeline[0].water_need_mm);
  const pv = (await A.tools.run('get_parameter_provenance', { category: 'E' }, ctx)).data;
  assert.ok(pv.items.every((i) => i.cat === 'E') && pv.items.length > 0);
  const cl = (await A.tools.run('get_climate_evidence', {}, ctx)).data;
  assert.ok(cl.sources.length >= 1);
});

test('simulate_scenario: usa el motor real sobre una copia y NO altera el análisis activo', async () => {
  const { A, sid, result, inp } = await setup();
  const before = JSON.stringify({ r: result, i: A.store.active(sid).input });
  const ctx = { analysis: A.store.active(sid), sims: 0 };
  const out = await withDomain(() => A.tools.run('simulate_scenario', { changes: { irrigation: false } }, ctx));
  assert.equal(out.ok, true); assert.equal(out.data.simulation, true);
  assert.ok(out.data.strategies.length >= 1 && /NO es el análisis activo/.test(out.data.warning));
  assert.equal(JSON.stringify({ r: A.store.active(sid).result, i: A.store.active(sid).input }), before, 'el análisis activo no cambió');
  assert.equal(inp.irrigation, true);
  assert.equal((await A.tools.run('simulate_scenario', { changes: { cultivo_inventado: 1 } }, ctx)).ok, false);
  assert.equal((await A.tools.run('simulate_scenario', { changes: { supply_m3_ha: -5 } }, ctx)).ok, false);
  assert.equal((await A.tools.run('simulate_scenario', { changes: {} }, ctx)).ok, false);
  ctx.sims = 2; assert.equal((await A.tools.run('simulate_scenario', { changes: { irrigation: true } }, ctx)).ok, false, 'límite de simulaciones por mensaje');
});

test('sin GROQ_API_KEY: modo limitado explícito, no llama a ninguna IA y responde con datos reales', async () => {
  const { A, sid, result } = await setup({ key: '' });
  const r = await chat(A, sid, '¿Qué rotación me conviene?');
  assert.equal(r.status, 200); assert.equal(r.body.mode, 'limited'); assert.match(r.body.notice, /modo limitado/);
  assert.ok(r.body.reply.includes(String(result.strategies[1].score)), 'cita el puntaje real del motor');
  const st = await A.service.status(sid);
  assert.equal(st.configured, false); assert.equal(st.mode, 'limited');
});

test('preguntas de rendimiento/ganancia: el asistente aclara que el motor no los estima (modo limitado)', async () => {
  const { A, sid } = await setup({ key: '' });
  const r = await chat(A, sid, '¿Cuánto voy a ganar con cada opción?');
  assert.match(r.body.reply, /no estima rendimientos ni ganancias/);
  assert.ok(!/S\/\s?\d/.test(r.body.reply), 'sin cifras de dinero inventadas');
});

test('sin análisis activo: orienta a generar la recomendación y no consulta a Groq', async () => {
  const g = fakeGroq([]);
  const A = createAssistant({ env: { GROQ_API_KEY: FAKE_KEY }, groq: g, runSimulation, log: () => {} });
  const r = await chat(A, Store.newSessionId(), 'hola');
  assert.equal(r.body.mode, 'no_analysis'); assert.equal(g.calls.length, 0);
});

test('con Groq (doble): construye contexto + herramientas, ejecuta la herramienta y devuelve el texto final', async () => {
  const g = fakeGroq([call('get_rotation_details', { strategy: 'alt_a' }), say('La Alternativa A es la mejor porque...')]);
  const { A, sid, id } = await setup({ groq: g });
  const r = await chat(A, sid, '¿Por qué la alternativa A?');
  assert.equal(r.body.mode, 'ai'); assert.equal(r.body.reply, 'La Alternativa A es la mejor porque...'); assert.deepEqual(r.body.tools_used, ['get_rotation_details']); assert.equal(r.body.analysis_id, id);
  const first = g.calls[0];
  assert.equal(first.messages[0].role, 'system'); assert.match(first.messages[0].content, /El motor agrícola de Field Shift calcula/);
  assert.match(first.messages[1].content, /CONTEXTO DEL ANÁLISIS ACTIVO/);
  assert.equal(first.tools.length, 7); assert.equal(first.toolChoice, 'auto');
  const second = g.calls[1], tm = second.messages.find((m) => m.role === 'tool');
  assert.match(tm.content, /^DATOS_DE_HERRAMIENTA/); assert.equal(tm.tool_call_id, 'c1');
  assert.ok(second.messages.some((m) => m.role === 'assistant' && m.tool_calls));
});

test('con Groq: argumentos inválidos del modelo se rechazan y se le informa; el bucle tiene tope y cierra sin herramientas', async () => {
  const q = [call('get_rotation_details', '{"strategy":"x"}'), call('get_current_analysis', {}, 'c2'), call('get_current_analysis', {}, 'c3'), call('get_current_analysis', {}, 'c4'), say('Respuesta final')];
  const g = fakeGroq(q);
  const { A, sid } = await setup({ groq: g });
  const r = await chat(A, sid, 'resume');
  assert.equal(r.body.reply, 'Respuesta final');
  assert.match(g.calls[1].messages.find((m) => m.role === 'tool').content, /argumentos inválidos/);
  assert.equal(g.calls.length, 5); assert.equal(g.calls[4].toolChoice, 'none', 'la última vuelta no permite herramientas');
});

test('errores de Groq con las clases reales del SDK: 401, 429 con retry-after, tiempo agotado y conexión', async () => {
  const cases = [
    [new SDK.AuthenticationError(401, { error: { message: 'bad key' } }, 'bad key', {}), 'auth', 502],
    [new SDK.RateLimitError(429, { error: { message: 'slow down' } }, 'slow down', { 'retry-after': '7' }), 'rate_limit', 429],
    [new SDK.APIConnectionTimeoutError({ message: 'timeout' }), 'timeout', 504],
    [new SDK.APIConnectionError({ message: 'sin red' }), 'connection', 502],
    [new SDK.NotFoundError(404, { error: { message: 'no model' } }, 'no model', {}), 'model_not_found', 502],
  ];
  for (const [err, code, http] of cases) {
    const ae = mapError(err, SDK);
    assert.equal(ae.code, code); assert.equal(ae.http, http);
    const g = { async chat() { throw ae; } };
    const { A, sid } = await setup({ groq: g });
    const r = await chat(A, sid, 'hola');
    assert.equal(r.status, http); assert.equal(r.body.code, code);
    assert.ok(!JSON.stringify(r.body).includes(FAKE_KEY));
  }
  assert.equal(mapError(cases[1][0], SDK).retryAfter, 7);
});

test('cliente Groq (SDK simulado): solicitud con modelo, tokens, herramientas y sin exponer la clave; mapea errores', async () => {
  const seen = []; let ctorOpts;
  class FakeGroq { constructor(o) { ctorOpts = o; this.chat = { completions: { create: async (b) => { seen.push(b); return { choices: [{ message: { content: 'ok', tool_calls: [{ id: 't', function: { name: 'compare_rotations', arguments: '{}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }; } } }; this.models = { list: async () => ({ data: [{ id: 'openai/gpt-oss-120b' }] }) }; } }
  const logs = [];
  const cfg = getConfig({ GROQ_API_KEY: FAKE_KEY, GROQ_REASONING_EFFORT: 'low' });
  const c = createGroqClient(cfg, { sdk: { default: FakeGroq }, log: (o) => logs.push(o) });
  const r = await c.chat({ messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 'f' } }] });
  assert.equal(seen[0].model, 'openai/gpt-oss-120b'); assert.equal(seen[0].max_completion_tokens, 1200); assert.equal(seen[0].reasoning_effort, 'low'); assert.equal(seen[0].tool_choice, 'auto');
  assert.equal(ctorOpts.timeout, 30000); assert.equal(ctorOpts.apiKey, FAKE_KEY);
  assert.deepEqual(r.tool_calls, [{ id: 't', name: 'compare_rotations', arguments: '{}' }]);
  assert.deepEqual(await c.checkModel(), { reachable: true, model_available: true });
  assert.ok(!JSON.stringify(logs).includes(FAKE_KEY));
});

test('el cambio de análisis descarta la conversación previa y avisa; el contexto usa solo el análisis nuevo', async () => {
  const g = fakeGroq([say('uno'), say('dos')]);
  const { A, sid } = await setup({ groq: g });
  await chat(A, sid, 'primera');
  const inp2 = { ...input(), history: ['loctao', 'loctao'] }, res2 = await withDomain(async () => analyze(inp2, await gatherData(inp2.lat, inp2.lon)));
  const id2 = A.store.put(sid, inp2, res2);
  const r = await chat(A, sid, 'segunda');
  assert.equal(r.body.analysis_id, id2);
  const req = g.calls[1];
  assert.ok(!req.messages.some((m) => m.content === 'primera'), 'sin historial del análisis anterior');
  assert.match(req.messages[1].content, /cambió/);
});

test('historial acotado y mensajes inválidos o demasiado largos se rechazan', async () => {
  const g = fakeGroq(Array.from({ length: 20 }, () => say('r')));
  const { A, sid } = await setup({ groq: g });
  assert.equal((await chat(A, sid, '')).status, 400); assert.equal((await chat(A, sid, 'x'.repeat(1001))).status, 400); assert.equal((await chat(A, sid, { a: 1 })).status, 400);
  for (let i = 0; i < 10; i++) await chat(A, sid, 'pregunta ' + i);
  assert.ok(A.store.chat(sid).chat.length <= 12);
});

test('límite de solicitudes por sesión (429 con retry_after)', async () => {
  const { A, sid } = await setup({ key: '' });
  let last; for (let i = 0; i < 13; i++) last = await chat(A, sid, 'hola ' + i);
  assert.equal(last.status, 429); assert.ok(last.body.retry_after >= 1);
});

test('aislamiento: una sesión no puede ver el análisis de otra', async () => {
  const { A, sid } = await setup({ key: '' });
  const other = Store.newSessionId();
  assert.equal(A.store.active(other), null);
  assert.equal((await chat(A, other, '¿qué rotación?')).body.mode, 'no_analysis');
  assert.ok(Store.validSessionId(sid) && !Store.validSessionId('../x'));
});

test('sugerencias: salen del análisis real y vacías si no hay análisis', async () => {
  const { A, sid } = await setup({ key: '' });
  assert.ok(A.service.suggestions(sid).body.suggestions.length >= 3);
  assert.deepEqual(A.service.suggestions(Store.newSessionId()).body.suggestions, []);
});

test('HTTP: cookie de sesión HttpOnly, análisis activo ligado a la sesión, chat limitado, estado sin clave y rechazo de otro origen', async () => {
  const { server, assistant } = require('../server');
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon';
    try {
      const a = await fetch(base + '/api/rotation/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: -5.19, lon: -79.99, history: ['arroz', 'arroz'], irrigation: true, start_slot: 'A' }) });
      const ck = a.headers.get('set-cookie'); assert.match(ck, /fs_sid=[a-f0-9]{32}.*HttpOnly.*SameSite=Lax/);
      const cookie = ck.split(';')[0], j = await a.json();
      assert.ok(j.analysis_id);
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      const st = await (await fetch(base + '/api/assistant/status', { headers: H })).json();
      assert.equal(st.has_analysis, true); assert.equal(st.configured, false); assert.ok(!/gsk_|key/i.test(JSON.stringify(st)));
      const c = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: '¿Qué riesgos tiene?', analysis_id: 'ajeno' }) });
      const cj = await c.json(); assert.equal(c.status, 200); assert.equal(cj.mode, 'limited'); assert.equal(cj.analysis_id, j.analysis_id);
      const bad = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: { ...H, Origin: 'http://malo.example' }, body: JSON.stringify({ message: 'hola' }) });
      assert.equal(bad.status, 403);
      const none = await (await fetch(base + '/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hola' }) })).json();
      assert.equal(none.mode, 'no_analysis', 'otra sesión (sin cookie) no ve el análisis');
    } finally { process.env.FIELDSHIFT_DOMAIN = prev; }
  } finally { server.close(); }
  assert.ok(assistant);
});

test('si Groq rechaza la solicitud (bad_request), reintenta y luego responde sin herramientas', async () => {
  const bad = () => new AssistantError('bad_request', 'x', { http: 502 });
  const g = fakeGroq([bad(), bad(), say('Respuesta sin herramientas')]);
  const { A, sid } = await setup({ groq: g });
  const r = await chat(A, sid, 'hola');
  assert.equal(r.status, 200); assert.equal(r.body.reply, 'Respuesta sin herramientas');
  assert.equal(g.calls.length, 3); assert.equal(g.calls[2].tools, undefined, 'el último intento no envía herramientas');
  const g2 = fakeGroq([bad(), say('Ok tras reintento')]);
  const s2 = await setup({ groq: g2 }); assert.equal((await chat(s2.A, s2.sid, 'hola')).body.reply, 'Ok tras reintento');
});
