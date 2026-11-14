'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { assessSupport, DOMAINS } = require('../src/pipeline');

const fakeG = { slope: { ok: true, data: { elevation_m: 120, slope_pct: 1 } }, power: { ok: true, data: { geometry: { coordinates: [0, 0, 130] } } }, soil: { ok: true } };
const withDomain = (id, fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = id; try { return fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };

test('Morropón: la estación SENAMHI cae dentro del dominio', () => {
  const { lat, lon } = DOMAINS.morropon.center;
  const s = withDomain('morropon', () => assessSupport({ lat, lon }, fakeG, []));
  assert.ok(!s.blockers.some((b) => /Fuera del alcance/.test(b)));
});

test('Morropón: Moyobamba y el Bajo Piura (Cura Morí) quedan fuera y se bloquean', () => {
  for (const [lat, lon] of [[-6.034, -76.971], [-5.383, -80.667]]) {
    const s = withDomain('morropon', () => assessSupport({ lat, lon }, fakeG, []));
    assert.equal(s.level, 'no_recomendable');
    assert.ok(s.blockers.some((b) => /Morropón/.test(b)));
  }
});

test('Dominio peru (heredado): Moyobamba no se bloquea por dominio', () => {
  const s = withDomain('peru', () => assessSupport({ lat: -6.034, lon: -76.971 }, fakeG, []));
  assert.ok(!s.blockers.some((b) => /Fuera del alcance/.test(b)));
});
