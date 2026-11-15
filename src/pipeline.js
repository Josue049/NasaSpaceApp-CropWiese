'use strict';
/** Orquesta datos → climatologías → motor. Una sola función usada por servidor, scripts y pruebas. */
const fs = require('fs');
const path = require('path');
const ds = require('./datasources');
const { buildClimate, sowingWindows, awcFromSoil, tempUncertainty, canopyCoverMean } = require('./climate');
const engine = require('./engine');
const engine2 = require('./engine2');
const morropon = require('./morropon');
const location = require('./location');

const CROPS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crops.json'), 'utf8'));
for (const c of CROPS.crops) c.canopy_cover = canopyCoverMean(c); // campo derivado (FAO-56 ec. 76); no está en el JSON

const SCENARIOS = {
  base: { id: 'base', label: 'Clima observado 2015–2023', precip_factor: 1, temp_delta: 0, hypothetical: false },
  dry: { id: 'dry', label: 'Hipotético seco: lluvia −20 %, +1,5 °C', precip_factor: 0.8, temp_delta: 1.5, hypothetical: true },
  hot: { id: 'hot', label: 'Hipotético cálido: +2 °C', precip_factor: 1, temp_delta: 2, hypothetical: true },
  wet: { id: 'wet', label: 'Hipotético lluvioso: lluvia +15 %', precip_factor: 1.15, temp_delta: 0, hypothetical: true },
};

/**
 * Reúne los datos de un punto. No lanza excepciones: informa lo que falta.
 * En el dominio Morropón cada fuente de CLIMA se consulta en la celda nativa que contiene al punto elegido (ver src/location.js);
 * elevación/pendiente (SRTM) y suelo (SoilGrids) se consultan en el punto exacto. Fuera de ese dominio (pruebas heredadas) se usa el punto tal cual.
 */
async function gatherData(lat, lon, { allowFetchImerg = false, station = morropon.PROFILE.station } = {}) {
  const useCells = activeDomain().id === 'morropon';
  const loc = useCells ? location.resolveCells(lat, lon, station) : null;
  const q = (src) => (loc ? loc.sources[src].query : { lat, lon });
  const [power, era5, slope, soil, era5t] = await Promise.all([ds.getPower(q('power').lat, q('power').lon), ds.getEra5(q('era5').lat, q('era5').lon), ds.getSlope(lat, lon), ds.getSoil(lat, lon), useCells ? ds.getEra5Temp(q('era5').lat, q('era5').lon) : Promise.resolve({ ok: false, error: 'no aplica fuera del dominio Morropón' })]);
  const imerg = ds.getImergCached(q('imerg').lat, q('imerg').lon);
  return { power, era5, era5t, slope, soil, imerg, imergComplete: imerg.missing.length === 0, imergMissing: imerg.missing, imergQuery: q('imerg'), location: loc, requested: { lat, lon } };
}


// ---------- calibración con la estación SENAMHI Morropón (scripts/validate_sources_senamhi.js) ----------
const CAL_FILE = path.join(__dirname, '..', 'data', 'validation', 'calibration_senamhi.json');
let _cal;
function calibration() { if (_cal === undefined) { try { _cal = JSON.parse(fs.readFileSync(CAL_FILE, 'utf8')); } catch { _cal = null; } } return _cal; }
/** 'senamhi_monthly' = ERA5 + offsets mensuales validados fuera de muestra (por defecto en Morropón si hay datos); 'legacy' = POWER con corrección global de 11 valores SENAMHI 2026. */
function tempMethod(g, scenario = {}) {
  const forced = scenario.temp_method || process.env.FIELDSHIFT_TEMP_METHOD;
  if (forced === 'legacy') return 'legacy';
  const cal = calibration();
  return activeDomain().id === 'morropon' && cal && cal.temperatura && cal.temperatura.fuente_elegida === 'era5' && g.era5t && g.era5t.ok ? 'senamhi_monthly' : 'legacy';
}

// Serie utilizable si cubre >= 95 % de los días de la ventana de análisis
function usableRain(map) { return !!map && Object.keys(map).length >= (ds.Y1 - ds.Y0 + 1) * 365 * 0.95; }

/** Respuesta para un punto fuera del ámbito de la demo: se explica el motivo sin consultar datos de otro lugar. */
function outOfScope(input) {
  const dom = activeDomain();
  const msg = `Fuera del alcance de la demo (${dom.label}): lat ${dom.box.latMin} a ${dom.box.latMax}, lon ${dom.box.lonMin} a ${dom.box.lonMax} (caja aproximada de diseño).`;
  return { engine_version: engine.ENGINE_VERSION, generated_at: new Date().toISOString(), unsupported: true, strategies: [], limitations: [msg, 'No se generan estrategias para esta ubicación.'], robustness: null, sensitivity: null, weights: {},
    support: { level: 'no_recomendable', blockers: [msg], cautions: [], note: 'No se consultaron datos: no se sustituyen por los de otra ubicación.' },
    location_report: { requested: input ? { lat: input.lat, lon: input.lon } : null, point: null, uses_cells: false, sources: [], fallbacks: [], note: 'Sin consulta de datos por estar fuera del ámbito.' },
    context: { irrigated: !!(input && input.irrigation), start_slot: (input && input.start_slot) || 'A', history: (input && input.history) || [] } };
}

/** Resumen auditable de qué datos alimentan el resultado en el punto elegido y qué respaldo explícito se aplicó. */
function describeLocation(g, climates) {
  const loc = g.location, req = g.requested || null;
  const roleOf = (id) => { const c = climates.find((x) => x.id === id); return c ? (c.role === 'primary' ? 'principal' : 'control') : null; };
  const sources = [];
  const fallbacks = [];
  const add = (id, label, resolution, status, cell, note) => sources.push({ id, label, resolution, status, role: roleOf(id), cell: cell || null, note: note || null });
  const cellInfo = (id) => (loc ? { center: loc.sources[id].cell_center, query: loc.sources[id].query, distance_km: loc.sources[id].distance_to_cell_center_km, same_as_station: loc.sources[id].same_cell_as_station } : null);
  add('power', 'NASA POWER (MERRA-2)', loc ? loc.sources.power.resolution : '0,5° × 0,625°', g.power.ok ? (g.power.provenance.cached ? 'caché' : 'en vivo') : 'no_disponible', cellInfo('power'), g.power.ok ? null : g.power.error);
  add('era5', 'ERA5 (Open-Meteo)', loc ? loc.sources.era5.resolution : '~0,1°', g.era5.ok ? (g.era5.provenance.cached ? 'caché' : 'en vivo') : 'no_disponible', cellInfo('era5'), g.era5.ok ? null : g.era5.error);
  add('imerg', 'GPM IMERG V07', loc ? loc.sources.imerg.resolution : '0,1°', g.imergComplete ? 'caché' : 'no_disponible', cellInfo('imerg'), g.imergComplete ? null : `faltan años: ${g.imergMissing.join(', ')}`);
  add('srtm', 'SRTM (elevación y pendiente)', '30 m (ventana de 180 m)', g.slope.ok ? (g.slope.provenance.cached ? 'caché' : 'en vivo') : 'no_disponible', null, g.slope.ok ? null : g.slope.error);
  add('soilgrids', 'SoilGrids 2.0 (suelo 0–30 cm)', '250 m, modelado', g.soil.ok ? (g.soil.provenance.cached ? 'caché' : 'en vivo') : 'no_disponible', g.soil.ok && g.soil.data.queried_at ? { query: g.soil.data.queried_at, moved: !!g.soil.data.moved_from_input } : null, g.soil.ok ? (g.soil.data.moved_from_input ? 'el punto exacto está enmascarado; se usó un punto vecino (≤ 700 m)' : null) : g.soil.error);
  if (!g.imergComplete) fallbacks.push({ id: 'imerg', text: 'No hay serie IMERG descargada para la celda de este punto: la lluvia principal pasa a ERA5, con POWER como control. La confianza en el riesgo hídrico baja hasta completar la descarga.' });
  if (!g.soil.ok) fallbacks.push({ id: 'soilgrids', text: 'SoilGrids no respondió en este punto: se omite el criterio de aptitud de suelo. No se sustituye por el suelo de otro lugar.' });
  if (!g.slope.ok) fallbacks.push({ id: 'srtm', text: 'No se pudo obtener elevación/pendiente de este punto: no se corrige la temperatura por altitud ni se evalúa erosión. No se usan los valores del centro.' });
  if (!g.power.ok) fallbacks.push({ id: 'power', text: 'NASA POWER no respondió: sin temperatura ni radiación no se puede calcular el análisis.' });
  return {
    requested: req, point: { elevation_m: g.slope.ok ? Math.round(g.slope.data.elevation_m) : null, slope_pct: g.slope.ok ? +g.slope.data.slope_pct.toFixed(1) : null, soil_ph: g.soil.ok ? +g.soil.data.phh2o.mean.toFixed(2) : null, clay_pct: g.soil.ok && g.soil.data.clay ? +g.soil.data.clay.mean.toFixed(0) : null, sand_pct: g.soil.ok && g.soil.data.sand ? +g.soil.data.sand.mean.toFixed(0) : null },
    uses_cells: !!loc, sources, fallbacks,
    note: 'Clima: una serie por celda nativa de cada producto (puntos de la misma celda comparten datos). Elevación, pendiente y suelo: del punto elegido. Si dos ubicaciones caen en la misma celda de lluvia/temperatura, esas variables no cambiarán entre ellas.',
  };
}

/** Construye las climatologías por fuente de lluvia. IMERG es la fuente primaria si está completa. */
function buildClimates(g, scenario = SCENARIOS.base) {
  if (!g.power.ok) return { climates: [], problems: [g.power.error] };
  const elev = g.slope && g.slope.ok ? g.slope.data.elevation_m : undefined;
  const method = tempMethod(g, scenario), cal = calibration();
  const extra = {}; let monthly = null;
  if (method === 'senamhi_monthly') {
    const o = cal.temperatura.fuentes.era5.offsets_mensuales_c; monthly = { T: o.tm, Tx: o.tx, Tn: o.tn };
    extra.temp = { series: g.era5t.data, station_elevation_m: cal.estacion_referencia.elevation_m };
    extra.heatObs = { umbrales: cal.calor_observado.umbrales, prob_por_doy: cal.calor_observado.prob_por_doy };
  }
  const raw = g.power.data, sc = { precip_factor: scenario.precip_factor, temp_delta: scenario.temp_delta, temp_offsets: method === 'legacy' ? scenario.temp_offsets : undefined, temp_offsets_monthly: monthly }, yr = [ds.Y0, ds.Y1], list = [], problems = [];
  if (g.imergComplete && usableRain(g.imerg.data)) list.push({ id: 'imerg', label: 'GPM IMERG (NASA)', role: 'primary', climate: buildClimate(raw, { rain: g.imerg.data, scenario: sc, yearRange: yr, elevation: elev, ...extra }), provenance: ds.IMERG_PROV });
  else problems.push(`IMERG incompleto (faltan años: ${g.imergMissing.join(', ') || 'n/d'}); se usa fuente alternativa y se degrada la confianza.`);
  if (g.era5.ok) list.push({ id: 'era5', label: 'ERA5 (control, no-NASA)', role: list.length ? 'check' : 'primary', climate: buildClimate(raw, { rain: g.era5.data, scenario: sc, yearRange: yr, elevation: elev, ...extra }), provenance: g.era5.provenance });
  else problems.push(g.era5.error);
  list.push({ id: 'power', label: 'NASA POWER (lluvia reanálisis)', role: list.length ? 'check' : 'primary', climate: buildClimate(raw, { scenario: sc, yearRange: yr, elevation: elev, ...extra }), provenance: g.power.provenance });
  return { climates: list, problems, temp_method: method };
}

/**
 * Evaluación de SOPORTE por ubicación: ¿es responsable recomendar aquí con estos productos de datos?
 * Los umbrales son decisiones de DISEÑO (conservadoras), no resultados de la literatura ni de validación de campo:
 *  - no_recomendable: la señal esencial (temperatura/altitud/pendiente) no es fiable o está fuera del dominio de la base de cultivos.
 *  - limitada: se recomienda con advertencias visibles.
 *  - aceptable: no se detectó una limitación conocida (NO significa validado: ninguna ubicación está contrastada con pluviómetro local).
 */
// Dominio de uso. Por defecto, la demo reducida: Morropón (Alto Piura), arroz Tinajones + frijol. FIELDSHIFT_DOMAIN=peru restaura el dominio amplio de v0.2.
// La caja es una APROXIMACIÓN de diseño (≈ ±12 km de la estación SENAMHI Morropón), no un límite administrativo oficial.
const DOMAINS = {
  morropon: { id: 'morropon', label: 'Morropón, Alto Piura (arroz Tinajones + frijol Loctao)', box: { latMin: -5.30, latMax: -5.09, lonMin: -80.10, lonMax: -79.88 }, center: { lat: -5.19, lon: -79.99 }, slots: morropon.SLOTS },
  peru: { id: 'peru', label: 'Perú', box: { latMin: -18.4, latMax: 0.1, lonMin: -81.4, lonMax: -68.6 } },
};
const activeDomain = () => DOMAINS[process.env.FIELDSHIFT_DOMAIN] || DOMAINS.morropon;
const inBox = (lat, lon, b) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;

function assessSupport(input, g, climates) {
  const blockers = [], cautions = [];
  const { lat, lon } = input;
  const dom = activeDomain();
  if (!inBox(lat, lon, dom.box)) {
    if (dom.id === 'morropon') blockers.push(`Fuera del alcance de la demo (${dom.label}): lat ${dom.box.latMin} a ${dom.box.latMax}, lon ${dom.box.lonMin} a ${dom.box.lonMax} (caja aproximada de diseño).`);
    else cautions.push('Fuera del dominio probado (Perú): las reglas y la base de cultivos solo se han ejercitado en la selva alta peruana y en un caso andino.');
  }
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
  if (annual.length && Math.max(...annual) < 400) cautions.push(`Zona árida (lluvia anual ≤ ${Math.round(Math.max(...annual))} mm en todas las fuentes): el secano no es viable; solo tendría sentido evaluar con riego y el modelo de riego es un supuesto simple (×0,3).`);
  if (!climates.find((c) => c.id === 'imerg')) cautions.push('Sin serie IMERG completa: la lluvia depende de reanálisis (ERA5/POWER).');
  if (!g.soil.ok) cautions.push('Sin datos de suelo: se omite el criterio de ajuste al suelo.');
  const level = blockers.length ? 'no_recomendable' : cautions.length ? 'limitada' : 'aceptable';
  return { level, blockers, cautions, note: 'Ningún nivel implica validación de campo: no hay contraste con pluviómetro local ni con agrónomo en ninguna ubicación.' };
}

function analyze(input, g, scenario = SCENARIOS.base) {
  const dom = activeDomain();
  let built = buildClimates(g, scenario);
  if (!built.climates.length) throw new Error(`Sin datos climáticos: ${built.problems.join(' | ')}`);
  let tempOffsets = null;
  if (dom.id === 'morropon' && built.temp_method === 'legacy') { // corrección EMPÍRICA global con 11 valores SENAMHI 2026 (método anterior); solo si no hay calibración mensual
    tempOffsets = morropon.offsetsFrom(morropon.temperatureCheck((built.climates.find((c) => c.role === 'primary') || built.climates[0]).climate));
    if (tempOffsets) built = buildClimates(g, { ...scenario, temp_offsets: tempOffsets });
  }
  const { climates, problems } = built;
  // Motor: 'v2' (dos etapas) por defecto en Morropón; 'v1' (puntuación única original) a petición y fuera de Morropón.
  const engineChoice = dom.id === 'morropon' && input.engine !== 'v1' ? 'v2' : 'v1';
  const cropList = dom.id === 'morropon' ? morropon.rotationCrops(CROPS.crops, input.rice_cycle || null, engineChoice === 'v1' ? morropon.LEGACY_ROTATION_CROPS : morropon.ROTATION_CROPS) : CROPS.crops;
  const support = assessSupport(input, g, climates);
  const res = support.level === 'no_recomendable'
    ? { engine_version: engine.ENGINE_VERSION, generated_at: new Date().toISOString(), unsupported: true, strategies: [], limitations: [...support.blockers, 'No se generan estrategias para esta ubicación.'], robustness: null, sensitivity: null, weights: {}, weights_status: '', candidates_evaluated: 0,
      context: { slope_pct: g.slope.ok ? g.slope.data.slope_pct : null, soil: g.soil.ok ? g.soil.data : null, irrigated: !!input.irrigation, start_slot: input.start_slot || 'A', history: input.history || [] } }
    : (engineChoice === 'v2' ? engine2.run : engine.run)(input, {
      crops: cropList, slots: dom.slots, climates,
      slope: g.slope.ok ? g.slope.data.slope_pct : null,
      soil: g.soil.ok ? g.soil.data : null,
    });
  res.support = support;
  res.location_report = describeLocation(g, climates);
  res.temperature = (() => { const cal = calibration(); return built.temp_method === 'senamhi_monthly' ? { method: 'senamhi_monthly', source: 'ERA5 (temperatura) + offsets mensuales (Tmax, Tmin, Tmedia) calibrados con SENAMHI Morropón 2001-2014', validation: 'Mejora el RMSE fuera de muestra en ambos sentidos de la partición temporal (docs/VALIDACION_FUENTES_SENAMHI.md)', heat: 'El estrés por calor usa la frecuencia OBSERVADA de días calurosos en la estación (1981-2014), porque los reanálisis corregidos subestiman los días ≥35 °C.', assumption: 'Sesgo estable entre 2001-2014 y 2015-2023 y representatividad de la estación para el punto (hipótesis).', rmse_oos_c: cal.temperatura.fuentes.era5.rmse_fuera_de_muestra_medio } : { method: 'legacy', source: 'NASA POWER con corrección global (11 valores SENAMHI 2026)', validation: 'No validada fuera de muestra; el sesgo de POWER cambia de signo con la estación del año.' }; })();
  res.domain = { id: dom.id, label: dom.label, temp_offsets_c: tempOffsets, crops: cropList.map((c) => c.id), slots: dom.slots || null };
  if (!res.unsupported) {
    const prim = climates.find((c) => c.role === 'primary') || climates[0];
    const awc = awcFromSoil(g.soil.ok ? g.soil.data : null), dT = tempUncertainty(prim.climate);
    res.sowing_windows = {
      source: prim.id, step_days: 15, temperature_uncertainty_c: +dT.toFixed(2),
      note: 'Fecha de inicio cada 15 días. viable = completa el ciclo ≥90 % de los años aun con T−δ y ETa/ETc ≥ 0,8; marginal = completa ≥50 % de los años; no_viable = menos. Umbrales de diseño; no es calendario agronómico validado.',
      crops: Object.fromEntries(cropList.map((c) => {
        const w = sowingWindows(prim.climate, c, !!input.irrigation, awc, { step: 15, dT });
        // mismas reglas de capacidad que el motor: riego obligatorio y altitud máxima EcoCrop
        const blocked = (c.regime === 'irrigated_required' && !input.irrigation) || (c.eco?.altmx != null && prim.climate.elevation_m > c.eco.altmx);
        return [c.id, blocked ? w.map((x) => ({ ...x, status: 'no_viable', blocked: true })) : w];
      })),
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

module.exports = { tempMethod, calibration, outOfScope, describeLocation, gatherData, buildClimates, analyze, assessSupport, activeDomain, DOMAINS, SCENARIOS, CROPS };
