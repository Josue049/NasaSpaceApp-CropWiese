'use strict';
// Compara T media diaria de NASA POWER (corregida por altitud con −6,5 °C/km) con ERA5 (Open-Meteo, a la elevación SRTM del sitio).
// Cuantifica la discrepancia entre dos productos, NO el error frente a estaciones. Uso: node scripts/audit_temperature.js
const ds = require('../src/datasources');
const sites = [
  ['Moyobamba urbano', -6.034, -76.971], ['Ladera sur de Moyobamba', -6.10, -77.00], ['Chachapoyas', -6.23, -77.87],
  ['Tarapoto', -6.50, -76.367], ['Rioja', -6.00, -77.25], ['Pucallpa', -8.38, -74.55],
];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
(async () => {
  const out = [];
  for (const [name, lat, lon] of sites) {
    const sl = await ds.getSlope(lat, lon); if (!sl.ok) { console.log(name, sl.error); continue; }
    const z = sl.data.elevation_m;
    const p = await ds.getPower(lat, lon); if (!p.ok) { console.log(name, p.error); continue; }
    const cell = p.data.geometry.coordinates[2], T = p.data.properties.parameter.T2M;
    const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&elevation=${z}&start_date=2015-01-01&end_date=2023-12-31&daily=temperature_2m_mean&timezone=UTC`).then((x) => x.json());
    const pairs = r.daily.time.map((t, i) => [T[t.replace(/-/g, '')], r.daily.temperature_2m_mean[i]]).filter(([a, b]) => a > -900 && b != null);
    const lapse = -0.0065 * (z - cell);
    const pw = mean(pairs.map((x) => x[0])), er = mean(pairs.map((x) => x[1]));
    out.push({ name, z, cell, dz: z - cell, power_raw: +pw.toFixed(2), power_corr: +(pw + lapse).toFixed(2), era5: +er.toFixed(2), diff_corr_minus_era5: +(pw + lapse - er).toFixed(2), diff_raw_minus_era5: +(pw - er).toFixed(2) });
    console.log(out[out.length - 1]);
  }
  const rms = Math.sqrt(mean(out.map((o) => o.diff_corr_minus_era5 ** 2)));
  console.log('RMS diferencia (POWER corregido − ERA5):', rms.toFixed(2), '°C; n =', out.length);
  require('fs').writeFileSync(require('path').join(__dirname, '..', 'docs', 'evidence', 'temperatura_power_vs_era5.json'), JSON.stringify({ rms_c: +rms.toFixed(2), sites: out }, null, 1));
})();
