'use strict';
// Verificación Sentinel-2: clasificación del patrón de NDVI y la instantánea real del punto demo (sin red).
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { classify, checkParcel } = require('../src/satellite');
const { PROFILE } = require('../src/morropon');

const mk = (vals, scl = 4) => vals.map((v, i) => ({ date: `2026-0${1 + (i % 9)}-${String(1 + i).padStart(2, '0')}`, ndvi: v, scl, valid: true }));

test('Clasificación: estacional, permanente, sin vegetación e insuficiente', () => {
  assert.equal(classify(mk([0.2, 0.3, 0.5, 0.7, 0.8, 0.6, 0.3, 0.2])).pattern, 'estacional');
  assert.equal(classify(mk([0.8, 0.82, 0.79, 0.81, 0.83, 0.8, 0.82, 0.8])).pattern, 'vegetacion_permanente');
  assert.equal(classify(mk([0.05, 0.1, 0.08, 0.12, 0.1, 0.09, 0.07])).pattern, 'suelo_agua_o_urbano');
  assert.equal(classify(mk([0.2, 0.8, 0.5])).pattern, 'insuficiente');
});

test('Las observaciones inválidas (nubes) no cuentan', () => {
  const s = mk([0.2, 0.3, 0.5, 0.7, 0.8, 0.6, 0.3, 0.2]).map((x, i) => (i < 4 ? { ...x, valid: false, scl: 9 } : x));
  assert.equal(classify(s).n_valid, 4);
  assert.equal(classify(s).pattern, 'insuficiente');
});

test('Punto demo (instantánea Sentinel-2 real): patrón estacional con pico en mayo y contraste con la fenología', async () => {
  const r = await checkParcel(-5.1944, -79.9867, PROFILE);
  assert.equal(r.cached, true);
  assert.equal(r.classification.pattern, 'estacional');
  assert.ok(r.classification.n_valid >= 15);
  assert.equal(r.classification.peak_date, '2026-05-05');
  assert.equal(r.phenology_contrast.within_window, false);
  assert.deepEqual(r.phenology_contrast.expected_peak_window, ['2026-04-10', '2026-04-24']);
  assert.ok(r.limitations.length >= 4 && /no distingue arroz/i.test(r.limitations.join(' ')));
});
