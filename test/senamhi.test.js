'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../src/senamhi');
const M = require('../src/metrics');

test('parseRaw: 6 columnas, ausentes -99.9 → null (nunca 0), fechas inválidas y duplicadas detectadas', () => {
  const { rows, problems } = S.parseRaw('2000 2 28 0 31.2 17\n2000 2 29 -99.9 -99.9 18\n2000 3 1 5.5 30 19\n2000 3 1 0 30 19\n2001 2 29 0 30 19\nbasura\n');
  assert.equal(rows.length, 4);
  assert.equal(rows[1].pr_mm, null); assert.equal(rows[1].tmax_c, null); assert.equal(rows[1].tmin_c, 18);
  assert.equal(rows[0].pr_mm, 0, 'un 0 real se conserva como 0');
  const issues = problems.map((p) => p.issue);
  assert.ok(issues.includes('fecha duplicada')); assert.ok(issues.includes('fecha inválida')); assert.ok(issues.some((i) => /6 columnas/.test(i)));
});

test('normalize: Tmax<Tmin se invalida; la media es ESTIMADA y solo existe si hay ambas', () => {
  const { daily } = S.normalize(S.parseRaw('2000 1 1 0 30 20\n2000 1 2 0 18 25\n2000 1 3 0 -99.9 20\n').rows);
  assert.equal(daily[0].tmean_est_c, 25);
  assert.equal(daily[1].tmax_c, null); assert.equal(daily[1].tmin_c, null); assert.ok(daily[1].flags.includes('tmax_menor_que_tmin_invalidadas'));
  assert.equal(daily[2].tmean_est_c, null);
});

test('monthlyStats: un mes con demasiados ausentes no es válido y no se convierte en 0', () => {
  const lines = []; for (let d = 1; d <= 31; d++) lines.push(`2001 1 ${d} ${d <= 15 ? -99.9 : 2} 30 20`);
  const { daily } = S.normalize(S.parseRaw(lines.join('\n')).rows);
  const m = S.monthlyStats(daily)[0];
  assert.equal(m.pr_mm.valid, false); assert.equal(m.pr_mm.missing, 15); assert.equal(m.tmax_c.valid, true);
  assert.equal(S.annualPrecip([m]).hasOwnProperty('2001'), false);
  const lax = S.monthlyStats(daily, { maxMissing: 20, maxConsecutive: 20 })[0]; assert.equal(lax.pr_mm.valid, true); assert.equal(lax.pr_mm.total, 32);
});

test('toCsv/fromCsv conservan los ausentes como vacíos', () => {
  const { daily } = S.normalize(S.parseRaw('2000 1 1 -99.9 30 20\n').rows);
  const back = S.fromCsv(S.toCsv(daily));
  assert.equal(back[0].pr_mm, null); assert.equal(back[0].tmax_c, 30);
});

test('Serie real importada (data/senamhi): 1963-10-01 → 2014-06-30, continua, y coherente con el original', () => {
  const csv = path.join(__dirname, '..', 'data', 'senamhi', 'morropon_daily.csv'), raw = path.join(__dirname, '..', 'data', 'senamhi', 'raw', 'qc00000235.txt');
  const rows = S.fromCsv(fs.readFileSync(csv, 'utf8'));
  assert.equal(rows[0].date, '1963-10-01'); assert.equal(rows[rows.length - 1].date, '2014-06-30'); assert.equal(rows.length, 18536);
  assert.equal(S.continuity(rows).calendar_gaps.length, 0);
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'senamhi', 'morropon_resumen.json'), 'utf8'));
  assert.equal(S.sha256(fs.readFileSync(raw)), meta.procedencia.sha256, 'el original no fue alterado');
  const re = S.normalize(S.parseRaw(fs.readFileSync(raw, 'utf8')).rows).daily;
  assert.deepEqual(re.map((r) => r.pr_mm), rows.map((r) => r.pr_mm), 'el procesado es reproducible desde el original');
  assert.ok(rows.filter((r) => r.pr_mm == null).length > 700, 'los ausentes siguen ausentes');
  assert.equal(Math.max(...rows.filter((r) => r.pr_mm != null).map((r) => r.pr_mm)), 170.9);
});

test('metrics: solo pares compatibles; skill frente a línea base', () => {
  const c = M.continuous([1, 2, null, 4, 5], [2, 3, 100, null, 6]);
  assert.equal(c.n, 3); assert.equal(c.bias, 1); assert.equal(c.mae, 1);
  const s = M.skill([1, 2, 3, 4], [1, 2, 3, 4], [2.5, 2.5, 2.5, 2.5]);
  assert.ok(s.skill_rmse > 0.99);
  const e = M.events([0, 25, 30, 0], [0, 22, 0, 21], 20); assert.equal(e.hits, 1); assert.equal(e.pod, 0.5); assert.equal(e.far, 0.5);
});
