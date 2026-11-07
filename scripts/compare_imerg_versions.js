'use strict';
// Compara IMERG V06 Late (datatype 26) y V07 Late (226) en el mismo punto/periodo. Descriptivo: NO atribuye las diferencias a error de una versión.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'demo');
const L = (dt, y) => JSON.parse(fs.readFileSync(path.join(dir, `imerg${dt}_-6.03_-76.97_${y}.json`), 'utf8')).data;
const a = {}, b = {};
for (let y = 2015; y <= 2023; y++) { Object.assign(a, L(26, y)); Object.assign(b, L(226, y)); }
const keys = Object.keys(a).filter((k) => k in b);
const A = keys.map((k) => a[k]), B = keys.map((k) => b[k]);
const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
const corr = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return n / Math.sqrt(dx * dy); };
const wet = (x) => x.filter((v) => v >= 1).length / x.length;
const monthly = (o) => { const m = {}; for (const k of keys) { const mm = k.slice(0, 6); m[mm] = (m[mm] || 0) + o[k]; } return m; };
const ma = monthly(a), mb = monthly(b), mk = Object.keys(ma);
const out = {
  n_days: keys.length, units: 'mm/día (ambas)', mean_mm_day: { v06: +mean(A).toFixed(2), v07: +mean(B).toFixed(2) },
  annual_mm: { v06: +(mean(A) * 365.25).toFixed(0), v07: +(mean(B) * 365.25).toFixed(0) }, ratio_v07_over_v06: +(mean(B) / mean(A)).toFixed(3),
  wet_day_freq_ge1mm: { v06: +wet(A).toFixed(3), v07: +wet(B).toFixed(3) }, max_daily_mm: { v06: Math.max(...A), v07: Math.max(...B) },
  r_daily: +corr(A, B).toFixed(3), r_monthly: +corr(mk.map((k) => ma[k]), mk.map((k) => mb[k])).toFixed(3),
  mean_abs_diff_mm_day: +mean(A.map((v, i) => Math.abs(v - B[i]))).toFixed(2),
  note: 'Descriptivo. Las dos series devuelven magnitudes en mm/día (la API no declara la unidad). No se investigó la causa de las diferencias ni se atribuyen a error de una versión; sin pluviómetro local no se puede decir cuál se acerca más a la realidad.',
};
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'evidence', 'imerg_v06_vs_v07_moyobamba.json'), JSON.stringify(out, null, 1));
