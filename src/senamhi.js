'use strict';
/**
 * Importación, control de calidad y estadísticos de la serie diaria de la estación SENAMHI MORROPÓN
 * (archivo `qc00000235.txt` descargado del portal de datos históricos de SENAMHI).
 *
 * FORMATO verificado sobre el archivo original (sin encabezado, 6 columnas separadas por espacios):
 *   año  mes  día  precipitación(mm)  Tmax(°C)  Tmin(°C)
 * La asignación de columnas se INFIERE (el archivo no trae encabezado): la 4.ª columna es 0 en el 83 % de los días y
 * llega a 170.9 (consistente con el pico de 1983 de la gráfica del portal); la 5.ª es mayor que la 6.ª en el 100 % de los
 * días con ambas. Valor ausente: -99.9. Sin coordenadas, altitud ni indicadores de calidad en el archivo.
 *
 * Reglas: nunca se convierte un ausente en 0; un valor físicamente imposible (Tmax<Tmin, precipitación negativa) se
 * invalida y se marca; los valores solo sospechosos se conservan y se informan. La temperatura media es ESTIMADA como
 * (Tmax+Tmin)/2 y se identifica como tal.
 */
const crypto = require('crypto');

const MISSING = -99.9;
const COLUMNS = ['year', 'month', 'day', 'pr_mm', 'tmax_c', 'tmin_c'];

// Umbrales de revisión (NO de exclusión): valores sospechosos que se conservan y se listan en el informe.
const SUSPECT = { pr_mm: 200, tmax_c: 42, tmin_c: 10 }; // pr >= 200 mm/día; Tmax >= 42 °C; Tmin <= 10 °C

// Regla de validez mensual inspirada en las directrices de la OMM (cálculo de normales): máx. 10 días ausentes y
// máx. 5 consecutivos. Es un umbral de DISEÑO; `monthlyStats` lo recibe por parámetro para pruebas de sensibilidad.
const DEFAULT_MONTH_RULE = { maxMissing: 10, maxConsecutive: 5 };

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isLeapDate = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/** Analiza el texto original. No descarta nada: devuelve filas (con null en ausentes) y la lista de problemas de formato. */
function parseRaw(text) {
  const rows = [], problems = [];
  const lines = String(text).split(/\r?\n/);
  let prev = null;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const t = line.trim().split(/\s+/);
    if (t.length !== 6) { problems.push({ line: i + 1, issue: `se esperaban 6 columnas y hay ${t.length}`, text: line.slice(0, 80) }); return; }
    const v = t.map(Number);
    if (v.some((x) => !Number.isFinite(x))) { problems.push({ line: i + 1, issue: 'valor no numérico', text: line.slice(0, 80) }); return; }
    const [y, m, d, pr, tx, tn] = v;
    if (!isLeapDate(y, m, d)) { problems.push({ line: i + 1, issue: 'fecha inválida', text: line.slice(0, 80) }); return; }
    const date = iso(y, m, d);
    if (prev && date <= prev) problems.push({ line: i + 1, issue: date === prev ? 'fecha duplicada' : 'fecha fuera de orden', text: date });
    prev = date;
    const val = (x) => (x === MISSING ? null : x);
    rows.push({ date, year: y, month: m, day: d, pr_mm: val(pr), tmax_c: val(tx), tmin_c: val(tn), line: i + 1 });
  });
  return { rows, problems };
}

/** Control de calidad físico. Devuelve filas normalizadas con `flags` y la lista de valores sospechosos. */
function normalize(rows) {
  const suspect = [];
  const out = rows.map((r) => {
    const flags = [];
    let { pr_mm, tmax_c, tmin_c } = r;
    if (pr_mm == null) flags.push('pr_ausente'); else if (pr_mm < 0) { flags.push('pr_negativa_invalidada'); pr_mm = null; }
    if (tmax_c == null) flags.push('tmax_ausente');
    if (tmin_c == null) flags.push('tmin_ausente');
    if (tmax_c != null && tmin_c != null && tmax_c < tmin_c) { flags.push('tmax_menor_que_tmin_invalidadas'); tmax_c = null; tmin_c = null; }
    if (pr_mm != null && pr_mm >= SUSPECT.pr_mm) { flags.push('pr_sospechosa'); suspect.push({ date: r.date, var: 'pr_mm', value: pr_mm }); }
    if (tmax_c != null && tmax_c >= SUSPECT.tmax_c) { flags.push('tmax_sospechosa'); suspect.push({ date: r.date, var: 'tmax_c', value: tmax_c }); }
    if (tmin_c != null && tmin_c <= SUSPECT.tmin_c) { flags.push('tmin_sospechosa'); suspect.push({ date: r.date, var: 'tmin_c', value: tmin_c }); }
    const tmean_est_c = tmax_c != null && tmin_c != null ? +((tmax_c + tmin_c) / 2).toFixed(2) : null;
    return { date: r.date, year: r.year, month: r.month, day: r.day, pr_mm, tmax_c, tmin_c, tmean_est_c, flags };
  });
  return { daily: out, suspect };
}

/** Continuidad temporal: días esperados entre la primera y la última fecha y huecos (saltos de calendario). */
function continuity(daily) {
  if (!daily.length) return { first: null, last: null, expected_days: 0, records: 0, calendar_gaps: [] };
  const ms = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const gaps = [];
  for (let i = 1; i < daily.length; i++) { const dd = (ms(daily[i].date) - ms(daily[i - 1].date)) / 864e5; if (dd !== 1) gaps.push({ after: daily[i - 1].date, before: daily[i].date, days: dd }); }
  return { first: daily[0].date, last: daily[daily.length - 1].date, expected_days: (ms(daily[daily.length - 1].date) - ms(daily[0].date)) / 864e5 + 1, records: daily.length, calendar_gaps: gaps };
}

/** Rachas de valores ausentes (por variable) de al menos `min` días. */
function missingRuns(daily, key, min = 15) {
  const runs = []; let start = null, n = 0;
  daily.forEach((r, i) => {
    if (r[key] == null) { if (!n) start = i; n++; }
    else { if (n >= min) runs.push({ from: daily[start].date, to: daily[i - 1].date, days: n }); n = 0; }
  });
  if (n >= min) runs.push({ from: daily[start].date, to: daily[daily.length - 1].date, days: n });
  return runs;
}

/** Cobertura (% de días con dato válido) por variable, año y mes. */
function coverage(daily) {
  const keys = ['pr_mm', 'tmax_c', 'tmin_c', 'tmean_est_c'], byYear = {}, byMonth = {}, total = { n: daily.length };
  for (const k of keys) total[k] = 0;
  for (const r of daily) {
    const y = (byYear[r.year] = byYear[r.year] || { n: 0 }), m = (byMonth[r.month] = byMonth[r.month] || { n: 0 });
    y.n++; m.n++;
    for (const k of keys) { if (!(k in y)) y[k] = 0; if (!(k in m)) m[k] = 0; if (r[k] != null) { y[k]++; m[k]++; total[k]++; } }
  }
  const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'n' ? v : +(100 * v / o.n).toFixed(1)]));
  return { total: pct(total), by_year: Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, pct(v)])), by_month: Object.fromEntries(Object.entries(byMonth).map(([k, v]) => [k, pct(v)])) };
}

/** Estadísticos mensuales por (año, mes). Un mes solo es "válido" si cumple la regla de ausentes (parámetro). */
function monthlyStats(daily, rule = DEFAULT_MONTH_RULE) {
  const groups = new Map();
  for (const r of daily) { const k = `${r.year}-${pad(r.month)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = [];
  for (const [k, g] of groups) {
    const y = g[0].year, m = g[0].month, dim = daysInMonth(y, m);
    const res = { key: k, year: y, month: m, days_in_month: dim, records: g.length };
    for (const v of ['pr_mm', 'tmax_c', 'tmin_c', 'tmean_est_c']) {
      const present = new Map(g.map((r) => [r.day, r[v]]));
      let missing = 0, run = 0, maxRun = 0, sum = 0, cnt = 0;
      for (let d = 1; d <= dim; d++) { const x = present.get(d); if (x == null) { missing++; run++; maxRun = Math.max(maxRun, run); } else { run = 0; sum += x; cnt++; } }
      const valid = missing <= rule.maxMissing && maxRun <= rule.maxConsecutive && cnt > 0;
      res[v] = { valid, missing, max_consecutive_missing: maxRun, mean: cnt ? +(sum / cnt).toFixed(3) : null, total: v === 'pr_mm' ? (cnt ? +sum.toFixed(1) : null) : undefined };
    }
    out.push(res);
  }
  return out;
}

/** Totales anuales: solo años con los 12 meses válidos (precipitación) — no se extrapola. */
function annualPrecip(monthly) {
  const by = {};
  for (const m of monthly) { (by[m.year] = by[m.year] || []).push(m); }
  const out = {};
  for (const [y, ms] of Object.entries(by)) { if (ms.length === 12 && ms.every((m) => m.pr_mm.valid)) out[y] = +ms.reduce((a, m) => a + m.pr_mm.total, 0).toFixed(1); }
  return out;
}

/** Climatología mensual (media de meses válidos) en un rango de años [y0, y1] inclusive. */
function monthlyClimatology(monthly, y0 = -Infinity, y1 = Infinity) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const rows = monthly.filter((x) => x.month === m && x.year >= y0 && x.year <= y1);
    const agg = (v, f) => { const a = rows.filter((r) => r[v].valid).map(f); return { n_years: a.length, mean: a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null }; };
    out.push({ month: m, pr_total_mm: agg('pr_mm', (r) => r.pr_mm.total), tmax_c: agg('tmax_c', (r) => r.tmax_c.mean), tmin_c: agg('tmin_c', (r) => r.tmin_c.mean), tmean_est_c: agg('tmean_est_c', (r) => r.tmean_est_c.mean) });
  }
  return out;
}

/** Conteo de días por encima de umbrales térmicos, solo sobre días con dato (informa también cuántos días fueron válidos). */
function exceedances(daily, thresholds = { tmax_c: [30, 32, 35], tmin_c: [20, 22, 24] }) {
  const out = {};
  for (const [v, ths] of Object.entries(thresholds)) {
    const valid = daily.filter((r) => r[v] != null);
    out[v] = { valid_days: valid.length, thresholds: Object.fromEntries(ths.map((t) => [`>=${t}`, { days: valid.filter((r) => r[v] >= t).length, pct_of_valid: +(100 * valid.filter((r) => r[v] >= t).length / (valid.length || 1)).toFixed(2) }])) };
  }
  return out;
}

/** Extremos: mayores lluvias diarias, Tmax máxima y Tmin mínima. */
function extremes(daily, n = 10) {
  const top = (k, dir) => daily.filter((r) => r[k] != null).sort((a, b) => dir * (b[k] - a[k])).slice(0, n).map((r) => ({ date: r.date, value: r[k] }));
  return { pr_mm_top: top('pr_mm', 1), tmax_c_top: top('tmax_c', 1), tmin_c_lowest: top('tmin_c', -1) };
}

/** Frecuencia de lluvia: días con ≥1 mm y ≥20 mm, y percentil 95/99 de los días húmedos (≥1 mm). */
function rainEvents(daily) {
  const v = daily.filter((r) => r.pr_mm != null), wet = v.filter((r) => r.pr_mm >= 1).map((r) => r.pr_mm).sort((a, b) => a - b);
  const q = (p) => (wet.length ? wet[Math.min(wet.length - 1, Math.floor(p * wet.length))] : null);
  return { valid_days: v.length, wet_days_ge_1mm: wet.length, days_ge_20mm: v.filter((r) => r.pr_mm >= 20).length, wet_day_p95_mm: q(0.95), wet_day_p99_mm: q(0.99) };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Serie diaria como CSV (los ausentes quedan VACÍOS; jamás 0). */
function toCsv(daily) {
  const head = 'date,pr_mm,tmax_c,tmin_c,tmean_est_c,flags';
  return [head, ...daily.map((r) => [r.date, r.pr_mm ?? '', r.tmax_c ?? '', r.tmin_c ?? '', r.tmean_est_c ?? '', r.flags.join('|')].join(','))].join('\n') + '\n';
}
function fromCsv(text) {
  const [, ...lines] = text.trim().split(/\r?\n/);
  const num = (s) => (s === '' ? null : Number(s));
  return lines.map((l) => { const [date, pr, tx, tn, tm, fl] = l.split(','); return { date, year: +date.slice(0, 4), month: +date.slice(5, 7), day: +date.slice(8, 10), pr_mm: num(pr), tmax_c: num(tx), tmin_c: num(tn), tmean_est_c: num(tm), flags: fl ? fl.split('|') : [] }; });
}

module.exports = { MISSING, COLUMNS, SUSPECT, DEFAULT_MONTH_RULE, parseRaw, normalize, continuity, missingRuns, coverage, monthlyStats, annualPrecip, monthlyClimatology, exceedances, extremes, rainEvents, sha256, toCsv, fromCsv };
