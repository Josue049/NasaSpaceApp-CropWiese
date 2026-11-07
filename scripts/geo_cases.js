'use strict';
// Casos geográficos distintos del punto urbano plano. Escribe docs/CASOS_GEOGRAFICOS.md. Requiere red (POWER/ERA5/SRTM/SoilGrids) y caché IMERG.
const fs = require('fs'), path = require('path');
const { gatherData, analyze, SCENARIOS } = require('../src/pipeline');
const cases = [
  { id: 'ladera', name: 'Ladera, cerros al sur de Moyobamba', lat: -6.10, lon: -77.00 },
  { id: 'andino', name: 'Chachapoyas (clima frío, 2350 m)', lat: -6.23, lon: -77.87 },
];
(async () => {
  let md = '# Casos geográficos (generado por `node scripts/geo_cases.js`)\n\nPrueba de comportamiento del motor fuera del punto urbano plano. **No es validación agronómica**: solo muestra si las reglas reaccionan de forma coherente.\n\n';
  for (const c of cases) {
    const g = await gatherData(c.lat, c.lon);
    const input = { lat: c.lat, lon: c.lon, area_ha: 1, irrigation: false, start_slot: 'A', history: ['maiz', 'frijol', 'maiz', 'frijol'],
      priorities: { protect_soil: 3, water: 3, resilience: 3, pests: 3, income: 3, low_cost: 3 }, excluded_crops: [], market_pref: {} };
    const r = analyze(input, g, SCENARIOS.base);
    const dq = r.data_quality;
    md += `## ${c.name} (${c.lat}, ${c.lon})\n- Pendiente SRTM: ${g.slope.ok ? g.slope.data.slope_pct.toFixed(1) + ' %, ' + g.slope.data.elevation_m + ' m' : g.slope.error}\n- IMERG faltante: ${g.imergMissing && g.imergMissing.length ? g.imergMissing.join(',') : 'no'}; problemas: ${(dq.problems || []).join(' | ') || 'ninguno'}\n- Candidatas válidas: ${r.candidates_evaluated}\n`;
    for (const s of r.strategies) md += `- **${s.label}** (${s.score}): ${s.sequence.join(' → ')}${s.violations && s.violations.length ? ' · VIOLA: ' + s.violations.join('; ') : ''}\n`;
    md += `- Pesos: ${JSON.stringify(r.weights)}\n\n`;
    console.log(md.split('## ').pop());
  }
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'CASOS_GEOGRAFICOS.md'), md);
})().catch((e) => { console.error(e); process.exit(1); });
