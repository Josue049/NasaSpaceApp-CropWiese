'use strict';
// Ejecuta el caso demostrativo de extremo a extremo con datos reales y muestra un resumen.
const { gatherData, analyze, SCENARIOS } = require('../src/pipeline');

const LAT = -6.034, LON = -76.971;
const input = {
  lat: LAT, lon: LON, area_ha: 1.5, irrigation: false, start_slot: 'A',
  history: ['maiz', 'maiz', 'maiz', 'maiz'],
  priorities: { protect_soil: 4, water: 3, resilience: 4, pests: 3, income: 3, low_cost: 3 },
  excluded_crops: [], market_pref: {},
};

(async () => {
  const sc = SCENARIOS[process.argv[2] || 'base'];
  const g = await gatherData(LAT, LON);
  console.log('Fuentes:', { power: g.power.ok, era5: g.era5.ok, slope: g.slope.ok && g.slope.data, soil: g.soil.ok && Object.fromEntries(Object.entries(g.soil.data).filter(([k]) => ['phh2o', 'soc', 'clay', 'sand'].includes(k)).map(([k, v]) => [k, +v.mean.toFixed(1)])), imergMissing: g.imergMissing });
  const r = analyze(input, g, sc);
  console.log('\nCandidatas:', r.candidates_evaluated, '| pesos:', r.weights);
  for (const s of r.strategies) {
    console.log(`\n== ${s.label}  score=${s.score}  por fuente=${JSON.stringify(s.totals_by_source)}`);
    console.log('   ', s.sequence.join(' → '));
    console.log('   ', Object.entries(s.criteria).map(([k, v]) => `${k}:${v.score}`).join('  '));
    if (s.violations?.length) console.log('    VIOLACIONES:', s.violations);
    s.risks.slice(0, 4).forEach((x) => console.log('    riesgo:', x));
  }
  console.log('\nRobustez:', JSON.stringify(r.robustness.by_source.map((x) => ({ s: x.source, p: Math.round(x.annual_precip_mm), r: x.ranking }))));
  console.log('Sensibilidad:', r.sensitivity);
  console.log('Problemas de datos:', r.data_quality.problems, r.data_quality.power_issues);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
