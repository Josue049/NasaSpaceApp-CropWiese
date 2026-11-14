'use strict';
// Ejecuta la demo de arroz Tinajones en Morropón con datos reales (requiere red o data/demo_morropon) y resume.
const { gatherData } = require('../src/pipeline');
const { analyzeRice, DOMAIN } = require('../src/rice');
(async () => {
  const { lat, lon } = DOMAIN.center;
  const g = await gatherData(lat, lon);
  const r = analyzeRice({ lat, lon, area_ha: 1, sowing_date: '2026-01-21' }, g);
  console.log('soporte:', r.support.level, r.support.cautions);
  console.log('fuentes:', r.sources.map((s) => `${s.id}:${s.annual_precip_mm}mm`).join(' '));
  console.log('contraste T:', JSON.stringify({ antes: r.temperature_check.before_correction && [r.temperature_check.before_correction.bias_tmean_c, r.temperature_check.before_correction.bias_tmax_c, r.temperature_check.before_correction.bias_tmin_c], offsets: r.temperature_check.offsets_c }));
  console.log('fecha | estado | completa | dur | ETc | neto(fuentes) | calor | Tmin flor | agua térm índice');
  for (const w of r.windows) console.log(`${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')} ${w.status.padEnd(9)} ${w.complete_frac} ${w.dur_days} ${w.etc_mm} ${w.net_range_by_source_mm.join('–')} ${w.heat_frac_flowering} ${w.tmin_flowering_c} | ${w.water_score} ${w.thermal_score} ${w.index}`);
  console.log('TOP:', r.top.map((w) => `${w.month}-${w.day} (${w.index})`).join(', '));
  console.log('21-ene (obs):', JSON.stringify({ dur: r.chosen.dur_days, etc: r.chosen.etc_mm, stage: r.chosen.stage_das, net_m3_ha: r.chosen.net_m3_per_ha }));
})().catch((e) => { console.error(e); process.exit(1); });
