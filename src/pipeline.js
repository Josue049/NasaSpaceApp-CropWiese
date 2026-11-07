'use strict';
/** Orquesta datos → climatologías → motor. Una sola función usada por servidor, scripts y pruebas. */
const fs = require('fs');
const path = require('path');
const ds = require('./datasources');
const { buildClimate } = require('./climate');
const engine = require('./engine');

const CROPS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crops.json'), 'utf8'));

const SCENARIOS = {
  base: { id: 'base', label: 'Clima observado 2015–2023', precip_factor: 1, temp_delta: 0, hypothetical: false },
  dry: { id: 'dry', label: 'Hipotético seco: lluvia −20 %, +1,5 °C', precip_factor: 0.8, temp_delta: 1.5, hypothetical: true },
  hot: { id: 'hot', label: 'Hipotético cálido: +2 °C', precip_factor: 1, temp_delta: 2, hypothetical: true },
  wet: { id: 'wet', label: 'Hipotético lluvioso: lluvia +15 %', precip_factor: 1.15, temp_delta: 0, hypothetical: true },
};

/** Reúne los datos de un punto. No lanza excepciones: informa lo que falta. */
async function gatherData(lat, lon, { allowFetchImerg = false } = {}) {
  const [power, era5, slope, soil] = await Promise.all([ds.getPower(lat, lon), ds.getEra5(lat, lon), ds.getSlope(lat, lon), ds.getSoil(lat, lon)]);
  const imerg = ds.getImergCached(lat, lon);
  return { power, era5, slope, soil, imerg, imergComplete: imerg.missing.length === 0, imergMissing: imerg.missing };
}

// Serie utilizable si cubre >= 95 % de los días de la ventana de análisis
function usableRain(map) { return !!map && Object.keys(map).length >= (ds.Y1 - ds.Y0 + 1) * 365 * 0.95; }

/** Construye las climatologías por fuente de lluvia. IMERG es la fuente primaria si está completa. */
function buildClimates(g, scenario = SCENARIOS.base) {
  if (!g.power.ok) return { climates: [], problems: [g.power.error] };
  const elev = g.slope && g.slope.ok ? g.slope.data.elevation_m : undefined;
  const raw = g.power.data, sc = { precip_factor: scenario.precip_factor, temp_delta: scenario.temp_delta }, yr = [ds.Y0, ds.Y1], list = [], problems = [];
  if (g.imergComplete && usableRain(g.imerg.data)) list.push({ id: 'imerg', label: 'GPM IMERG (NASA)', role: 'primary', climate: buildClimate(raw, { rain: g.imerg.data, scenario: sc, yearRange: yr, elevation: elev }), provenance: ds.IMERG_PROV });
  else problems.push(`IMERG incompleto (faltan años: ${g.imergMissing.join(', ') || 'n/d'}); se usa fuente alternativa y se degrada la confianza.`);
  if (g.era5.ok) list.push({ id: 'era5', label: 'ERA5 (control, no-NASA)', role: list.length ? 'check' : 'primary', climate: buildClimate(raw, { rain: g.era5.data, scenario: sc, yearRange: yr, elevation: elev }), provenance: g.era5.provenance });
  else problems.push(g.era5.error);
  list.push({ id: 'power', label: 'NASA POWER (lluvia reanálisis)', role: list.length ? 'check' : 'primary', climate: buildClimate(raw, { scenario: sc, yearRange: yr, elevation: elev }), provenance: g.power.provenance });
  return { climates: list, problems };
}

function analyze(input, g, scenario = SCENARIOS.base) {
  const { climates, problems } = buildClimates(g, scenario);
  if (!climates.length) throw new Error(`Sin datos climáticos: ${problems.join(' | ')}`);
  const res = engine.run(input, {
    crops: CROPS.crops, climates,
    slope: g.slope.ok ? g.slope.data.slope_pct : null,
    soil: g.soil.ok ? g.soil.data : null,
  });
  res.scenario = scenario;
  res.data_quality = {
    problems,
    sources: {
      power: g.power.provenance, imerg: climates.find((c) => c.id === 'imerg') ? ds.IMERG_PROV : null,
      era5: g.era5.provenance, slope: g.slope.provenance, soil: g.soil.provenance,
    },
    missing: { slope: !g.slope.ok ? g.slope.error : null, soil: !g.soil.ok ? g.soil.error : null },
    power_issues: ds.validatePower(g.power.data),
    climate_summary: climates.map((c) => ({
      id: c.id, label: c.label, role: c.role, annual_precip_mm: c.climate.annual.precip_mm, annual_et0_mm: c.climate.annual.et0_mm,
      precip_by_year: c.climate.annual.precip_by_year, years: c.climate.years, monthly: c.climate.monthly, elevation_m: c.climate.elevation_m,
    })),
  };
  return res;
}

module.exports = { gatherData, buildClimates, analyze, SCENARIOS, CROPS };
