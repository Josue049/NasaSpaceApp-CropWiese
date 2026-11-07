'use strict';
// Invariantes de viabilidad agronómica sobre una rejilla de condiciones. Distingue CAPACIDAD (reglas duras)
// de CONVENIENCIA (puntaje): ninguna estrategia propuesta puede violar la capacidad aunque puntúe bien.
const test = require('node:test');
const assert = require('node:assert/strict');
const { demoData, baseInput, analyze } = require('./helpers');
const { CROPS } = require('../src/pipeline');
const byId = Object.fromEntries(CROPS.crops.map((c) => [c.id, c]));

const grid = [];
for (const slot of ['A', 'B']) for (const irr of [false, true]) for (const dt of [-3, 0, 2]) for (const pf of [0.8, 1]) for (const slope of [0.8, 30]) {
  grid.push({ slot, irr, dt, pf, slope });
}
const histories = [['maiz', 'maiz', 'maiz', 'maiz'], ['frijol', 'maiz'], ['tomate'], ['mucuna', 'camote', 'frijol']];

test('Invariantes de capacidad en todas las estrategias propuestas (rejilla de condiciones)', async () => {
  const g0 = await demoData();
  let checked = 0, strategiesChecked = 0;
  for (const [i, c] of grid.entries()) {
    const g = { ...g0, slope: { ...g0.slope, data: { ...g0.slope.data, slope_pct: c.slope } } };
    const input = { ...baseInput(), start_slot: c.slot, irrigation: c.irr, history: histories[i % histories.length], excluded_crops: i % 5 === 0 ? ['camote'] : [] };
    const r = analyze(input, g, { id: 'x', label: 'x', precip_factor: c.pf, temp_delta: c.dt, hypothetical: true });
    checked++;
    const elev = g0.slope.data.elevation_m;
    const hist = input.history.slice(-2);
    for (const s of r.strategies.filter((x) => x.id !== 'current')) {
      strategiesChecked++;
      const ctxLabel = JSON.stringify({ c, h: input.history, s: s.id, seq: s.sequence });
      const chain = [...hist, ...s.sequence];
      s.timeline.forEach((t) => {
        const crop = byId[t.crop];
        assert.ok(t.thermal.complete_frac >= 0.5, `I1 ciclo completable ${ctxLabel}`);
        assert.ok(t.duration_days <= (t.slot === 'A' ? 165 : 200), `I1b duración dentro de ventana ${ctxLabel}`);
        if (!c.irr && crop.regime === 'irrigated_required') assert.fail(`I5 cultivo de riego en secano ${ctxLabel}`);
        if (c.slope > 25) assert.ok(require('../src/climate').coverOf(crop) >= 0.5, `I6 cobertura en pendiente ${ctxLabel}`);
        assert.ok(!(input.excluded_crops || []).includes(t.crop), `I7 exclusión del agricultor ${ctxLabel}`);
        if (crop.eco.altmx != null) assert.ok(elev <= crop.eco.altmx, `I8 altitud ${ctxLabel}`);
        if (!c.irr && crop.regime !== 'irrigated_required') assert.ok(t.water_coverage_pct >= 50, `I9 suficiencia hídrica en secano ${ctxLabel}`);
        if (t.thermal.status === 'marginal') assert.ok(s.risks.some((x) => x.includes(t.crop_name) && /depende de la temperatura/.test(x)), `I10 riesgo térmico visible ${ctxLabel}`);
      });
      for (let k = 2; k < chain.length; k++) assert.ok(!(chain[k] === chain[k - 1] && chain[k] === chain[k - 2]), `I2 3 seguidos ${ctxLabel}`);
      for (let k = 1; k < chain.length; k++) assert.ok(!(byId[chain[k]].family === 'Solanaceae' && byId[chain[k - 1]].family === 'Solanaceae'), `I4 solanáceas ${ctxLabel}`);
      assert.ok(s.sequence.filter((x) => byId[x].type === 'cover').length <= 1, `I3 abonos verdes ${ctxLabel}`);
    }
    const [A, B] = [r.strategies.find((x) => x.id === 'alt_a'), r.strategies.find((x) => x.id === 'alt_b')];
    if (A && B) assert.ok(A.sequence.filter((x, k) => x !== B.sequence[k]).length >= 1);
  }
  assert.ok(checked === grid.length && strategiesChecked > 40, `se comprobaron ${strategiesChecked} estrategias`);
});

test('Determinismo: misma entrada, misma salida (incluidas comparaciones por Monte Carlo)', async () => {
  const g = await demoData();
  const strip = (r) => JSON.stringify({ ...r, generated_at: 0 });
  assert.equal(strip(analyze(baseInput(), g)), strip(analyze(baseInput(), g)));
});

test('Riego: el índice de agua de cada campaña mejora (o iguala) respecto del secano, y no empeora el riesgo', async () => {
  const g = await demoData();
  const dry = analyze({ ...baseInput(), irrigation: false }, g), wet = analyze({ ...baseInput(), irrigation: true }, g);
  const w = (r) => r.strategies.find((s) => s.id === 'current').criteria.water.score;
  assert.ok(w(wet) > w(dry));
  const res = (r) => r.strategies.find((s) => s.id === 'current').criteria.resilience.score;
  assert.ok(res(wet) >= res(dry));
});
