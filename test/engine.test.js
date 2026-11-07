'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { demoData, baseInput, analyze, SCENARIOS } = require('./helpers');
const { projectCurrent, priorityWeights, CRITERIA } = require('../src/engine');

const run = async (mut = (i) => i, sc = SCENARIOS.base) => analyze(mut(baseInput()), await demoData(), sc);
const strip = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'generated_at' ? undefined : v)));

test('projectCurrent continúa el patrón declarado', () => {
  assert.deepEqual(projectCurrent(['maiz', 'maiz', 'maiz', 'maiz']), ['maiz', 'maiz', 'maiz', 'maiz']);
  assert.deepEqual(projectCurrent(['a', 'b']), ['a', 'b', 'a', 'b']);
  assert.deepEqual(projectCurrent(['a', 'b', 'a']), ['b', 'a', 'b', 'a']);
  assert.deepEqual(projectCurrent(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']);
  assert.deepEqual(projectCurrent(['x']), ['x', 'x', 'x', 'x']);
});

test('Se generan exactamente 3 estrategias comparables, la primera es la actual', async () => {
  const r = await run();
  assert.equal(r.strategies.length, 3);
  assert.deepEqual(r.strategies.map((s) => s.id), ['current', 'alt_a', 'alt_b']);
  for (const s of r.strategies) { assert.equal(s.sequence.length, 4); assert.equal(s.timeline.length, 4); assert.ok(s.score >= 0 && s.score <= 100); }
  assert.notDeepEqual(r.strategies[1].sequence, r.strategies[0].sequence);
  assert.notDeepEqual(r.strategies[1].sequence, r.strategies[2].sequence);
});

test('Monocultivo de maíz: se señala la violación y queda por debajo de las alternativas', async () => {
  const r = await run();
  const [cur, a, b] = r.strategies;
  assert.ok(cur.violations.some((v) => /3 campañas seguidas/.test(v)));
  assert.equal(cur.criteria.pest.score, 0, 'repetir cultivo en todas las campañas anula la ruptura de plagas');
  assert.ok(a.score > cur.score && b.score > cur.score);
  assert.ok(a.criteria.pest.score > 0.5);
});

test('Reglas eliminatorias: arroz solo con riego; exclusión del agricultor; sin solanáceas consecutivas; máx. 1 abono verde', async () => {
  let r = await run();
  const allSeqs = (res) => res.strategies.slice(1).flatMap((s) => s.sequence);
  assert.ok(!allSeqs(r).includes('arroz'), 'sin riego no debe proponerse arroz');
  assert.ok(r.eligibility.every((e) => e.blocked.arroz?.some((m) => /riego/.test(m))));
  r = await run((i) => ({ ...i, irrigation: true }));
  assert.ok(r.eligibility.every((e) => e.ok.includes('arroz')));
  r = await run((i) => ({ ...i, excluded_crops: ['mucuna', 'zapallo', 'camote'] }));
  assert.ok(!allSeqs(r).some((c) => ['mucuna', 'zapallo', 'camote'].includes(c)));
  for (const s of r.strategies.slice(1)) {
    for (let i = 1; i < 4; i++) assert.ok(!(s.sequence[i] === 'tomate' && s.sequence[i - 1] === 'tomate'));
    assert.ok(s.sequence.filter((c) => c === 'mucuna').length <= 1);
  }
  r = await run((i) => ({ ...i, history: ['tomate'] }));
  assert.ok(r.strategies.slice(1).every((s) => s.sequence[0] !== 'tomate'), 'tomate tras tomate está prohibido');
});

test('Las reglas descalifican; los criterios solo puntúan (la estrategia actual se evalúa aunque incumpla)', async () => {
  const r = await run((i) => ({ ...i, history: ['tomate', 'tomate', 'tomate', 'tomate'] }));
  const cur = r.strategies[0];
  assert.ok(cur.violations.length > 0);
  assert.ok(Number.isFinite(cur.score));
});

test('Determinismo: misma entrada, misma salida (incluida la sensibilidad)', async () => {
  const a = strip(await run()), b = strip(await run());
  assert.deepEqual(a, b);
});

test('Pesos: normalizados, y subir una prioridad sube su peso', async () => {
  const g = await demoData();
  const mk = (p) => priorityWeights({ input: { priorities: p }, slope: 5, soil: g.soil.data });
  const w = mk({ protect_soil: 3, water: 3, resilience: 3, pests: 3, income: 3, low_cost: 3 });
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const w2 = mk({ protect_soil: 3, water: 5, resilience: 3, pests: 3, income: 3, low_cost: 3 });
  assert.ok(w2.water > w.water);
  const steep = priorityWeights({ input: { priorities: {} }, slope: 28, soil: g.soil.data });
  const flat = priorityWeights({ input: { priorities: {} }, slope: 1, soil: g.soil.data });
  assert.ok(steep.erosion > flat.erosion, 'más pendiente -> más peso a erosión');
});

test('Cambiar las prioridades cambia el resultado de manera razonable', async () => {
  const cost = await run((i) => ({ ...i, priorities: { protect_soil: 0, water: 0, resilience: 0, pests: 0, income: 0, low_cost: 5 } }));
  const soil = await run((i) => ({ ...i, priorities: { protect_soil: 5, water: 0, resilience: 0, pests: 0, income: 0, low_cost: 0 } }));
  assert.ok(soil.strategies[1].criteria.organic_n.score >= cost.strategies[1].criteria.organic_n.score - 1e-9);
  assert.ok(cost.strategies[1].criteria.low_cost.score >= soil.strategies[1].criteria.low_cost.score - 1e-9);
});

test('Escenarios hipotéticos: se etiquetan y no mejoran la suficiencia hídrica', async () => {
  const base = await run(), dry = await run((i) => i, SCENARIOS.dry);
  assert.equal(dry.scenario.hypothetical, true);
  assert.ok(dry.strategies[0].criteria.water.score <= base.strategies[0].criteria.water.score + 1e-9);
});

test('Datos ausentes: sin suelo se omite el criterio y se renormalizan los pesos; sin pendiente se avisa', async () => {
  const g = await demoData();
  const g2 = { ...g, soil: { ok: false, error: 'simulado: sin red', provenance: {} }, slope: { ok: false, error: 'simulado: sin red', provenance: {} } };
  const r = analyze(baseInput(), g2, SCENARIOS.base);
  assert.equal(r.strategies[0].criteria.soil_fit.score, null);
  assert.equal(r.weights.soil_fit, 0);
  assert.ok(Math.abs(Object.values(r.weights).reduce((a, b) => a + b, 0) - 1) < 1e-2);
  assert.ok(r.data_quality.missing.soil && r.data_quality.missing.slope);
});

test('Sin datos climáticos el análisis falla con mensaje claro (no inventa)', async () => {
  const g = await demoData();
  assert.throws(() => analyze(baseInput(), { ...g, power: { ok: false, error: 'POWER caído', provenance: {} } }), /Sin datos climáticos/);
});

test('Robustez: se reporta el ranking bajo cada fuente de lluvia y los criterios traen confianza', async () => {
  const r = await run();
  assert.equal(r.robustness.by_source.length, 3);
  assert.ok(r.robustness.by_source.every((x) => x.ranking.length === 3));
  for (const k of CRITERIA) assert.ok(r.strategies[1].criteria[k].confidence);
  assert.equal(r.sensitivity.draws, 400);
  assert.ok(r.sensitivity.alt_a_beats_current >= 0.9);
  assert.ok(r.sensitivity.comparisons.a_vs_b.level, 'A vs B debe clasificarse (equivalentes / preferible)');
  assert.ok(/NO es validación/.test(r.sensitivity.note));
});
