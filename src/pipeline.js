'use strict';
/** Orquesta datos → climatologías → motor. Una sola función usada por servidor, scripts y pruebas. */
const fs = require('fs');
const path = require('path');
const ds = require('./datasources');
const { buildClimate, sowingWindows, awcFromSoil, tempUncertainty } = require('./climate');
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

/**
 * Evaluación de SOPORTE por ubicación: ¿es responsable recomendar aquí con estos productos de datos?
 * Los umbrales son decisiones de DISEÑO (conservadoras), no resultados de la literatura ni de validación de campo:
 *  - no_recomendable: la señal esencial (temperatura/altitud/pendiente) no es fiable o está fuera del dominio de la base de cultivos.
 *  - limitada: se recomienda con advertencias visibles.
 *  - aceptable: no se detectó una limitación conocida (NO significa validado: ninguna ubicación está contrastada con pluviómetro local).
 */
function assessSupport(input, g, climates) {
  const blockers = [], cautions = [];
  const { lat, lon } = input;
  if (!(lat >= -18.4 && lat <= 0.1 && lon >= -81.4 && lon <= -68.6)) cautions.push('Fuera del dominio probado (Perú): las reglas y la base de cultivos solo se han ejercitado en la selva alta peruana y en un caso andino.');
  const elev = g.slope.ok ? g.slope.data.elevation_m : null;
  const cell = g.power.ok ? g.power.data.geometry.coordinates[2] : null;
  if (elev == null) cautions.push('Sin elevación/pendiente SRTM: no se puede corregir la temperatura por altitud ni evaluar erosión.');
  if (elev != null && elev > 3200) blockers.push(`Altitud ${Math.round(elev)} m: por encima del dominio de la base de cultivos (cultivos de piso bajo y medio; sin cultivos andinos de altura).`);
  if (elev != null && cell != null) {
    const dz = Math.abs(elev - cell);
    if (dz > 1000) blockers.push(`La celda de NASA POWER (~55 km) está ${Math.round(dz)} m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).`);
    else if (dz > 300) cautions.push(`La celda de POWER difiere ${Math.round(dz)} m de la parcela: la corrección térmica por altitud es estimativa y más incierta.`);
  }
  if (g.slope.ok && g.slope.data.slope_pct > 50) blockers.push(`Pendiente ${g.slope.data.slope_pct.toFixed(0)} %: el modelo (cultivos anuales) no es adecuado; se requiere una evaluación de conservación de suelos.`);
  else if (g.slope.ok && g.slope.data.slope_pct > 25) cautions.push(`Pendiente ${g.slope.data.slope_pct.toFixed(0)} %: alto riesgo de erosión; la pendiente SRTM (ventana de 180 m) puede no representar la parcela.`);
  const annual = climates.map((c) => c.climate.annual.precip_mm).filter(Number.isFinite);
  if (annual.length > 1 && Math.max(...annual) / Math.min(...annual) > 1.5) cautions.push(`Las fuentes de lluvia discrepan (${Math.round(Math.min(...annual))}–${Math.round(Math.max(...annual))} mm/año, ratio ${(Math.max(...annual) / Math.min(...annual)).toFixed(2)}): el riesgo hídrico es incierto.`);
  if (!climates.find((c) => c.id === 'imerg')) cautions.push('Sin serie IMERG completa: la lluvia depende de reanálisis (ERA5/POWER).');
  if (!g.soil.ok) cautions.push('Sin datos de suelo: se omite el criterio de ajuste al suelo.');
  const level = blockers.length ? 'no_recomendable' : cautions.length ? 'limitada' : 'aceptable';
  return { level, blockers, cautions, note: 'Ningún nivel implica validación de campo: no hay contraste con pluviómetro local ni con agrónomo en ninguna ubicación.' };
}

function analyze(input, g, scenario = SCENARIOS.base) {
  const { climates, problems } = buildClimates(g, scenario);
  if (!climates.length) throw new Error(`Sin datos climáticos: ${problems.join(' | ')}`);
  const support = assessSupport(input, g, climates);
  const res = support.level === 'no_recomendable'
    ? { engine_version: engine.ENGINE_VERSION, generated_at: new Date().toISOString(), unsupported: true, strategies: [], limitations: [...support.blockers, 'No se generan estrategias para esta ubicación.'], robustness: null, sensitivity: null, weights: {}, weights_status: '', candidates_evaluated: 0,
      context: { slope_pct: g.slope.ok ? g.slope.data.slope_pct : null, soil: g.soil.ok ? g.soil.data : null, irrigated: !!input.irrigation, start_slot: input.start_slot || 'A', history: input.history || [] } }
    : engine.run(input, {
      crops: CROPS.crops, climates,
      slope: g.slope.ok ? g.slope.data.slope_pct : null,
      soil: g.soil.ok ? g.soil.data : null,
    });
  res.support = support;
  if (!res.unsupported) {
    const prim = climates.find((c) => c.role === 'primary') || climates[0];
    const awc = awcFromSoil(g.soil.ok ? g.soil.data : null), dT = tempUncertainty(prim.climate);
    res.sowing_windows = {
      source: prim.id, step_days: 15, temperature_uncertainty_c: +dT.toFixed(2),
      note: 'Fecha de inicio cada 15 días. viable = completa el ciclo ≥90 % de los años aun con T−δ y ETa/ETc ≥ 0,8; marginal = completa ≥50 % de los años; no_viable = menos. Umbrales de diseño; no es calendario agronómico validado.',
      crops: Object.fromEntries(CROPS.crops.map((c) => [c.id, sowingWindows(prim.climate, c, !!input.irrigation, awc, { step: 15, dT })])),
    };
  }
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

module.exports = { gatherData, buildClimates, analyze, assessSupport, SCENARIOS, CROPS };
