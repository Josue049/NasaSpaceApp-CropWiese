'use strict';
// Demo de arroz Tinajones en Morropón: el orden de fechas usa SOLO C2; C1 y C7 no se puntúan (instantánea real, sin red).
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { gatherData } = require('../src/pipeline');
const { analyzeRice, DOMAIN, WEIGHTS } = require('../src/rice');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const run = async (extra = {}) => withDomain(async () => analyzeRice({ ...DOMAIN.center, area_ha: 1, ...extra }, await gatherData(DOMAIN.center.lat, DOMAIN.center.lon)));

test('Pesos de diseño 50/40/10 y diagnóstico exploratorio, nunca recomendación', async () => {
  const r = await run({ sowing_date: '2026-01-21' });
  assert.deepEqual({ C1: WEIGHTS.C1, C2: WEIGHTS.C2, C7: WEIGHTS.C7 }, { C1: 0.5, C2: 0.4, C7: 0.1 });
  assert.equal(r.criteria_diagnostic.status, 'EXPLORATORIO_NO_RECOMENDACION');
  assert.equal(r.criteria_diagnostic.may_label_as_recommendation, false);
  assert.equal(r.criteria_diagnostic.criteria.C1.score, null, 'C1 no se puntúa sin dotación de riego');
  assert.equal(r.criteria_diagnostic.complete_score, null);
});

test('El índice de cada fecha es exactamente C2 (0,6·ciclo + 0,4·(1−calor en floración))', async () => {
  const r = await run();
  for (const w of r.windows) {
    const comp = (w.complete_frac + w.complete_frac_cold) / 2;
    const c2 = 0.6 * comp + 0.4 * (1 - w.heat_frac_flowering);
    assert.ok(Math.abs(w.index - 100 * c2) < 0.6, `${w.month}-${w.day}: índice ${w.index} vs C2 ${100 * c2}`);
    assert.equal('water_score' in w, false, 'el agua no entra en el índice');
  }
  assert.ok('informative' in r.c2_spread);
});

test('Fuera de Morropón no hay fechas ni criterios', async () => {
  const r = await withDomain(async () => analyzeRice({ lat: -6.034, lon: -76.971, area_ha: 1 }, await gatherData(DOMAIN.center.lat, DOMAIN.center.lon)));
  assert.equal(r.unsupported, true); assert.equal(r.windows.length, 0);
});
