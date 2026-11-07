'use strict';
// Contraste de lluvia diaria (IMERG, ERA5, POWER) con un pluviómetro real de GHCN-Daily (NOAA).
// Uso: node scripts/validate_gauge.js <ghcnd.dly> <lat> <lon> <añoIni> <añoFin>
// Estación por defecto: Tarapoto (PE000084455). Compara SOLO días con dato del pluviómetro.
const fs = require('fs');
const ds = require('../src/datasources');

const [dly, latS, lonS, y0S = '2015', y1S = '2019'] = process.argv.slice(2);
if (!dly) { console.error('Uso: node scripts/validate_gauge.js <archivo.dly> <lat> <lon> [añoIni] [añoFin]'); process.exit(1); }
const lat = +latS, lon = +lonS, Y0 = +y0S, Y1 = +y1S;

function readGauge(file) {
  const g = {};
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.slice(17, 21) !== 'PRCP') continue;
    const y = +l.slice(11, 15), m = +l.slice(15, 17);
    if (y < Y0 || y > Y1) continue;
    for (let d = 0; d < 31; d++) {
      const v = +l.slice(21 + 8 * d, 26 + 8 * d);
      if (v === -9999) continue;
      g[`${y}${String(m).padStart(2, '0')}${String(d + 1).padStart(2, '0')}`] = v / 10;
    }
  }
  return g;
}
const shift = (k, n) => { const t = Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6)) + n * 864e5; const d = new Date(t); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const pearson = (a, b) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };

function stats(gauge, sat, lag) {
  const days = Object.keys(gauge).filter((k) => sat[shift(k, lag)] != null);
  const G = days.map((k) => gauge[k]), S = days.map((k) => sat[shift(k, lag)]);
  const n = days.length, sumG = G.reduce((a, b) => a + b, 0), sumS = S.reduce((a, b) => a + b, 0);
  let hit = 0, miss = 0, fa = 0;
  for (let i = 0; i < n; i++) { const r = G[i] >= 1, s = S[i] >= 1; if (r && s) hit++; else if (r) miss++; else if (s) fa++; }
  return { n, bias_pct: (100 * (sumS - sumG)) / sumG, r_daily: pearson(G, S), POD: hit / (hit + miss), FAR: fa / (hit + fa), mean_gauge: sumG / n, mean_sat: sumS / n };
}

// Agregación en bloques de 'w' días consecutivos totalmente observados (reduce el efecto del desfase horario UTC vs hora local).
function blocks(gauge, sat, lag, w) {
  const keys = Object.keys(gauge).sort(); const G = [], S = [];
  for (const k of keys) {
    const days = Array.from({ length: w }, (_, i) => shift(k, i));
    if (days.some((d) => gauge[d] == null || sat[shift(d, lag)] == null)) continue;
    if (days[0] !== k || keys.indexOf(k) % 1 !== 0) continue;
    if ((Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6)) / 864e5) % w !== 0) continue; // bloques no solapados
    G.push(days.reduce((a, d) => a + gauge[d], 0)); S.push(days.reduce((a, d) => a + sat[shift(d, lag)], 0));
  }
  const sg = G.reduce((a, b) => a + b, 0), ss = S.reduce((a, b) => a + b, 0);
  return { blocks: G.length, bias_pct: (100 * (ss - sg)) / sg, r: pearson(G, S) };
}

(async () => {
  const gauge = readGauge(dly);
  console.log(`Pluviómetro: ${Object.keys(gauge).length} días con dato en ${Y0}-${Y1}`);
  const years = []; for (let y = Y0; y <= Y1; y++) years.push(y);
  const power = await ds.getPower(lat, lon), era5 = await ds.getEra5(lat, lon);
  let im = ds.getImergCached(lat, lon);
  const miss = im.missing.filter((y) => y >= Y0 && y <= Y1);
  if (miss.length) { console.log('Descargando IMERG', miss.join(',')); console.log(await ds.fetchImergYears(lat, lon, miss, null, 2)); im = ds.getImergCached(lat, lon); }
  const srcs = { IMERG: im.data, ERA5: era5.ok ? era5.data : {}, POWER: power.ok ? power.data.properties.parameter.PRECTOTCORR : {} };
  const out = { station: { file: dly, lat, lon, period: `${Y0}-${Y1}`, gauge_days: Object.keys(gauge).length }, results: {} };
  for (const [name, s] of Object.entries(srcs)) {
    out.results[name] = {};
    for (const lag of [-1, 0, 1]) out.results[name][`lag${lag}`] = stats(gauge, s, lag);
    out.results[name].blocks5_lag_1 = blocks(gauge, s, -1, 5); out.results[name].blocks5_lag0 = blocks(gauge, s, 0, 5);
  }
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(require('path').join(__dirname, '..', 'docs', 'evidence', `gauge_${latS}_${lonS}.json`), JSON.stringify(out, null, 1));
})();
