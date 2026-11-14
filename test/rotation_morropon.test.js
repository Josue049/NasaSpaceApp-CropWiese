'use strict';
// Rotación en Morropón con arroz Tinajones + frijol (instantánea real en data/demo_morropon, sin red).
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { gatherData, analyze } = require('../src/pipeline');
const { ROTATION_CROPS, rotationCrops } = require('../src/morropon');
const { CROPS } = require('../src/pipeline');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const input = { lat: -5.19, lon: -79.99, area_ha: 1, irrigation: true, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {} };

test('Rotación Morropón: solo arroz Tinajones y frijol; campañas grande/chica', async () => {
  await withDomain(async () => {
    const g = await gatherData(-5.19, -79.99);
    const r = analyze(input, g);
    assert.deepEqual(r.domain.crops, ROTATION_CROPS);
    assert.equal(r.domain.slots[0].start.m, 1); assert.equal(r.domain.slots[0].start.d, 21);
    for (const s of r.strategies) for (const c of s.sequence) assert.ok(ROTATION_CROPS.includes(c), `cultivo inesperado ${c}`);
    assert.ok(r.domain.temp_offsets_c, 'corrección empírica de temperatura aplicada');
  });
});

test('El arroz de la rotación usa el ciclo Tinajones observado (114 días efectivos)', () => {
  const a = rotationCrops(CROPS.crops).find((c) => c.id === 'arroz');
  assert.equal(a.cycle.ini + a.cycle.dev + a.cycle.mid + a.cycle.late, 114);
  assert.match(a.name, /Tinajones/);
});

test('Fuera de Morropón no se generan estrategias', async () => {
  await withDomain(async () => {
    const g = await gatherData(-5.19, -79.99);
    const r = analyze({ ...input, lat: -6.034, lon: -76.971 }, g);
    assert.equal(r.unsupported, true); assert.equal(r.strategies.length, 0);
  });
});
