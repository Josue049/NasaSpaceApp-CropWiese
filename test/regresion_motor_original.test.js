'use strict';
// El motor original (v1) con el método de temperatura anterior debe seguir dando los puntajes de referencia de la aplicación original.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { gatherData, analyze, SCENARIOS } = require('../src/pipeline');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const input = (o = {}) => ({ lat: -5.19, lon: -79.99, area_ha: 1, irrigation: true, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {}, ...o });

test('Referencia del motor original: arroz-arroz, riego, inicio grande → 53.9 / 65.5 / 62.5', async () => {
  await withDomain(async () => {
    const g = await gatherData(-5.19, -79.99);
    const r = analyze(input({ engine: 'v1' }), g, { ...SCENARIOS.base, temp_method: 'legacy' });
    assert.deepEqual(r.strategies.map((s) => `${s.id}:${s.sequence.join('>')}:${s.score}`), ['current:arroz>arroz>arroz>arroz:53.9', 'alt_a:frijol>arroz>frijol>arroz:65.5', 'alt_b:frijol>frijol>arroz>frijol:62.5']);
    assert.equal(r.temperature.method, 'legacy');
  });
});

test('Referencia del motor original: arroz-frijol, riego, inicio chica → 65.5 / 59.9 / 59.9', async () => {
  await withDomain(async () => {
    const g = await gatherData(-5.19, -79.99);
    const r = analyze(input({ engine: 'v1', history: ['arroz', 'frijol'], start_slot: 'B' }), g, { ...SCENARIOS.base, temp_method: 'legacy' });
    assert.deepEqual(r.strategies.map((s) => s.score), [65.5, 59.9, 59.9]);
  });
});
