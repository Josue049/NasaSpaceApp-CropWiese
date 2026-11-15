'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
require('./helpers');
process.env.FIELDSHIFT_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-db-')), 'parcels.json');
const S = require('../src/suelo');

test('textureClass: triángulo USDA', () => {
  assert.equal(S.textureClass(18, 62), 'franco-arenoso');
  assert.equal(S.textureClass(5, 92), 'arenoso');
  assert.equal(S.textureClass(50, 20), 'arcilloso');
  assert.equal(S.textureClass(20, 40), 'franco');
  assert.equal(S.textureClass(60, 60), null, 'combinación imposible');
  assert.equal(S.group3('franco-arenoso'), 'franca'); assert.equal(S.group3('arenoso'), 'arenosa'); assert.equal(S.group3('arcilloso'), 'arcillosa');
});

test('estimate: informa clase, limo e intervalo; la incertidumbre alta se declara', () => {
  const soil = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo_morropon', 'soil_-5.190_-79.990.json'), 'utf8')).data;
  const e = S.estimate(soil);
  assert.equal(e.class, 'franco-arenoso'); assert.equal(e.clay_pct, 18); assert.equal(e.sand_pct, 62); assert.equal(e.silt_pct, 20);
  assert.ok(e.groups_in_range.length > 1); assert.match(e.uncertainty, /^alta/); assert.match(e.note, /no es una medición/);
  assert.equal(S.estimate(null), null);
});

test('Servidor: /api/soil/estimate devuelve la estimación como tal y rechaza puntos fuera del ámbito', async () => {
  const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon';
  const { server } = require('../server');
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const j = await (await fetch(base + '/api/soil/estimate?lat=-5.19&lon=-79.99')).json();
    assert.equal(j.available, true); assert.equal(j.class, 'franco-arenoso'); assert.match(j.source, /SoilGrids/);
    const bad = await fetch(base + '/api/soil/estimate?lat=-6.03&lon=-76.97'); assert.equal(bad.status, 400);
  } finally { server.close(); process.env.FIELDSHIFT_DOMAIN = prev; }
});

test('Procedencia: la textura no declarada se rotula como estimación D con su clase', async () => {
  const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon';
  try {
    const { gatherData, analyze } = require('../src/pipeline');
    const r = analyze({ lat: -5.19, lon: -79.99, area_ha: 0, irrigation: true, start_slot: 'A', history: ['arroz'], priorities: {}, excluded_crops: [], market_pref: {}, engine: 'v2' }, await gatherData(-5.19, -79.99));
    const t = r.provenance.items.find((i) => i.id === 'textura');
    assert.equal(t.cat, 'D'); assert.match(t.value, /franco-arenoso/); assert.match(t.source, /no es una medición/);
  } finally { process.env.FIELDSHIFT_DOMAIN = prev; }
});
