'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { demoData, baseInput, analyze, SCENARIOS } = require('./helpers');
const { devRate, tempUncertainty, evaluateSeason, SLOTS, sowingWindows } = require('../src/climate');
const { assessSupport, buildClimates, CROPS } = require('../src/pipeline');
const crop = (id) => CROPS.crops.find((c) => c.id === id);
const cold = (dt) => ({ id: 'cold', label: 'frío', precip_factor: 1, temp_delta: dt, hypothetical: true });

test('Tasa de desarrollo EcoCrop: 0 fuera de [TMIN,TMAX], 1 en el óptimo, lineal entre medias', () => {
  const eco = crop('camote').eco; // 10 / 18–28 / 38
  assert.equal(devRate(eco, 10), 0); assert.equal(devRate(eco, 38), 0); assert.equal(devRate(eco, 5), 0);
  assert.equal(devRate(eco, 18), 1); assert.equal(devRate(eco, 25), 1);
  assert.ok(Math.abs(devRate(eco, 14) - 0.5) < 1e-9);
  assert.ok(Math.abs(devRate(eco, 33) - 0.5) < 1e-9);
  assert.equal(devRate(undefined, 3), 1); // sin parámetros: ciclo fijo
});

test('Frío alarga el ciclo: la misma siembra dura más y puede dejar de completarse', async () => {
  const g = await demoData();
  const mk = (dt) => buildClimates(g, cold(dt)).climates.find((c) => c.id === 'imerg').climate;
  const warm = evaluateSeason(mk(0), crop('camote'), SLOTS[0], false, 110);
  const chill = evaluateSeason(mk(-7), crop('camote'), SLOTS[0], false, 110);
  assert.ok(warm.complete_frac >= 0.9);
  assert.ok(chill.complete_frac < 0.5, 'a ~16 °C el camote no completa 150 días efectivos en 165 d');
  const beans = evaluateSeason(mk(-7), crop('frijol'), SLOTS[0], false, 110);
  assert.ok(beans.complete_frac >= 0.9, 'el frijol (óptimo desde 16 °C) sigue completándose');
});

test('Exclusión por temperatura: con ~16 °C no se recomienda camote ni zapallo; el motor no inventa alternativas', async () => {
  const g = await demoData();
  const r = analyze({ ...baseInput(), history: ['maiz', 'frijol', 'maiz', 'frijol'] }, g, cold(-7));
  const slotsBlocked = (id) => r.eligibility.every((e) => e.blocked[id]);
  assert.ok(slotsBlocked('camote') && slotsBlocked('zapallo') && slotsBlocked('tomate'));
  for (const s of r.strategies.filter((x) => x.id !== 'current')) for (const c of s.sequence) assert.ok(!['camote', 'zapallo', 'tomate'].includes(c));
});

test('Sin alternativas viables: no falla, devuelve solo la rotación actual y una limitación explícita', async () => {
  const g = await demoData();
  const r = analyze({ ...baseInput(), history: ['maiz', 'frijol', 'maiz', 'frijol'] }, g, cold(-9));
  assert.ok(r.strategies.length >= 1 && r.strategies[0].id === 'current');
  if (r.strategies.length === 1) assert.ok(r.limitations.some((x) => /ninguna alternativa viable/.test(x)));
});

test('Altitud: un cultivo por encima de su altitud máxima EcoCrop se excluye', async () => {
  const g = await demoData();
  const hi = { ...g, slope: { ...g.slope, data: { ...g.slope.data, elevation_m: 1700 } } }; // maní: altmx 1650
  const r = analyze({ ...baseInput(), history: ['frijol', 'maiz'] }, hi, SCENARIOS.base);
  assert.ok(r.eligibility.every((e) => (e.blocked.mani || []).some((m) => /altitud/.test(m))));
});

test('La incertidumbre de temperatura crece con la diferencia de altitud celda-parcela', async () => {
  const g = await demoData();
  const c = buildClimates(g).climates[0].climate;
  const u0 = tempUncertainty({ ...c, elevation_m: 900, cell_elevation_m: 900 });
  const u1 = tempUncertainty({ ...c, elevation_m: 900, cell_elevation_m: 2100 });
  assert.ok(Math.abs(u0 - 1.9) < 1e-9 && u1 > u0 && u1 > 2.4);
});

test('Soporte por ubicación: celda POWER >1000 m distinta ⇒ no recomendable y sin estrategias; fuera de Perú ⇒ limitada', async () => {
  const g = await demoData();
  const far = { ...g, power: { ...g.power, data: { ...g.power.data, geometry: { ...g.power.data.geometry, coordinates: [-76.9, -6, 2300] } } } };
  const r = analyze(baseInput(), far, SCENARIOS.base);
  assert.equal(r.support.level, 'no_recomendable');
  assert.equal(r.unsupported, true); assert.deepEqual(r.strategies, []);
  assert.ok(r.context && r.limitations.length);
  const climates = buildClimates(g).climates;
  const out = assessSupport({ lat: 40, lon: -3 }, g, climates);
  assert.ok(['limitada', 'no_recomendable'].includes(out.level));
  assert.ok(out.cautions.concat(out.blockers).some((x) => /dominio probado/.test(x)));
});

test('Pendiente > 50 % ⇒ no recomendable; datos de suelo ausentes ⇒ solo limitada', async () => {
  const g = await demoData();
  const steep = { ...g, slope: { ...g.slope, data: { ...g.slope.data, slope_pct: 60 } } };
  assert.equal(analyze(baseInput(), steep, SCENARIOS.base).support.level, 'no_recomendable');
  const nosoil = { ...g, soil: { ok: false, error: 'caído', provenance: {} } };
  const r = analyze(baseInput(), nosoil, SCENARIOS.base);
  assert.equal(r.support.level, 'limitada'); assert.ok(r.strategies.length >= 2);
});

test('Comparación entre estrategias: se clasifica (equivalentes / preferible) con rango de diferencia', async () => {
  const g = await demoData();
  const c = analyze(baseInput(), g, SCENARIOS.base).sensitivity.comparisons;
  for (const k of ['a_vs_current', 'b_vs_current', 'a_vs_b']) {
    assert.ok(['equivalentes', 'indistinguibles', 'probablemente_preferible', 'claramente_preferible'].includes(c[k].level));
    assert.equal(c[k].delta_p05_p50_p95.length, 3);
  }
});

test('Ventanas de siembra: estados válidos, con incertidumbre térmica aplicada', async () => {
  const g = await demoData();
  const clim = buildClimates(g).climates[0].climate;
  const w = sowingWindows(clim, crop('camote'), false, 110, { step: 30, dT: 1.9 });
  assert.ok(w.length >= 12 && w.every((x) => ['viable', 'marginal', 'no_viable'].includes(x.status)));
  assert.ok(w.every((x) => x.complete_frac_cold <= x.complete_frac + 1e-9));
});

test('Caché IMERG separada por producto (datatype en el nombre del archivo)', () => {
  const fs = require('fs'), path = require('path');
  const names = fs.readdirSync(path.join(__dirname, '..', 'data', 'demo')).filter((f) => f.startsWith('imerg'));
  assert.ok(names.some((f) => f.startsWith('imerg226_')) && names.some((f) => f.startsWith('imerg26_')));
  assert.ok(!names.some((f) => /^imerg_/.test(f)));
});
