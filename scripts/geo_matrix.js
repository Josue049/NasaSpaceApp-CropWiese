'use strict';
// Matriz geográfica: comportamiento del motor en sitios contrastantes. Escribe docs/CASOS_GEOGRAFICOS.md.
// No es validación agronómica: documenta dónde el sistema recomienda, dónde advierte y dónde se niega a recomendar, y por qué.
// Requiere red para POWER/ERA5/SRTM/SoilGrids y caché IMERG (scripts/fetch_imerg_cache.js). Las elevaciones salen de SRTM, no de fuentes externas.
const fs = require('fs'), path = require('path');
const { gatherData, analyze, SCENARIOS, CROPS } = require('../src/pipeline');
const sites = [
  ['Moyobamba (urbano, plano)', -6.034, -76.971, 'demo; sin pluviómetro'],
  ['Ladera sur de Moyobamba', -6.10, -77.00, 'ladera ≈26 %'],
  ['Rioja', -6.00, -77.25, 'celda POWER muy distinta'],
  ['Tarapoto', -6.50, -76.367, 'pluviómetro GHCN (681 días)'],
  ['Yurimaguas', -5.894, -76.118, 'pluviómetro GHCN (958 días)'],
  ['Tingo María', -9.30, -76.00, 'selva alta, otro régimen'],
  ['Pucallpa', -8.38, -74.55, 'llanura amazónica'],
  ['Iquitos', -3.75, -73.25, 'ecuatorial muy húmedo'],
  ['Jaén', -5.71, -78.81, 'valle interandino más seco'],
  ['Chachapoyas', -6.23, -77.87, 'andino ≈2350 m'],
  ['Cajamarca', -7.16, -78.51, 'andino ≈2700 m'],
  ['Cusco', -13.52, -71.97, 'andino alto > 3000 m'],
  ['Lima (costa desértica)', -12.05, -77.04, 'casi sin lluvia'],
];
const names = { maiz: 'Maíz', arroz: 'Arroz', frijol: 'Frijol común', caupi: 'Caupí', soya: 'Soya', mani: 'Maní', camote: 'Camote', tomate: 'Tomate', zapallo: 'Zapallo', mucuna: 'Mucuna' };
(async () => {
  const rows = [], detail = [];
  for (const [name, lat, lon, note] of sites) {
    const g = await gatherData(lat, lon);
    const input = { lat, lon, area_ha: 1, irrigation: false, start_slot: 'A', history: ['maiz', 'frijol'], priorities: {}, excluded_crops: [], market_pref: {} };
    let r; try { r = analyze(input, g, SCENARIOS.base); } catch (e) { rows.push(`| ${name} | — | — | — | — | — | error: ${e.message.slice(0, 80)} |`); continue; }
    const sl = g.slope.ok ? g.slope.data : {}, cell = g.power.ok ? g.power.data.geometry.coordinates[2] : null;
    const cs = r.data_quality.climate_summary, rain = cs.map((c) => `${c.id[0].toUpperCase()}${Math.round(c.annual_precip_mm)}`).join(' / ');
    const prim = cs[0], tmean = prim.monthly.reduce((a, m) => a + m.tmean, 0) / 12;
    const viable = r.eligibility ? [...new Set(r.eligibility.flatMap((e) => e.ok))] : [];
    const A = r.strategies.find((s) => s.id === 'alt_a'), cmp = r.sensitivity?.comparisons?.a_vs_b;
    rows.push(`| ${name} | ${sl.elevation_m != null ? Math.round(sl.elevation_m) : '—'} (Δceldas ${cell != null && sl.elevation_m != null ? Math.round(sl.elevation_m - cell) : '—'}) | ${sl.slope_pct != null ? sl.slope_pct.toFixed(1) : '—'} | ${tmean.toFixed(1)} | ${rain} | ${r.support.level} | ${r.unsupported ? '—' : viable.length ? viable.map((v) => names[v]).join(', ') : 'ninguno'} | ${A ? A.sequence.map((v) => names[v]).join('→') : r.unsupported ? 'no se recomienda' : 'sin alternativa'}${cmp ? ' (A vs B: ' + cmp.level + ')' : ''} |`);
    detail.push(`### ${name} (${lat}, ${lon}) — ${note}\n- Soporte: **${r.support.level}**${[...r.support.blockers, ...r.support.cautions].map((x) => `\n  - ${x}`).join('')}\n${(r.limitations || []).map((x) => `- Limitación: ${x}`).join('\n')}\n`);
    console.log(rows[rows.length - 1]);
  }
  const md = `# Matriz geográfica (generada por \`node scripts/geo_matrix.js\`)\n\nComportamiento del motor en ${sites.length} sitios contrastantes (historial maíz→frijol, secano, prioridades neutras, campaña A). **No es validación agronómica**: muestra dónde el sistema recomienda, advierte o se niega a recomendar. Elevación y pendiente: SRTM (OpenTopoData); Δceldas = elevación del sitio − elevación de la celda POWER. Lluvia anual por fuente: I = IMERG V07, E = ERA5, P = POWER (mm). T = temperatura media anual de POWER corregida por altitud.\n\n| Sitio | Elevación m | Pendiente % | T °C | Lluvia anual (mm) | Soporte | Cultivos viables | Alternativa A |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Detalle de soporte\n${detail.join('\n')}`;
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'CASOS_GEOGRAFICOS.md'), md);
})().catch((e) => { console.error(e); process.exit(1); });
