'use strict';
/**
 * Demo reducida: arroz, variedad Tinajones, Morropón (Alto Piura).
 * Compara FECHAS DE SIEMBRA para una parcela de arroz con dos criterios calculables hoy:
 *   - térmico: fracción de años en que el ciclo se completa × (1 − fracción de días con Tmax > umbral en la ventana de floración);
 *   - agua: demanda neta de riego = ETc − lluvia durante el ciclo (SIN percolación, saturación ni preparación de suelo: no hay dato).
 * Los índices son RELATIVOS entre fechas. No son rendimientos ni lámina de riego real.
 * Fenología por tiempo térmico (EcoCrop) con un ciclo de 114 días efectivos calibrado con UNA temporada de SENAMHI (ver data/rice_tinajones.json).
 */
const fs = require('fs');
const path = require('path');
const { devRate, kcAt, cycleLength, tempUncertainty } = require('./climate');
const { buildClimates, SCENARIOS } = require('./pipeline');
const { temperatureCheck, offsetsFrom } = require('./morropon');

const PROFILE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rice_tinajones.json'), 'utf8'));
const OBS_CSV = path.join(__dirname, '..', 'docs', 'evidence', 'rice_morropon_2026_senamhi.csv');
const L = cycleLength(PROFILE);
const STEP_DAYS = 10;
// Pesos PROVISIONALES: proporción de los criterios C1 (agua, 25 %) y C2 (térmico, 20 %) de docs/CRITERIOS_ARROZ.md renormalizada. Supuesto de diseño.
const WEIGHTS = { water: 25 / 45, thermal: 20 / 45 };
// Dominio de la demo: caja aproximada (≈ ±12 km) alrededor de la estación SENAMHI Morropón. Aproximación de diseño, no un límite oficial.
const DOMAIN = { id: 'morropon_tinajones', label: 'Morropón, Alto Piura (arroz Tinajones)', box: { latMin: -5.30, latMax: -5.09, lonMin: -80.10, lonMax: -79.88 }, center: { lat: PROFILE.station.lat, lon: PROFILE.station.lon } };
const inBox = (lat, lon, b = DOMAIN.box) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;

const ymd = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const med = (a) => { if (!a.length) return null; const q = [...a].sort((x, y) => x - y); const n = q.length; return n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const pct = (a, p) => { if (!a.length) return null; const q = [...a].sort((x, y) => x - y); return q[Math.min(q.length - 1, Math.max(0, Math.round(p * (q.length - 1))))]; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/** Simula una siembra (año y fecha) en la climatología primaria. Devuelve null si faltan datos. */
function simulate(clim, y, m, d, dT = 0) {
  const start = Date.UTC(y, m - 1, d);
  let te = 0, etc = 0, done = false, flowN = 0, flowHeat = 0, flowTn = 0, flowTx = 0;
  const stageDay = {}; const keys = [];
  const das = PROFILE.phenology_das, [f0, f1] = PROFILE.flowering_window_das;
  const stageIds = Object.keys(das);
  for (let t = 0; t < 260; t++) {
    const day = clim.byKey.get(ymd(start + t * 86400000));
    if (!day) return null;
    keys.push(day.key);
    etc += kcAt(PROFILE, Math.min(te, L - 1e-9)) * day.et0;
    if (te >= f0 && te < f1) { flowN++; flowTn += day.Tn; flowTx += day.Tx; if (day.Tx > PROFILE.t_stress_max) flowHeat++; }
    te += devRate(PROFILE.eco, day.T + dT);
    for (const s of stageIds) if (stageDay[s] === undefined && te >= das[s]) stageDay[s] = t + 1;
    if (te >= L) { done = true; break; }
  }
  return { done, days: keys.length, etc, keys, stageDay, heatFrac: flowN ? flowHeat / flowN : 0, tnFlow: flowN ? flowTn / flowN : null, txFlow: flowN ? flowTx / flowN : null, start };
}

function rainOver(clim, keys) { let s = 0; for (const k of keys) { const d = clim.byKey.get(k); if (d) s += d.P; } return s; }

/** Evalúa una fecha de siembra (mes/día) en todos los años de la serie. */
function evaluateDate(climates, m, d, dT) {
  const prim = climates.find((c) => c.role === 'primary') || climates[0];
  const runs = [], runsCold = [];
  for (const y of prim.climate.years) {
    const r = simulate(prim.climate, y, m, d, 0), rc = simulate(prim.climate, y, m, d, -dT);
    if (r) runs.push({ y, ...r }); if (rc) runsCold.push(rc);
  }
  if (!runs.length) return null;
  const ok = runs.filter((r) => r.done);
  const completeFrac = ok.length / runs.length, completeFracCold = runsCold.length ? runsCold.filter((r) => r.done).length / runsCold.length : 0;
  const bySource = {};
  for (const c of climates) {
    const net = ok.map((r) => Math.max(0, r.etc - rainOver(c.climate, r.keys)));
    const rain = ok.map((r) => rainOver(c.climate, r.keys));
    bySource[c.id] = { net_mm: r1(med(net)), rain_mm: r1(med(rain)) };
  }
  const stage = {}; for (const s of Object.keys(PROFILE.phenology_das)) { const v = med(ok.map((r) => r.stageDay[s]).filter((x) => x != null)); stage[s] = v == null ? null : Math.round(v); }
  const medStart = ok.length ? new Date(Date.UTC(2001, m - 1, d)) : null;
  const stageDates = {}; if (medStart) for (const s of Object.keys(stage)) if (stage[s] != null) stageDates[s] = new Date(medStart.getTime() + (stage[s] - 1) * 86400000).toISOString().slice(5, 10);
  const heat = mean(ok.map((r) => r.heatFrac));
  return {
    month: m, day: d, n_years: runs.length, complete_frac: r2(completeFrac), complete_frac_cold: r2(completeFracCold),
    dur_days: med(ok.map((r) => r.days)), stage_das: stage, stage_dates_md: stageDates,
    etc_mm: r1(med(ok.map((r) => r.etc))), by_source: bySource,
    heat_frac_flowering: r2(heat), tmin_flowering_c: r1(mean(ok.map((r) => r.tnFlow).filter((x) => x != null))), tmax_flowering_c: r1(mean(ok.map((r) => r.txFlow).filter((x) => x != null))),
    net_p10_mm: r1(pct(ok.map((r) => Math.max(0, r.etc - rainOver(prim.climate, r.keys))), 0.1)), net_p90_mm: r1(pct(ok.map((r) => Math.max(0, r.etc - rainOver(prim.climate, r.keys))), 0.9)),
    thermal_raw: completeFrac * (1 - (heat ?? 0)), primary_source: prim.id,
  };
}

function assessSupport(input, g, climates) {
  const blockers = [], cautions = [];
  if (!inBox(input.lat, input.lon)) blockers.push(`Fuera del alcance de la demo (${DOMAIN.label}): lat ${DOMAIN.box.latMin} a ${DOMAIN.box.latMax}, lon ${DOMAIN.box.lonMin} a ${DOMAIN.box.lonMax} (caja aproximada de diseño).`);
  const elev = g.slope.ok ? g.slope.data.elevation_m : null, cell = g.power.ok ? g.power.data.geometry.coordinates[2] : null;
  if (elev != null && cell != null && Math.abs(elev - cell) > 300) cautions.push(`La celda de NASA POWER está ${Math.round(Math.abs(elev - cell))} m de diferencia en altitud respecto a la parcela: la temperatura se corrige con un gradiente estándar y es estimativa (ver contraste con SENAMHI).`);
  if (g.slope.ok && g.slope.data.slope_pct > 5) cautions.push(`Pendiente ${g.slope.data.slope_pct.toFixed(1)} %: poco usual para arroz inundado; revisar la ubicación.`);
  const annual = climates.map((c) => c.climate.annual.precip_mm).filter(Number.isFinite);
  if (annual.length > 1 && Math.max(...annual) / Math.min(...annual) > 1.5) cautions.push(`Las fuentes de lluvia discrepan (${Math.round(Math.min(...annual))}–${Math.round(Math.max(...annual))} mm/año): la demanda neta de riego es incierta.`);
  if (!climates.find((c) => c.id === 'imerg')) cautions.push('Sin serie IMERG completa: la lluvia depende de reanálisis (ERA5/POWER).');
  return { level: blockers.length ? 'fuera_de_alcance' : 'demo', blockers, cautions };
}

const LIMITATIONS = [
  'Calibrado con UNA temporada (Morropón 2026, SENAMHI): el ciclo de 114 días efectivos no refleja variabilidad entre años, parcelas ni manejo.',
  'Variedad sin resolver en la fuente (Tinajones vs. Mallares) y sin saber si fue siembra directa o trasplante.',
  'La demanda de riego es ETc − lluvia: NO incluye percolación, saturación ni preparación de suelo; no es lámina de riego real. Falta la disponibilidad del canal.',
  'No hay rendimiento, precio ni costo para Piura: el índice no estima ganancia ni producción.',
  'Los pesos (agua 56 %, térmico 44 %) son un supuesto de diseño derivado de docs/CRITERIOS_ARROZ.md; no están calibrados.',
  'Umbral de calor 35 °C genérico (no verificado para Tinajones); la temperatura nocturna en floración se muestra pero no se puntúa (sin umbral citado).',
  'Los datos satelitales son de baja resolución (celdas de decenas de km): describen la zona, no la parcela.',
  'No hay contraste con pluviómetro local ni validación de un agrónomo.',
];

function analyzeRice(input, g, scenario = SCENARIOS.base) {
  const first = buildClimates(g, scenario);
  if (!first.climates.length) throw new Error(`Sin datos climáticos: ${first.problems.join(' | ')}`);
  // Corrección EMPÍRICA de temperatura: el gradiente estándar sesga la temperatura (celda POWER ~930 m más alta). Se mide el sesgo contra las
  // temperaturas reportadas por SENAMHI (11 valores, una temporada) y se resta. SUPUESTO: el sesgo es estacionario. El contraste posterior es circular.
  const chk0 = temperatureCheck((first.climates.find((c) => c.role === 'primary') || first.climates[0]).climate);
  const offsets = offsetsFrom(chk0);
  const { climates, problems } = offsets ? buildClimates(g, { ...scenario, temp_offsets: offsets }) : first;
  const support = assessSupport(input, g, climates);
  const base = { engine: 'rice-demo-0.1', generated_at: new Date().toISOString(), scope: { ...DOMAIN, variety: PROFILE.name, crop: 'Arroz' }, support, limitations: LIMITATIONS, status: PROFILE._meta.status, flags: PROFILE._meta.flags };
  if (support.level === 'fuera_de_alcance') return { ...base, unsupported: true, windows: [], recommendation: null };
  const prim = climates.find((c) => c.role === 'primary') || climates[0];
  const dT = tempUncertainty(prim.climate);
  const wins = [];
  for (let doy = 1; doy <= 365; doy += STEP_DAYS) { const d0 = new Date(Date.UTC(2001, 0, doy)); const w = evaluateDate(climates, d0.getUTCMonth() + 1, d0.getUTCDate(), dT); if (w) wins.push(w); }
  const valid = wins.filter((w) => w.complete_frac >= 0.5);
  const nets = valid.map((w) => w.by_source[prim.id].net_mm), nmin = Math.min(...nets), nmax = Math.max(...nets);
  for (const w of wins) {
    const ok = w.complete_frac >= 0.5;
    w.water_score = ok && nmax > nmin ? r2(1 - (w.by_source[prim.id].net_mm - nmin) / (nmax - nmin)) : ok ? 1 : 0;
    w.thermal_score = r2(w.thermal_raw); delete w.thermal_raw;
    w.index = r1(100 * (WEIGHTS.water * w.water_score + WEIGHTS.thermal * w.thermal_score));
    w.status = !ok ? 'no_viable' : (w.complete_frac_cold >= 0.9 && w.heat_frac_flowering <= 0.1 ? 'viable' : 'marginal');
    const rs = Object.values(w.by_source).map((s) => s.rain_mm).filter(Number.isFinite);
    w.rain_source_ratio = rs.length > 1 && Math.min(...rs) > 0 ? r2(Math.max(...rs) / Math.min(...rs)) : null;
    w.net_range_by_source_mm = [r1(Math.min(...Object.values(w.by_source).map((s) => s.net_mm))), r1(Math.max(...Object.values(w.by_source).map((s) => s.net_mm)))];
  }
  const ranked = wins.filter((w) => w.status !== 'no_viable').sort((a, b) => b.index - a.index);
  const area = Number(input.area_ha) || 0;
  const chosen = input.sowing_date ? (() => { const [, mm, dd] = input.sowing_date.split('-').map(Number); return evaluateDate(climates, mm, dd, dT); })() : null;
  if (chosen) { chosen.water_score = null; chosen.net_m3_per_ha = r1(chosen.by_source[prim.id].net_mm * 10); chosen.net_m3_total = area ? r1(chosen.by_source[prim.id].net_mm * 10 * area) : null; delete chosen.thermal_raw; }
  return {
    ...base, windows: wins, top: ranked.slice(0, 3), worst: ranked.slice(-1), chosen,
    weights: WEIGHTS, weights_status: 'PROVISIONALES: supuesto de diseño (agua 25 : térmico 20 de docs/CRITERIOS_ARROZ.md, renormalizado).',
    temperature_uncertainty_c: r2(dT), primary_source: prim.id,
    sources: climates.map((c) => ({ id: c.id, role: c.role, label: c.label, annual_precip_mm: Math.round(c.climate.annual.precip_mm), provenance: c.provenance })),
    temperature_check: { before_correction: chk0, offsets_c: offsets, after_correction_circular: temperatureCheck(prim.climate), note: 'El sesgo de temperatura (modelo − SENAMHI) se corrigió empíricamente con una sola temporada; el contraste posterior es circular y no valida el modelo.' }, data_problems: problems,
    profile: { name: PROFILE.name, cycle_effective_days: L, phenology_das: PROFILE.phenology_das, stage_labels_es: PROFILE.stage_labels_es, kc: PROFILE.kc, station: PROFILE.station, observed_campaign: PROFILE.observed_campaign },
    parcel: { lat: input.lat, lon: input.lon, area_ha: area, elevation_m: g.slope.ok ? g.slope.data.elevation_m : null, slope_pct: g.slope.ok ? +g.slope.data.slope_pct.toFixed(2) : null },
  };
}

module.exports = { analyzeRice, DOMAIN, PROFILE, WEIGHTS, LIMITATIONS, inBox, simulate };
