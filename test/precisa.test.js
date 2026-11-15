'use strict';
// Instantánea no inventa datos de la parcela; Precisa usa exactamente lo declarado; lo desconocido no es cero ni «sí».
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
require('./helpers');
process.env.FIELDSHIFT_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-db-')), 'parcels.json');
const { gatherData, analyze } = require('../src/pipeline');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const base = (o = {}) => ({ lat: -5.19, lon: -79.99, area_ha: 0, irrigation: null, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {}, engine: 'v2', ...o });
let G; const run = (o) => withDomain(async () => analyze(base(o), (G ||= await gatherData(-5.19, -79.99))));
const prov = (r, id) => r.provenance.items.find((i) => i.id === id);

test('Instantánea: «no lo sé» el riego NO se interpreta como «sí»; se evalúa como escenario y se marca lo que depende de él', async () => {
  const r = await run({ irrigation: null }), si = await run({ irrigation: true });
  assert.equal(r.water.scenario, true); assert.equal(r.water.supply_category, 'E');
  assert.equal(r.water_scenarios.length, 2); assert.ok(r.water_scenarios.every((s) => /NO es una condición declarada/.test(s.label)));
  assert.equal(r.water_scenarios[1].status_by_crop.arroz.A, 'inviable', 'sin riego el arroz es inviable (requisito documentado)');
  assert.equal(r.viability.arroz.A.status, 'condicionada'); assert.equal(r.viability.arroz.A.irrigation_dependent, true);
  assert.equal(si.viability.arroz.A.status, 'favorable', 'declarar riego sí cambia el resultado');
  assert.equal(r.sensitive_to_assumptions, true);
  assert.deepEqual(r.inputs_used, [], 'sin datos declarados no hay «datos usados»');
  assert.equal(prov(r, 'riego').cat, 'E'); assert.equal(prov(si, 'riego').cat, 'C');
});

test('Instantánea no asume área, volumen de agua, economía, textura ni variedad: todo queda como no declarado', async () => {
  const r = await run();
  assert.equal(r.water.supply_mm_per_campaign, null); assert.equal(r.economics.provided, false); assert.equal(r.economics.complete, false);
  assert.ok(!r.strategies[1].criteria.economics && !r.strategies[1].criteria.market);
  assert.equal(prov(r, 'textura').cat, 'D'); assert.equal(prov(r, 'ph').cat, 'D'); assert.match(prov(r, 'ph').source, /no una medición/);
  assert.equal(prov(r, 'prioridades').cat, 'E'); assert.match(prov(r, 'prioridades').value, /neutras/);
  assert.equal(r.provenance.summary.C ?? 0, 0, 'nada procede del agricultor');
});

test('Lo desconocido no es cero: campo vacío no cambia el resultado; un 0 declarado sí', async () => {
  const a = await run({ irrigation: true }), b = await run({ irrigation: true, water: { supply_m3_ha: null, percolation_mm_day: null } });
  assert.deepEqual(a.strategies.map((s) => s.score), b.strategies.map((s) => s.score));
  assert.equal(b.water.rice_percolation_mm_day, 5, 'sin dato: referencia FAO (rango), no 0');
  const cero = await run({ irrigation: true, water: { supply_m3_ha: 0 } });
  assert.equal(cero.viability.arroz.A.status, 'inviable', 'una dotación declarada de 0 sí es una declaración');
});

test('Parámetros hipotéticos (ciclo y umbral de calor del Loctao) se propagan como rango y se marcan E; el ciclo declarado los fija', async () => {
  const r = await run({ irrigation: true }), d = await run({ irrigation: true, cycle_days: { loctao: 70 } });
  const l = r.viability.loctao.B;
  assert.deepEqual(l.uncertainty.map((u) => u.param).sort(), ['ciclo (días)', 'umbral de calor (°C)']);
  assert.ok(l.uncertainty.every((u) => u.cat === 'E'));
  assert.ok(l.duration_range_days[1] > l.duration_range_days[0], 'la duración se muestra como rango');
  assert.ok(l.heat_range[1] > l.heat_range[0] + 0.05, 'el calor se muestra como rango');
  assert.equal(prov(r, 'ciclo_loctao').cat, 'E');
  assert.ok(!d.viability.loctao.B.uncertainty.some((u) => u.param === 'ciclo (días)'), 'con ciclo declarado deja de propagarse el rango');
  assert.ok(Math.abs(d.viability.loctao.B.duration_days - 70) <= 1, 'ciclo declarado ≈ 70 d (el reparto por etapas redondea)'); assert.equal(prov(d, 'ciclo_loctao').cat, 'C');
  assert.ok(d.inputs_used.some((u) => /Loctao/.test(u.field)));
});

test('Una hipótesis nunca produce una prohibición: los umbrales metodológicos dan «condicionada»; «inviable» solo por límites documentados', async () => {
  const baja = await run({ irrigation: true, water: { supply_m3_ha: 4000 } });
  assert.equal(baja.viability.arroz.A.status, 'condicionada'); assert.equal(baja.viability.arroz.A.severity, 'alta');
  assert.ok(Object.values(baja.viability.arroz.A.basis).includes('metodológico'));
  const ph = await run({ irrigation: true, soil: { ph: 8.8 } });
  assert.equal(ph.viability.loctao.B.status, 'inviable'); assert.ok(Object.values(ph.viability.loctao.B.basis).includes('documentado'));
  const sin = await run({ irrigation: false });
  assert.equal(sin.viability.arroz.A.status, 'inviable'); assert.ok(Object.values(sin.viability.arroz.A.basis).includes('documentado'));
  for (const st of [baja, ph, sin]) for (const [c, o] of Object.entries(st.viability)) for (const [s, x] of Object.entries(o)) if (x.status === 'inviable') assert.ok(Object.entries(x.basis).some(([k, b]) => b === 'documentado' && x.reasons[k]), `inviable sin límite documentado: ${c}.${s}`);
});

test('Textura declarada: ajusta la percolación del arroz con el valor FAO de esa textura y lo declara como dato C/B', async () => {
  const a = await run({ irrigation: true, soil: { texture: 'arenosa' } }), c = await run({ irrigation: true, soil: { texture: 'arcillosa' } }), n = await run({ irrigation: true });
  assert.equal(a.water.rice_percolation_mm_day, 8); assert.equal(c.water.rice_percolation_mm_day, 3);
  assert.ok(a.viability.arroz.B.net_water_need_mm > n.viability.arroz.B.net_water_need_mm && c.viability.arroz.B.net_water_need_mm < n.viability.arroz.B.net_water_need_mm);
  assert.equal(prov(a, 'textura').cat, 'C'); assert.match(a.water.rice_percolation_basis, /textura declarada/);
});

test('Fecha prevista de siembra: afecta solo a la primera campaña y se marca declarada', async () => {
  const r = await run({ irrigation: true, first_sowing_date: '2027-03-01' }), b = await run({ irrigation: true });
  const t = r.strategies[1].timeline;
  assert.equal(t[0].sowing_md, '03-01'); assert.equal(t[0].sowing_declared, true); assert.equal(t[1].sowing_md, '07-15'); assert.equal(t[2].sowing_declared, false);
  assert.equal(r.context.first_sowing_date, '2027-03-01'); assert.equal(prov(r, 'campanas').cat, 'C');
  assert.notEqual(r.viability.arroz.F.heat_frac, b.viability.arroz.A.heat_frac, 'el calor de la ventana cambia con la fecha');
});

test('Historial: «no lo sé» en la campaña anterior usa solo el cultivo actual y lo dice', async () => {
  const r = await run({ irrigation: true, history: ['arroz'] });
  assert.match(r.strategies[0].label, /proyectado/); assert.equal(r.strategies[0].sequence.join(''), 'arroz'.repeat(4));
});

test('Cada dato declarado aparece en «inputs_used» con su efecto, y solo los declarados', async () => {
  const r = await run({ irrigation: true, water: { supply_m3_ha: 12000, percolation_mm_day: 4 }, soil: { texture: 'franca', ph: 6.5 }, first_sowing_date: '2027-03-01', cycle_days: { arroz: 110 }, keep_main: { crop: 'arroz', campaigns: ['A'] }, economics: { arroz: { yield_t_ha: 9 } } });
  const f = r.inputs_used.map((u) => u.field).join(' | ');
  for (const k of ['riego', 'agua por campaña', 'percolación', 'textura', 'pH', 'fecha prevista', 'ciclo del Arroz', 'cultivo principal', 'económicos']) assert.match(f, new RegExp(k), k);
  assert.ok(r.inputs_used.every((u) => u.used_for));
  assert.equal(prov(r, 'ph').cat, 'C');
});

test('Servidor: «no lo sé» (null) llega como no declarado; vacíos y valores inválidos se ignoran; no se asume riego', async () => {
  const { server } = require('../server');
  await withDomain(async () => {
    await new Promise((r) => server.listen(0, r));
    const base2 = `http://127.0.0.1:${server.address().port}`;
    try {
      const post = async (b) => (await fetch(base2 + '/api/rotation/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
      const j = await post({ lat: -5.19, lon: -79.99, history: ['arroz'], start_slot: 'A', irrigation: null, area_ha: '', mode: 'instantanea' });
      assert.equal(j.water.scenario, true); assert.equal(j.mode, 'instantanea');
      const j2 = await post({ lat: -5.19, lon: -79.99, history: ['arroz'], start_slot: 'A', irrigation: null, mode: 'precisa', first_sowing_date: 'no-es-fecha', cycle_days: { arroz: '', loctao: 5 }, soil: { ph: 99, texture: 'roca' }, economics: { arroz: { yield_t_ha: '' } } });
      assert.deepEqual(j2.inputs_used, [], 'valores vacíos o inválidos no cuentan como declarados');
      const j3 = await post({ lat: -5.19, lon: -79.99, history: ['arroz'], start_slot: 'A', irrigation: 'no', mode: 'precisa' });
      assert.equal(j3.viability.arroz.A.status, 'inviable');
      const j4 = await post({ lat: -5.19, lon: -79.99, history: ['arroz'], start_slot: 'A', irrigation: null, mode: 'precisa', soil: { ph: 6.8 }, cycle_days: { loctao: 65 } });
      assert.equal(j4.mode, 'precisa'); assert.ok(j4.inputs_used.some((u) => u.field === 'pH del suelo'));
    } finally { server.close(); }
  });
});
