'use strict';
// Retroprueba blanda: arroz Tinajones sembrado el 2026-01-21 en Morropón (SENAMHI) vs. duración simulada por tiempo térmico
// con la climatología 2015–2023 (NO el clima de 2026). Es un contraste de orden de magnitud con UNA temporada; no calibra nada.
// Requiere red (POWER, ERA5, SRTM). Uso: node scripts/backtest_morropon.js
process.env.FIELDSHIFT_DOMAIN = 'peru';
const { gatherData, buildClimates, CROPS, SCENARIOS } = require('../src/pipeline');
const { evaluateSeason } = require('../src/climate');
const OBS = { lat: -5.19, lon: -79.99, sow: [1, 21], dap: { macollaje: 33, panoja: 79, floracion: 93, lechosa: 102, pastosa: 107, cornea: 114 } };
(async () => {
  const g = await gatherData(OBS.lat, OBS.lon);
  const { climates } = buildClimates(g, SCENARIOS.base);
  const crops = CROPS.crops;
  const arroz = crops.find((c) => c.id === 'arroz');
  const slot = { id: 'M', start: { m: OBS.sow[0], d: OBS.sow[1] }, window_days: 220 };
  console.log('Observado (SENAMHI, Morropón, Tinajones): DAS a maduración córnea =', OBS.dap.cornea);
  for (const c of climates) {
    const row = [];
    for (const dT of [-1.9, 0, 1.9]) { const r = evaluateSeason(c.climate, arroz, slot, true, 110, { dT }); row.push(`dT ${dT >= 0 ? '+' : ''}${dT}: ${r && r.dur_days != null ? r.dur_days + ' d' : 'n/d'} (completa ${r ? (r.complete_frac * 100).toFixed(0) : '—'} %)`); }
    console.log(`${c.id} (elev ${Math.round(c.climate.elevation_m)} m, celda ${Math.round(c.climate.cell_elevation_m ?? NaN)} m) → modelo con ciclo base ${arroz.cycle.ini + arroz.cycle.dev + arroz.cycle.mid + arroz.cycle.late} d efectivos: ${row.join(' | ')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
