'use strict';
// Motor v2 (dos etapas): viabilidad → comparación. Datos reales de la instantánea de Morropón (sin red).
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { gatherData, analyze, buildClimates, SCENARIOS } = require('../src/pipeline');
const E2 = require('../src/engine2');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const base = (o = {}) => ({ lat: -5.19, lon: -79.99, area_ha: 1, irrigation: true, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {}, ...o });
let G; const data = async () => (G ||= await gatherData(-5.19, -79.99));
const run = (o) => withDomain(async () => analyze(base(o), await data()));

test('v2: arroz + Loctao, campañas grande/chica, y declara sus parámetros provisionales', async () => {
  const r = await run();
  assert.equal(r.engine, 'v2');
  for (const s of r.strategies) for (const c of s.sequence) assert.ok(['arroz', 'loctao'].includes(c));
  const st = Object.fromEntries(r.engine_params.map((p) => [p.id, p.status]));
  assert.equal(st.rice_perc_mm_day, 'LITERATURA'); assert.equal(st.rice_slope_max_pct, 'DESACTIVADO'); assert.equal(st.fail_inviable, 'PROVISIONAL');
  assert.ok(r.engine_params.every((p) => p.source && p.status), 'todo parámetro lleva estado y fuente');
});

test('v2: la demanda de riego del arroz es mucho mayor que la del Loctao y usa percolación y saturación (FAO), no cero', async () => {
  const r = await run();
  const v = r.viability;
  assert.ok(v.arroz.B.net_water_need_mm > 900 && v.arroz.B.net_water_need_mm < 1700, `arroz chica ${v.arroz.B.net_water_need_mm} mm`);
  assert.ok(v.loctao.B.net_water_need_mm < 300 && v.loctao.A.net_water_need_mm < 300);
  assert.ok(v.arroz.A.net_water_need_range_mm[1] > v.arroz.A.net_water_need_mm && v.arroz.A.net_water_need_range_mm[0] < v.arroz.A.net_water_need_mm, 'rango FAO de percolación');
  assert.equal(r.water.rice_percolation_mm_day, 5);
});

test('v2: percolación declarada por el agricultor sustituye al valor FAO y aumenta la demanda', async () => {
  const a = await run({ water: { percolation_mm_day: 2 } }), b = await run({ water: { percolation_mm_day: 8 } });
  assert.ok(b.viability.arroz.B.net_water_need_mm > a.viability.arroz.B.net_water_need_mm + 500);
  assert.equal(b.water.rice_percolation_mm_day, 8);
});

test('v2: sin riego no se recomienda nada y se explica qué falta (no se rellenan tres tarjetas)', async () => {
  const r = await run({ irrigation: false });
  assert.equal(r.candidates_viable, 0);
  assert.equal(r.strategies.length, 1, 'solo la rotación actual como referencia');
  assert.equal(r.viability.arroz.A.status, 'inviable'); assert.equal(r.viability.arroz.B.status, 'inviable');
  assert.ok(r.no_viable && /campaña chica/.test(r.no_viable.summary));
  assert.ok(r.no_viable.what_would_help.some((t) => /volumen de riego/.test(t)));
  assert.ok(r.strategies[0].violations.length > 0, 'la actual incluye campañas inviables');
});

test('v2: una dotación insuficiente hace inviable el arroz y deja solo opciones con Loctao', async () => {
  const r = await run({ water: { supply_m3_ha: 4000 } });
  assert.equal(r.viability.arroz.A.status, 'inviable');
  assert.ok(r.strategies.length >= 2);
  const alt = r.strategies.find((s) => s.id === 'alt_a'); assert.ok(alt.sequence.every((c) => c === 'loctao'));
  assert.match(r.water.supply_basis, /4000 m³\/ha/);
});

test('v2: con dotación suficiente (14 000 m³/ha) el arroz vuelve a ser viable', async () => {
  const r = await run({ water: { supply_m3_ha: 14000 } });
  assert.notEqual(r.viability.arroz.A.status, 'inviable'); assert.notEqual(r.viability.arroz.B.status, 'inviable');
});

test('v2: "cultivo principal a conservar" se respeta y no es una regla global', async () => {
  const keep = await run({ keep_main: { crop: 'arroz', campaigns: ['A'] } });
  for (const s of keep.strategies.filter((x) => x.id !== 'current')) assert.equal(s.sequence[0], 'arroz'), assert.equal(s.sequence[2], 'arroz');
  assert.ok(keep.candidates_dropped['no conserva Arroz Tinajones como pediste'] > 0);
  const free = await run();
  assert.ok(free.strategies.some((s) => s.sequence[0] !== 'arroz'), 'sin la restricción no se fuerza arroz');
  const twice = await run({ keep_main: { crop: 'arroz', min_campaigns: 3 } });
  for (const s of twice.strategies.filter((x) => x.id !== 'current')) assert.ok(s.sequence.filter((c) => c === 'arroz').length >= 3);
});

test('v2: economía incompleta no entra al puntaje y se declara incompleta; completa sí entra', async () => {
  const inc = await run({ economics: { arroz: { yield_t_ha: 9, price_s_per_kg: 1.2 } } });
  assert.equal(inc.economics.complete, false); assert.ok(inc.economics.per_crop.arroz.missing.includes('costos')); assert.ok(inc.economics.per_crop.loctao.missing.length);
  assert.ok(!inc.strategies[1].criteria.economics, 'sin datos completos no hay criterio económico');
  assert.match(inc.economics.note, /incompleta/);
  const comp = await run({ economics: { arroz: { yield_t_ha: 9, price_s_per_kg: 1.2, cost_establishment_s_ha: 5000 }, loctao: { yield_t_ha: 2.4, price_s_per_kg: 5, cost_establishment_s_ha: 2500 } } });
  assert.equal(comp.economics.complete, true); assert.ok(comp.strategies[1].criteria.economics); assert.equal(comp.strategies[1].economics.complete, true);
});

test('v2: cada campaña de la rotación lleva viabilidad, evidencia local y demanda de agua; Loctao en la grande se marca sin evidencia directa', async () => {
  const r = await run();
  const withLoctaoA = r.strategies.flatMap((s) => s.timeline).find((t) => t.crop === 'loctao' && t.slot === 'A');
  if (withLoctaoA) assert.equal(withLoctaoA.viability.local_evidence, false);
  const t = r.strategies[0].timeline[0];
  assert.ok(t.viability.status && t.water_need_mm > 0 && t.sowing_md === '01-21' && t.duration_days > 100);
  assert.equal(r.viability.loctao.B.local_evidence, true);
});

test('v2: la comparación no cuenta dos veces el mismo beneficio (los pesos suman 1 y no hay criterio de costo ordinal)', async () => {
  const r = await run();
  const crit = r.strategies[1].criteria;
  assert.ok(!('low_cost' in crit) && !('cost' in crit), 'el costo ordinal sin fuente ya no puntúa');
  assert.ok(Math.abs(Object.values(crit).reduce((a, c) => a + c.weight, 0) - 1) < 0.02);
});

test('v2: la frecuencia de días calurosos viene de la estación SENAMHI (no de la serie de reanálisis) y es sensible al umbral', async () => {
  const g = await data();
  const built = await withDomain(async () => buildClimates(g, SCENARIOS.base));
  assert.equal(built.temp_method, 'senamhi_monthly');
  assert.ok(built.climates[0].climate.heat_obs && built.climates[0].climate.heat_obs.umbrales.includes(35));
  const dom = require('../src/pipeline').activeDomain ? null : null;
  const { evaluateSeason } = require('../src/climate'), { rotationCrops } = require('../src/morropon'), { CROPS } = require('../src/pipeline');
  const loctao = rotationCrops(CROPS.crops).find((c) => c.id === 'loctao'), slot = { id: 'A', start: { m: 1, d: 21 }, window_days: 165 };
  const clim = built.climates[0].climate;
  const h35 = evaluateSeason(clim, { ...loctao, t_stress_max: 35 }, slot, false, 110).heat_frac, h38 = evaluateSeason(clim, { ...loctao, t_stress_max: 38 }, slot, false, 110).heat_frac;
  assert.ok(h35 > h38 && h38 >= 0, `calor 35 °C ${h35} > 38 °C ${h38}`);
});

test('v2: mismas entradas → mismos resultados (reproducible)', async () => {
  const a = await run(), b = await run();
  assert.deepEqual(a.strategies.map((s) => [s.sequence.join('>'), s.score]), b.strategies.map((s) => [s.sequence.join('>'), s.score]));
  assert.deepEqual(a.sensitivity.comparisons, b.sensitivity.comparisons);
});
