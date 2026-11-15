'use strict';
// La ubicación elegida por el usuario debe llegar a las fuentes: clima por celda nativa, elevación/pendiente/suelo por punto.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const L = require('../src/location');
const ds = require('../src/datasources');
const pipeline = require('../src/pipeline');
const { PROFILE } = require('../src/morropon');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const ST = PROFILE.station; // { lat: -5.19, lon: -79.99 }

test('resolveCells: la estación de referencia cae en su propia celda y conserva sus coordenadas (compatibilidad con la demo)', () => {
  const r = L.resolveCells(ST.lat, ST.lon, ST);
  for (const src of ['power', 'era5', 'imerg']) {
    assert.equal(r.sources[src].same_cell_as_station, true, src);
    assert.deepEqual(r.sources[src].query, { lat: ST.lat, lon: ST.lon }, src);
  }
});

test('resolveCells: puntos de una misma celda comparten clave; puntos de celdas distintas no', () => {
  const a = L.cellOf('power', -5.12, -80.05), b = L.cellOf('power', -5.20, -79.95), c = L.cellOf('power', -5.28, -80.08);
  assert.equal(a.key, b.key, 'norte y centro están en la misma celda POWER (lat −5,0)');
  assert.notEqual(a.key, c.key, 'el sur del recuadro cae en otra celda POWER (lat −5,5)');
  const i1 = L.cellOf('imerg', -5.19, -79.99), i2 = L.cellOf('imerg', -5.11, -79.90);
  assert.notEqual(i1.key, i2.key, 'IMERG (0,1°) distingue ambos puntos');
  assert.equal(L.cellOf('imerg', -5.151, -79.951).key, L.cellOf('imerg', -5.199, -79.999).key, 'dentro de la misma celda IMERG');
});

test('El recuadro de la demo abarca varias celdas de cada producto (la ubicación puede cambiar el clima)', () => {
  const pts = [[-5.09, -79.88], [-5.30, -80.10], [-5.09, -80.10], [-5.30, -79.88], [-5.19, -79.99]];
  for (const src of ['power', 'era5', 'imerg']) assert.ok(new Set(pts.map(([la, lo]) => L.cellOf(src, la, lo).key)).size >= 2, src);
});

test('gatherData consulta slope/suelo en el PUNTO elegido y el clima en su celda (no en el centro del dominio)', async () => {
  await withDomain(async () => {
    const calls = {}; const orig = { p: ds.getPower, e: ds.getEra5, s: ds.getSlope, so: ds.getSoil, im: ds.getImergCached };
    const stub = (name, ok) => async (lat, lon) => { calls[name] = { lat, lon }; return ok; };
    ds.getPower = stub('power', { ok: false, error: 'stub', provenance: {} }); ds.getEra5 = stub('era5', { ok: false, error: 'stub', provenance: {} });
    ds.getSlope = stub('slope', { ok: false, error: 'stub', provenance: {} }); ds.getSoil = stub('soil', { ok: false, error: 'stub', provenance: {} });
    ds.getImergCached = (lat, lon) => { calls.imerg = { lat, lon }; return { data: {}, missing: [2015] }; };
    try {
      const g = await pipeline.gatherData(-5.28, -80.08);
      assert.deepEqual(calls.slope, { lat: -5.28, lon: -80.08 }, 'pendiente del punto');
      assert.deepEqual(calls.soil, { lat: -5.28, lon: -80.08 }, 'suelo del punto');
      assert.notDeepEqual(calls.power, { lat: ST.lat, lon: ST.lon }, 'POWER no usa el centro');
      assert.deepEqual(calls.power, g.location.sources.power.query);
      assert.deepEqual(calls.imerg, g.imergQuery);
      assert.equal(g.location.sources.power.same_cell_as_station, false);
      assert.deepEqual(g.requested, { lat: -5.28, lon: -80.08 });
    } finally { ds.getPower = orig.p; ds.getEra5 = orig.e; ds.getSlope = orig.s; ds.getSoil = orig.so; ds.getImergCached = orig.im; }
  });
});

test('Fuente que falla: respaldo explícito, sin sustituir por datos del centro', async () => {
  await withDomain(async () => {
    const g = await pipeline.gatherData(ST.lat, ST.lon);
    const r = pipeline.describeLocation({ ...g, soil: { ok: false, error: 'SoilGrids no disponible: prueba', provenance: {} }, imergComplete: false, imergMissing: [2015, 2016] }, []);
    assert.ok(r.fallbacks.some((f) => f.id === 'soilgrids' && /No se sustituye/.test(f.text)));
    assert.ok(r.fallbacks.some((f) => f.id === 'imerg'));
    const soil = r.sources.find((s) => s.id === 'soilgrids'); assert.equal(soil.status, 'no_disponible'); assert.equal(r.point.soil_ph, null);
  });
});

test('outOfScope: explica sin consultar datos', () => {
  const r = pipeline.outOfScope({ lat: -6.03, lon: -76.97, irrigation: true, start_slot: 'A', history: ['arroz'] });
  assert.equal(r.unsupported, true); assert.equal(r.strategies.length, 0); assert.match(r.support.blockers[0], /Fuera del alcance/);
});

test('Servidor: dentro del ámbito usa el punto; fuera del ámbito no devuelve datos del centro', async () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  process.env.FIELDSHIFT_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-db-')), 'parcels.json');
  await withDomain(async () => {
    const { server } = require('../server');
    await new Promise((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const post = async (b) => (await fetch(base + '/api/rotation/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
      const out = await post({ lat: -6.03, lon: -76.97, history: ['arroz', 'arroz'], irrigation: true, start_slot: 'A' });
      assert.equal(out.unsupported, true); assert.equal(out.strategies.length, 0);
      const inn = await post({ lat: ST.lat, lon: ST.lon, history: ['arroz', 'arroz'], irrigation: true, start_slot: 'A' });
      assert.ok(inn.strategies.length >= 1 && inn.engine === 'v2');
      assert.deepEqual(inn.location_report.requested, { lat: ST.lat, lon: ST.lon });
      assert.ok(inn.location_report.sources.length >= 5);
      const v1 = await post({ lat: ST.lat, lon: ST.lon, history: ['arroz', 'arroz'], irrigation: true, start_slot: 'A', engine: 'v1' });
      assert.equal(v1.engine, undefined); assert.ok(v1.strategies.length >= 1);
    } finally { server.close(); }
  });
});
