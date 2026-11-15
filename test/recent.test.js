'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.FIELDSHIFT_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-recent-'));
const R = require('../src/recent');

const series = (days, fillLast = 0) => { const t = {}, p = {}; days.forEach((d, i) => { const bad = i >= days.length - fillLast; t[d] = bad ? -999 : 24 + i * 0.1; p[d] = bad ? -999 : i % 2; }); return { t, p }; };
const days = (n, end = '20261115') => Array.from({ length: n }, (_, i) => { const t = Date.UTC(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8)) - (n - 1 - i) * 864e5; return new Date(t).toISOString().slice(0, 10).replace(/-/g, ''); });

test('windowFrom: usa los últimos 7 días con dato válido COMÚN y descarta los -999 finales', () => {
  const { t, p } = series(days(26), 3);
  const w = R.windowFrom(t, p);
  assert.equal(w.n, 7); assert.equal(w.to, '2026-11-12'); assert.equal(w.from, '2026-11-06');
});

test('windowFrom: nunca convierte un ausente en 0; una lluvia 0 válida sí cuenta', () => {
  const t = { 20261101: 20, 20261102: 21, 20261103: 22 }, p = { 20261101: 0, 20261102: -999, 20261103: 5 };
  const w = R.windowFrom(t, p); assert.equal(w.n, 2); assert.equal(w.rain_mm, 5); assert.equal(w.tmean_c, 21);
});

test('statusOf: ok / parcial / desactualizado / no_disponible', () => {
  assert.equal(R.statusOf({ n: 7, to: '2026-11-12' }, '2026-11-15'), 'ok');
  assert.equal(R.statusOf({ n: 4, to: '2026-11-12' }, '2026-11-15'), 'parcial');
  assert.equal(R.statusOf({ n: 7, to: '2026-10-20' }, '2026-11-15'), 'desactualizado');
  assert.equal(R.statusOf(null, '2026-11-15'), 'no_disponible');
});

const power = (days2, fill = 0) => { const { t, p } = series(days2, fill); return { properties: { parameter: { T2M: t, PRECTOTCORR: p } } }; };
test('getRecent: fechas exactas, procedencia, contraste con ERA5 y aviso cuando difieren', async () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const fetchJson = async (u) => u.includes('power.larc') ? power(days(26), 3) : ({ daily: { precipitation_sum: [3, 3, 3, 3, 3, 3, 3], temperature_2m_mean: [26, 26, 26, 26, 26, 26, 26] } });
  const r = await R.getRecent(-5.19, -79.99, { now, fetchJson, force: true });
  assert.equal(r.status, 'ok'); assert.equal(r.last_valid_date, '2026-11-12'); assert.equal(r.lag_days, 3);
  assert.equal(r.window.from, '2026-11-06'); assert.match(r.source.name, /POWER/);
  assert.equal(r.comparison.era5.n, 7); assert.equal(r.comparison.differs, true, 'la lluvia discrepa (≈6×) → no se oculta');
  assert.match(r.note, /no modifica el puntaje/i);
});

test('getRecent: sin conexión muestra el último dato guardado marcado como NO actual; sin caché no inventa nada', async () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const ok = async (u) => (u.includes('power.larc') ? power(days(26), 3) : { daily: { precipitation_sum: [1, 1, 1, 1, 1, 1, 1], temperature_2m_mean: [24, 24, 24, 24, 24, 24, 24] } });
  await R.getRecent(-5.2, -80.0, { now, fetchJson: ok, force: true });
  const later = new Date('2026-11-16T10:00:00Z'), fail = async () => { throw new Error('sin red'); };
  const r = await R.getRecent(-5.2, -80.0, { now: later, fetchJson: fail, force: true });
  assert.equal(r.status, 'sin_conexion'); assert.equal(r.stale, true); assert.equal(r.last_valid_date, '2026-11-12'); assert.match(r.note, /NO es actual/);
  const none = await R.getRecent(-5.5, -80.5, { now, fetchJson: fail, force: true });
  assert.equal(none.status, 'no_disponible'); assert.equal(none.window, null); assert.match(none.note, /climatología/);
});

test('getRecent: respeta la caché de 6 h (no vuelve a consultar)', async () => {
  const now = new Date('2026-11-15T10:00:00Z'); let calls = 0;
  const f = async (u) => { calls++; return u.includes('power.larc') ? power(days(26), 2) : { daily: { precipitation_sum: [], temperature_2m_mean: [] } }; };
  await R.getRecent(-5.3, -80.1, { now, fetchJson: f, force: true }); const n1 = calls;
  const r = await R.getRecent(-5.3, -80.1, { now: new Date(now.getTime() + 3600e3), fetchJson: f });
  assert.equal(calls, n1); assert.equal(r.from_cache, true);
});
