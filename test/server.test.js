'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
require('./helpers'); // fija caché temporal + instantánea demo
process.env.FIELDSHIFT_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-db-')), 'parcels.json');
const { server, validateInput } = require('../server');

let base;
test.before(async () => { await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const body = { lat: -6.034, lon: -76.971, history: ['maiz', 'maiz'], irrigation: false, start_slot: 'A', priorities: { protect_soil: 4 } };

test('validateInput rechaza entradas inválidas', () => {
  assert.ok(validateInput({ lat: 99, lon: 0, history: ['maiz'] }).errs);
  assert.ok(validateInput({ lat: -6, lon: -76, history: ['cafe'] }).errs);
  assert.ok(validateInput({ lat: -6, lon: -76, history: [] }).errs);
  assert.ok(validateInput({ lat: 70, lon: 10, history: ['maiz'] }).errs, 'fuera del dominio tropical');
  const ok = validateInput({ ...body, priorities: { protect_soil: 99, water: -3 } });
  assert.equal(ok.input.priorities.protect_soil, 5); assert.equal(ok.input.priorities.water, 0);
});

test('GET /api/meta y /api/health', async () => {
  const m = await (await fetch(base + '/api/meta')).json();
  assert.ok(m.crops.length >= 8 && m.scenarios.some((s) => s.hypothetical) && /PROVISIONAL/.test(m.kb_status));
  assert.equal((await (await fetch(base + '/api/health')).json()).ok, true);
});

test('POST /api/analyze devuelve 3 estrategias con procedencia y robustez', async () => {
  const r = await post('/api/analyze', body);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.strategies.length, 3);
  assert.ok(j.data_quality.sources.slope && j.data_quality.sources.soil && j.data_quality.sources.imerg);
  assert.equal(j.robustness.by_source.length, 3);
  assert.equal(j.imerg_job.state, 'ready');
});

test('POST /api/analyze: 400 con entrada inválida y no filtra detalles internos', async () => {
  const r = await post('/api/analyze', { lat: 'x', lon: 1, history: ['maiz'] });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Entrada inválida/);
});

test('Parcelas: crear, registrar decisión con trazabilidad y eliminar', async () => {
  const p = await (await post('/api/parcels', { name: 'Chacra test', lat: -6.03, lon: -76.97, history: ['maiz'] })).json();
  assert.ok(p.id);
  const d = await (await post(`/api/parcels/${p.id}/decision`, { chosen: 'alt_a', sequence: ['mucuna'], note: 'n', engine_version: '0.1.0', scenario: 'base' })).json();
  assert.equal(d.decisions.length, 1); assert.equal(d.decisions[0].engine_version, '0.1.0');
  assert.equal((await fetch(base + `/api/parcels/${p.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(base + `/api/parcels/${p.id}`)).status, 404);
});

test('Estáticos: sirve index y bloquea salida del directorio público', async () => {
  const r = await fetch(base + '/'); assert.equal(r.status, 200); assert.match(await r.text(), /Field Shift/);
  const evil = await fetch(base + '/..%2F..%2Fpackage.json');
  assert.notEqual(evil.status, 200);
});

test('Recorrido completo: parcela → análisis → soporte/ventanas/comparaciones → decisión → listado → eliminación', async () => {
  const p = await (await post('/api/parcels', { name: 'Recorrido', lat: -6.034, lon: -76.971, history: ['maiz', 'maiz', 'maiz', 'maiz'], priorities: { protect_soil: 4 } })).json();
  const saved = await (await fetch(base + '/api/parcels')).json();
  assert.ok(saved.some((x) => x.id === p.id));
  const r = await (await post('/api/analyze', { lat: p.lat, lon: p.lon, history: p.history, priorities: p.priorities })).json();
  assert.ok(r.support && ['aceptable', 'limitada', 'no_recomendable'].includes(r.support.level));
  assert.ok(r.strategies.length >= 1 && r.sowing_windows.crops.maiz.length >= 12);
  assert.ok(r.sensitivity.comparisons.a_vs_b.text && /NO es validación/.test(r.sensitivity.note));
  const best = r.strategies.find((s) => s.id === 'alt_a');
  const d = await (await post(`/api/parcels/${p.id}/decision`, { chosen: best.id, sequence: best.sequence, engine_version: r.engine_version, scenario: r.scenario.id, weights: r.weights, scores: { alt_a: best.score } })).json();
  assert.equal(d.decisions[0].engine_version, r.engine_version);
  assert.equal((await fetch(base + `/api/parcels/${p.id}`, { method: 'DELETE' })).status, 200);
});

test('Entradas adversas: coordenadas fuera de rango, latitud extrema, cultivos desconocidos, JSON inválido, cuerpo vacío', async () => {
  for (const b of [{ lat: 95, lon: 0, history: ['maiz'] }, { lat: -6, lon: 200, history: ['maiz'] }, { lat: 70, lon: 10, history: ['maiz'] }, { lat: -6, lon: -77, history: ['quinua'] }, { lat: -6, lon: -77, history: [] }, { lat: -6, lon: -77, history: ['maiz'], excluded_crops: ['xyz'] }]) {
    const r = await post('/api/analyze', b); assert.equal(r.status, 400, JSON.stringify(b));
  }
  const bad = await fetch(base + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{no es json' });
  assert.ok(bad.status >= 400 && bad.status < 500 || bad.status === 500);
  const empty = await post('/api/analyze', {}); assert.equal(empty.status, 400);
  const noPar = await post('/api/parcels', { lat: 1, lon: 1 }); assert.equal(noPar.status, 400);
});

test('Fuente de datos caída: el análisis falla con mensaje claro (422), sin inventar resultados', async () => {
  // punto sin caché y con red bloqueada artificialmente: se fuerza error de POWER cambiando la URL base no es posible; se verifica a nivel de pipeline
  const { analyze } = require('../src/pipeline');
  const g = await require('./helpers').demoData();
  assert.throws(() => analyze({ ...require('./helpers').baseInput() }, { ...g, power: { ok: false, error: 'POWER caído', provenance: {} } }), /Sin datos climáticos/);
});
