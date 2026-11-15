'use strict';
/** Métricas de validación (observado vs estimado). Siempre operan sobre pares COMPATIBLES (ambos válidos). */
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

/** Pares válidos: descarta cualquier par con un null/NaN. Nunca trata un ausente como 0. */
function pairs(obs, est) {
  const o = [], e = [];
  for (let i = 0; i < obs.length; i++) if (obs[i] != null && est[i] != null && Number.isFinite(obs[i]) && Number.isFinite(est[i])) { o.push(obs[i]); e.push(est[i]); }
  return { o, e };
}

function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Sesgo (est − obs), MAE, RMSE, correlación y sesgo relativo (%). */
function continuous(obs, est) {
  const { o, e } = pairs(obs, est), n = o.length;
  if (n < 3) return { n, bias: null, mae: null, rmse: null, r: null, bias_pct: null, obs_mean: null, est_mean: null };
  const d = e.map((v, i) => v - o[i]), om = mean(o);
  return { n, bias: mean(d), mae: mean(d.map(Math.abs)), rmse: Math.sqrt(mean(d.map((x) => x * x))), r: pearson(o, e), bias_pct: om !== 0 ? 100 * mean(d) / om : null, obs_mean: om, est_mean: mean(e) };
}

/** Skill frente a una línea base: 1 − RMSE_est/RMSE_base (>0 mejora a la base; ≤0 no la mejora). */
function skill(obs, est, base) {
  const a = continuous(obs, est), b = continuous(obs, base);
  return a.rmse != null && b.rmse ? { skill_rmse: 1 - a.rmse / b.rmse, rmse: a.rmse, rmse_base: b.rmse } : { skill_rmse: null, rmse: a.rmse, rmse_base: b.rmse };
}

/** Detección de eventos (≥ umbral): POD, FAR y CSI. */
function events(obs, est, thr) {
  const { o, e } = pairs(obs, est); let hit = 0, miss = 0, fa = 0, cn = 0;
  for (let i = 0; i < o.length; i++) { const ob = o[i] >= thr, es = e[i] >= thr; if (ob && es) hit++; else if (ob) miss++; else if (es) fa++; else cn++; }
  const div = (a, b) => (b ? a / b : null);
  return { thr, n: o.length, obs_events: hit + miss, est_events: hit + fa, hits: hit, pod: div(hit, hit + miss), far: div(fa, hit + fa), csi: div(hit, hit + miss + fa) };
}

/** Correlación cruzada con desfase de ±maxLag días (para detectar diferencias de día de acumulación). */
function lagScan(obsByDate, estByDate, dates, maxLag = 1) {
  const out = {};
  const shift = (d, k) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + k * 864e5); return t.toISOString().slice(0, 10); };
  for (let k = -maxLag; k <= maxLag; k++) {
    const o = [], e = [];
    for (const d of dates) { const a = obsByDate.get(d), b = estByDate.get(shift(d, k)); if (a != null && b != null) { o.push(a); e.push(b); } }
    out[k] = { n: o.length, r: pearson(o, e), rmse: o.length ? Math.sqrt(mean(o.map((v, i) => (e[i] - v) ** 2))) : null };
  }
  return out;
}

module.exports = { mean, pairs, pearson, continuous, skill, events, lagScan };
