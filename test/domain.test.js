'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { assessSupport, DOMAINS } = require('../src/pipeline');

const fakeG = { slope: { ok: true, data: { elevation_m: 30, slope_pct: 1 } }, power: { ok: true, data: { geometry: { coordinates: [0, 0, 40] } } }, soil: { ok: true } };
const withDomain = (id, fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = id; try { return fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };

test('Bajo Piura: Cura Morí cae dentro del dominio', () => {
  const { lat, lon } = DOMAINS.bajo_piura.study_district;
  const s = withDomain('bajo_piura', () => assessSupport({ lat, lon }, fakeG, []));
  assert.ok(!s.blockers.some((b) => /Fuera del dominio/.test(b)));
});

test('Bajo Piura: Moyobamba queda fuera y se bloquea', () => {
  const s = withDomain('bajo_piura', () => assessSupport({ lat: -6.034, lon: -76.971 }, fakeG, []));
  assert.equal(s.level, 'no_recomendable');
  assert.ok(s.blockers.some((b) => /Bajo Piura/.test(b)));
});

test('Dominio peru (heredado): Moyobamba no se bloquea por dominio', () => {
  const s = withDomain('peru', () => assessSupport({ lat: -6.034, lon: -76.971 }, fakeG, []));
  assert.ok(!s.blockers.some((b) => /Fuera del dominio/.test(b)));
});
