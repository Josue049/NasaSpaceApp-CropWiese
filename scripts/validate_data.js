'use strict';
// Validación cruzada de fuentes de lluvia y control de calidad de las series del caso demo.
// Uso: node scripts/validate_data.js  -> escribe docs/DATA_VALIDATION.md (reproducible con data/demo, sin red).
const fs = require('fs');
const path = require('path');
const { gatherData } = require('../src/pipeline');
const ds = require('../src/datasources');

const LAT = -6.034, LON = -76.971;
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
const rmse = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

(async () => {
  const g = await gatherData(LAT, LON);
  const P = g.power.data.properties.parameter.PRECTOTCORR, E = g.era5.data, I = g.imerg.data;
  const days = Object.keys(I).filter((k) => P[k] !== undefined && E[k] !== undefined && +k.slice(0, 4) >= ds.Y0 && +k.slice(0, 4) <= ds.Y1).sort();
  const series = { imerg: days.map((k) => I[k]), era5: days.map((k) => E[k]), power: days.map((k) => P[k]) };
  const monthly = {}; days.forEach((k, i) => { const m = k.slice(0, 6); (monthly[m] ||= { imerg: 0, era5: 0, power: 0 }); for (const s of Object.keys(series)) monthly[m][s] += series[s][i]; });
  const M = Object.values(monthly), ms = Object.fromEntries(['imerg', 'era5', 'power'].map((s) => [s, M.map((x) => x[s])]));
  const annual = {}; days.forEach((k, i) => { const y = k.slice(0, 4); (annual[y] ||= { imerg: 0, era5: 0, power: 0 }); for (const s of Object.keys(series)) annual[y][s] += series[s][i]; });
  const pairs = [['imerg', 'era5'], ['imerg', 'power'], ['era5', 'power']];
  let md = `# Validación de datos (generada por \`npm run validate-data\`)\n\nPunto: ${LAT}, ${LON} (Moyobamba). Ventana ${ds.Y0}–${ds.Y1}, ${days.length} días comunes. Datos: instantánea \`data/demo\`.\n\n`;
  md += `## 1. Precipitación anual por fuente (mm)\n\n| Año | IMERG (NASA) | ERA5 (control) | NASA POWER |\n|---|---|---|---|\n` + Object.entries(annual).map(([y, v]) => `| ${y} | ${v.imerg.toFixed(0)} | ${v.era5.toFixed(0)} | ${v.power.toFixed(0)} |`).join('\n');
  const mean = (s) => Object.values(annual).reduce((a, v) => a + v[s], 0) / Object.keys(annual).length;
  md += `\n| **Media** | **${mean('imerg').toFixed(0)}** | **${mean('era5').toFixed(0)}** | **${mean('power').toFixed(0)}** |\n\n`;
  md += `## 2. Concordancia entre fuentes\n\n| Par | r diario | r mensual | RMSE mensual (mm) |\n|---|---|---|---|\n` + pairs.map(([a, b]) => `| ${a} vs ${b} | ${corr(series[a], series[b]).toFixed(2)} | ${corr(ms[a], ms[b]).toFixed(2)} | ${rmse(ms[a], ms[b]).toFixed(0)} |`).join('\n') + '\n\n';
  const ratio = mean('power') / mean('imerg');
  md += `**Lectura.** POWER (PRECTOTCORR) acumula ${(ratio * 100).toFixed(0)} % de la lluvia de IMERG en este punto y su serie anual diverge desde 2020. IMERG y ERA5 concuerdan entre sí más que cualquiera de ellos con POWER, pero la concordancia es solo MODERADA (r mensual ${corr(ms.imerg, ms.era5).toFixed(2)}). Por ello el sistema usa IMERG como fuente primaria, ERA5 y POWER como controles y comunica la discrepancia. **Ninguna de las tres ha sido contrastada con un pluviómetro** (un contraste parcial con la estación GHCN de Tarapoto está en docs/AUDITORIA.md §3; SENAMHI Moyobamba sigue pendiente).\n\n`;
  md += `## 3. Control de calidad de NASA POWER\n\n` + (ds.validatePower(g.power.data).map((x) => `- ${x}`).join('\n') || '- sin hallazgos') + '\n\n';
  md += `## 4. Otras fuentes\n\n- Pendiente SRTM: ${g.slope.ok ? g.slope.data.slope_pct.toFixed(2) + ' % (elevación SRTM ' + g.slope.data.elevation_m + ' m; POWER reporta ' + g.power.data.geometry.coordinates[2].toFixed(0) + ' m para su celda)' : g.slope.error}\n`;
  if (g.soil.ok) md += `- SoilGrids 0–30 cm: pH ${g.soil.data.phh2o.mean.toFixed(1)} [${g.soil.data.phh2o.q05.toFixed(1)}–${g.soil.data.phh2o.q95.toFixed(1)}], arcilla ${g.soil.data.clay.mean.toFixed(0)} %, C orgánico ${g.soil.data.soc.mean.toFixed(0)} g/kg (intervalo 5–95 %: ${g.soil.data.soc.q05.toFixed(0)}–${g.soil.data.soc.q95.toFixed(0)}).\n`;
  md += `- IMERG vía ClimateSERV: datatype 226 (V07 inferida) usado desde 2026-11-06; el datatype 26 heredado termina en 2024-06-01 y difiere mucho (ver docs/AUDITORIA.md §1).\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'DATA_VALIDATION.md'), md);
  console.log(md);
})().catch((e) => { console.error(e); process.exit(1); });
