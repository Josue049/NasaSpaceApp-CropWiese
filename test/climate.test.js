'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { demoData, SCENARIOS } = require('./helpers');
const { et0Day, kcAt, cycleLength, buildClimate, evaluateSeason, SLOTS, awcFromSoil } = require('../src/climate');
const ds = require('../src/datasources');
const { buildClimates, CROPS } = require('../src/pipeline');
const maiz = CROPS.crops.find((c) => c.id === 'maiz');

test('ET0 FAO-56: rango plausible para trópico húmedo y monotonía con la radiación', () => {
  const base = { tmean: 23, tmax: 28, tmin: 18.5, rh: 76, ws: 1, rs: 16, lat: -6, doy: 100, z: 900 };
  const e = et0Day(base);
  assert.ok(e > 2 && e < 5, `ET0=${e}`);
  assert.ok(et0Day({ ...base, rs: 22 }) > e);
  assert.ok(et0Day({ ...base, rh: 50 }) > e, 'menor humedad -> mayor ET0');
});

test('ET0: límite inferior de viento u2 >= 0,5 m/s', () => {
  const b = { tmean: 23, tmax: 28, tmin: 18.5, rh: 76, rs: 16, lat: -6, doy: 100, z: 900 };
  assert.equal(et0Day({ ...b, ws: 0 }), et0Day({ ...b, ws: 0.3 }));
  assert.ok(et0Day({ ...b, ws: 2 }) > et0Day({ ...b, ws: 0.3 }));
});

test('Kc por etapas: valores en los límites de FAO-56', () => {
  assert.equal(kcAt(maiz, 0), maiz.kc.ini);
  assert.equal(kcAt(maiz, maiz.cycle.ini + maiz.cycle.dev + 1), maiz.kc.mid);
  assert.ok(Math.abs(kcAt(maiz, cycleLength(maiz) - 1) - maiz.kc.end) < 0.05);
  const mid = kcAt(maiz, maiz.cycle.ini + maiz.cycle.dev / 2);
  assert.ok(mid > maiz.kc.ini && mid < maiz.kc.mid);
});

test('Datos reales de la instantánea: sin faltantes, rangos válidos y alerta de viento', async () => {
  const g = await demoData();
  assert.ok(g.power.ok && g.era5.ok && g.slope.ok && g.soil.ok);
  assert.equal(g.imergMissing.length, 0);
  const issues = ds.validatePower(g.power.data);
  assert.ok(!issues.some((i) => /fuera de|relleno/.test(i)), issues.join('; '));
  assert.ok(issues.some((i) => /WS2M/.test(i)), 'debe advertir el viento irreal');
});

test('Climatología: fechas y unidades coherentes (anual IMERG/ERA5 en rango, POWER más seco)', async () => {
  const g = await demoData();
  const { climates } = buildClimates(g);
  const by = Object.fromEntries(climates.map((c) => [c.id, c.climate]));
  assert.equal(by.imerg.years.length, 9);
  assert.equal(by.imerg.years[0], 2015); assert.equal(by.imerg.years.at(-1), 2023);
  for (const c of climates) {
    assert.ok(c.climate.annual.et0_mm > 900 && c.climate.annual.et0_mm < 1500, `ET0 ${c.id}`);
    assert.equal(c.climate.monthly.length, 12);
  }
  assert.ok(by.power.annual.precip_mm < by.imerg.annual.precip_mm, 'POWER subestima la lluvia en este punto (hallazgo documentado)');
});

test('Balance hídrico: ETa/ETc en [0,1]; riego reduce riesgo; escenario seco empeora', async () => {
  const g = await demoData();
  const base = buildClimates(g, SCENARIOS.base).climates.find((c) => c.id === 'imerg').climate;
  const dry = buildClimates(g, SCENARIOS.dry).climates.find((c) => c.id === 'imerg').climate;
  const awc = awcFromSoil(g.soil.data);
  for (const slot of SLOTS) {
    const s = evaluateSeason(base, maiz, slot, false, awc);
    assert.ok(s.sat > 0 && s.sat <= 1 && s.sat_mid <= 1);
    assert.ok(s.n_years >= 8);
    const ir = evaluateSeason(base, maiz, slot, true, awc);
    assert.ok(ir.drought_frac <= s.drought_frac);
    const sd = evaluateSeason(dry, maiz, slot, false, awc);
    assert.ok(sd.sat <= s.sat + 1e-9, 'menos lluvia y más calor no deben mejorar la suficiencia hídrica');
  }
});

test('buildClimate: omite días con dato faltante (-999) sin inventar valores', () => {
  const raw = JSON.parse(JSON.stringify({ geometry: { coordinates: [-76.9, -6, 900] }, properties: { parameter: {
    PRECTOTCORR: { 20200101: 1, 20200102: -999 }, T2M: { 20200101: 22, 20200102: 22 }, T2M_MAX: { 20200101: 27, 20200102: 27 }, T2M_MIN: { 20200101: 18, 20200102: 18 },
    RH2M: { 20200101: 80, 20200102: 80 }, WS2M: { 20200101: 1, 20200102: 1 }, ALLSKY_SFC_SW_DWN: { 20200101: 15, 20200102: 15 } } } }));
  const c = buildClimate(raw);
  assert.equal(c.days.length, 1);
});

test('Corrección por altitud: parcela más alta que la celda POWER es más fría (−6,5 °C/km) y sin elevación no cambia nada', async () => {
  const g = await demoData();
  const raw = g.power.data, cell = raw.geometry.coordinates[2];
  const base = buildClimate(raw, { yearRange: [2020, 2020] });
  const alta = buildClimate(raw, { yearRange: [2020, 2020], elevation: cell + 1000 });
  assert.equal(base.lapse_c, 0);
  assert.ok(Math.abs(alta.lapse_c + 6.5) < 1e-9);
  assert.ok(Math.abs(base.monthly[0].tmean - alta.monthly[0].tmean - 6.5) < 1e-6);
  assert.ok(alta.annual.et0_mm < base.annual.et0_mm); // más frío → menor ET0
});
