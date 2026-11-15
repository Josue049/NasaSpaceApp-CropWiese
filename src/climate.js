'use strict';
/**
 * Climatología agrícola a partir de series diarias NASA POWER (+ lluvia alternativa).
 * - ET0 de referencia: FAO-56 Penman-Monteith diaria (Allen et al., 1998, ec. 6).
 * - Demanda del cultivo: ETc = Kc * ET0 (curva Kc FAO-56 por etapas).
 * - Estrés hídrico: balance diario de agua en la zona radicular (FAO-56 cap. 8, Ks), con
 *   ETa/ETc como índice de suficiencia hídrica.
 *
 * Todo lo que sale de aquí es un ESTIMADO derivado de reanálisis/satélite de resolución gruesa:
 * describe el CONTEXTO ZONAL, no la parcela.
 */

const U2_MIN = Number(process.env.FIELDSHIFT_U2MIN) || 0.5; /* override solo para sensibilidad */ // m/s. Piso FAO-56 (recomienda >=0,5 m/s). WS2M de POWER en Moyobamba: media 0,05, máx 0,33 m/s; ERA5 (u10*0.748) da 0,78 m/s. Efecto cuantificado en docs/AUDITORIA.md §2 (~+2 % ET0 con u2=0,8).
const SPINUP_DAYS = 45; // días previos a la siembra para inicializar el balance hídrico

const es = (T) => 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
const dayOfYear = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
const ymd = (ms) => { const dt = new Date(ms); return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`; };

/** Radiación extraterrestre Ra (MJ m-2 d-1), FAO-56 ec. 21. */
function extraterrestrial(latDeg, doy) {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/** ET0 diaria FAO-56 PM (mm/día). Entradas: °C, %, m/s, MJ m-2 d-1, m. */
function et0Day({ tmean, tmax, tmin, rh, ws, rs, lat, doy, z }) {
  const u2 = Math.max(ws, U2_MIN);
  const P = 101.3 * Math.pow((293 - 0.0065 * z) / 293, 5.26);
  const gamma = 0.000665 * P;
  const delta = (4098 * es(tmean)) / Math.pow(tmean + 237.3, 2);
  const esMean = (es(tmax) + es(tmin)) / 2;
  const ea = (rh / 100) * esMean;
  const Ra = extraterrestrial(lat, doy);
  const Rso = (0.75 + 2e-5 * z) * Ra;
  const ratio = Rso > 0 ? Math.min(rs / Rso, 1) : 0.5;
  const Rns = 0.77 * rs;
  const Rnl = 4.903e-9 * ((Math.pow(tmax + 273.16, 4) + Math.pow(tmin + 273.16, 4)) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) * (1.35 * ratio - 0.35);
  const Rn = Rns - Rnl;
  const num = 0.408 * delta * Rn + ((gamma * 900) / (tmean + 273)) * u2 * (esMean - ea);
  return Math.max(0, num / (delta + gamma * (1 + 0.34 * u2)));
}

/**
 * Construye la estructura climática a partir de la respuesta cruda de POWER diaria.
 * opts.rain {YYYYMMDD: mm} sustituye la lluvia de POWER; opts.scenario {precip_factor,temp_delta} (HIPOTÉTICO).
 */
function buildClimate(raw, opts = {}) {
  const sc = Object.assign({ precip_factor: 1, temp_delta: 0 }, opts.scenario || {});
  const off = Object.assign({ T: 0, Tx: 0, Tn: 0 }, sc.temp_offsets || {}); // corrección empírica local OPCIONAL (demo de arroz): sesgo medido contra temperaturas SENAMHI de una temporada
  const p = raw.properties.parameter;
  const [lon, lat, zPower] = raw.geometry.coordinates;
  // Método 'senamhi_monthly': la temperatura viene de una serie externa (ERA5) corregida con offsets MENSUALES calibrados contra la estación
  // SENAMHI Morropón (validación fuera de muestra); el gradiente se aplica respecto a la ELEVACIÓN DE LA ESTACIÓN, no de la celda de POWER.
  const ext = opts.temp || null, offM = sc.temp_offsets_monthly || null;
  const zCell = ext ? ext.station_elevation_m : zPower;
  // SUPUESTO: gradiente térmico estándar −6,5 °C/km entre la celda de referencia y la parcela (SRTM). Humedad relativa sin corregir.
  const dz = Number.isFinite(opts.elevation) ? Math.max(-1500, Math.min(1500, opts.elevation - zCell)) : 0;
  const lapse = dz === 0 ? 0 : -0.0065 * dz, zElev = zCell + dz;
  const days = [], byKey = new Map();
  for (const k of Object.keys(p.PRECTOTCORR).sort()) {
    if (opts.yearRange && (+k.slice(0, 4) < opts.yearRange[0] || +k.slice(0, 4) > opts.yearRange[1])) continue;
    const rainVal = opts.rain ? opts.rain[k] : p.PRECTOTCORR[k];
    const e = ext ? ext.series[k] : null; // [tx, tn, tm] de ERA5
    const v = { P: rainVal === undefined ? -999 : rainVal, T: ext ? (e ? e[2] : null) : p.T2M[k], Tx: ext ? (e ? e[0] : null) : p.T2M_MAX[k], Tn: ext ? (e ? e[1] : null) : p.T2M_MIN[k], RH: p.RH2M[k], WS: p.WS2M[k], RS: p.ALLSKY_SFC_SW_DWN[k] };
    if (Object.values(v).some((x) => x === -999 || x == null || Number.isNaN(x))) continue; // día con dato faltante: se omite
    const y = +k.slice(0, 4), m = +k.slice(4, 6), d = +k.slice(6, 8);
    const mT = offM ? offM.T[m - 1] : 0, mX = offM ? offM.Tx[m - 1] : 0, mN = offM ? offM.Tn[m - 1] : 0;
    const T = v.T + lapse + sc.temp_delta + off.T + mT, Tx = v.Tx + lapse + sc.temp_delta + off.Tx + mX, Tn = v.Tn + lapse + sc.temp_delta + off.Tn + mN;
    // SUPUESTO del escenario térmico: la humedad relativa se mantiene constante (aumenta el déficit de vapor)
    const et0 = et0Day({ tmean: T, tmax: Tx, tmin: Tn, rh: Math.min(100, v.RH), ws: v.WS, rs: v.RS, lat, doy: dayOfYear(y, m, d), z: zElev });
    const rec = { key: k, y, m, d, P: v.P * sc.precip_factor, T, Tx, Tn, et0 };
    days.push(rec); byKey.set(k, rec);
  }
  const years = [...new Set(days.map((x) => x.y))];
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const sel = days.filter((x) => x.m === m), yrs = new Set(sel.map((x) => x.y)).size;
    const rainByYear = [...new Set(sel.map((x) => x.y))].map((y) => sel.filter((x) => x.y === y).reduce((a, x) => a + x.P, 0)).sort((a, b) => a - b);
    const avg = (f) => sel.reduce((a, x) => a + f(x), 0) / sel.length;
    monthly.push({
      month: m, precip_mm: sel.reduce((a, x) => a + x.P, 0) / yrs,
      precip_p20_mm: rainByYear[Math.floor(0.2 * (rainByYear.length - 1))], precip_p80_mm: rainByYear[Math.ceil(0.8 * (rainByYear.length - 1))],
      et0_mm: sel.reduce((a, x) => a + x.et0, 0) / yrs, tmean: avg((x) => x.T), tmax: avg((x) => x.Tx), tmin: avg((x) => x.Tn),
    });
  }
  const fullYears = years.filter((y) => days.filter((x) => x.y === y).length >= 360);
  const annualP = fullYears.map((y) => days.filter((x) => x.y === y).reduce((a, x) => a + x.P, 0));
  const annualEt0 = fullYears.map((y) => days.filter((x) => x.y === y).reduce((a, x) => a + x.et0, 0));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return { lat, lon, elevation_m: zElev, cell_elevation_m: zCell, lapse_c: lapse, temp_method: ext ? 'senamhi_monthly' : 'legacy', heat_obs: opts.heatObs ? { ...opts.heatObs, station_elevation_m: ext ? ext.station_elevation_m : zCell } : null, years, days, byKey, monthly, scenario: sc, annual: { precip_mm: mean(annualP), et0_mm: mean(annualEt0), precip_by_year: annualP, n_years: annualP.length } };
}

/** P(Tmax ≥ thr) observada en la estación para un día del año; interpola entre umbrales enteros de la tabla (se acota al rango de la tabla). */
function heatProb(ho, doy, thr) {
  const ths = ho.umbrales, lo = ths[0], hi = ths[ths.length - 1], t = Math.max(lo, Math.min(hi, thr));
  const i = Math.min(ths.length - 2, Math.max(0, Math.floor(t - lo))), f = t - ths[i], idx = Math.min(365, doy - 1);
  const a = ho.prob_por_doy[ths[i]][idx], b = ho.prob_por_doy[ths[i + 1]][idx];
  return a == null || b == null ? 0 : a + f * (b - a);
}

/** Curva Kc FAO-56 por etapas. t = día dentro del ciclo (0..L-1). */
function kcAt(crop, t) {
  const { ini, dev, mid, late } = crop.cycle, { ini: k1, mid: k2, end: k3 } = crop.kc;
  if (t < ini) return k1;
  if (t < ini + dev) return k1 + ((t - ini) / dev) * (k2 - k1);
  if (t < ini + dev + mid) return k2;
  return k2 + ((t - ini - dev - mid) / late) * (k3 - k2);
}
const cycleLength = (crop) => crop.cycle.ini + crop.cycle.dev + crop.cycle.mid + crop.cycle.late;

const SLOTS = [
  { id: 'A', label: 'Campaña A (inicio de lluvias)', start: { m: 11, d: 1 }, window_days: 165 },
  { id: 'B', label: 'Campaña B (menor lluvia)', start: { m: 4, d: 15 }, window_days: 200 },
];

/** Capacidad de agua útil (mm/m) a partir de textura SoilGrids; 110 por defecto. */
function awcFromSoil(soil) {
  if (process.env.FIELDSHIFT_AWC) return Number(process.env.FIELDSHIFT_AWC); // solo sensibilidad
  if (!soil || !soil.sand || !soil.clay) return 110;
  if (soil.sand.mean >= 60) return 70;
  if (soil.clay.mean >= 40) return 120;
  return 110;
}

/**
 * Tasa de desarrollo diaria r(T) ∈ [0,1] con la forma trapezoidal de FAO EcoCrop:
 * 0 por debajo de TMIN, lineal hasta 1 en TOPMN, 1 en [TOPMN, TOPMX], lineal hasta 0 en TMAX.
 * Un "día efectivo" = un día con r = 1. Sin parámetros térmicos devuelve 1 (ciclo fijo).
 */
function devRate(eco, T) {
  if (!eco || eco.tmin == null || eco.topmn == null || eco.topmx == null || eco.tmax == null) return 1;
  if (T <= eco.tmin || T >= eco.tmax) return 0;
  if (T < eco.topmn) return (T - eco.tmin) / (eco.topmn - eco.tmin);
  if (T <= eco.topmx) return 1;
  return (eco.tmax - T) / (eco.tmax - eco.topmx);
}

/** Incertidumbre de la temperatura (°C): discrepancia entre productos (RMS 1,9 °C POWER-corregido vs ERA5, docs/AUDITORIA.md) ⊕ ±1,5 °C/km de gradiente × |Δz|. */
function tempUncertainty(clim) {
  const dz = Math.abs((clim.elevation_m ?? 0) - (clim.cell_elevation_m ?? clim.elevation_m ?? 0));
  return Math.sqrt(1.9 ** 2 + (1.5 * dz / 1000) ** 2);
}

/**
 * Siembra en la fecha dada de cada año disponible y simula, día a día, fenología por tiempo térmico + balance hídrico.
 * El ciclo base (crop.cycle, días) se interpreta como días efectivos (SUPUESTO: duración a temperatura óptima);
 * los días reales necesarios son los que hagan falta para acumularlos. Los límites de la simulación son
 * min(ventana disponible, EcoCrop GMAX). El año cuenta como "completo" si el cultivo termina dentro de ese límite.
 * opts.dT desplaza la temperatura SOLO en la tasa de desarrollo (no en ET0): se usa para propagar su incertidumbre.
 * Índices hídricos: ETa/ETc (1 = sin estrés); riesgo = fracción de años con índice ponderado < 0,8.
 */
function evaluateSeason(clim, crop, slot, irrigated, awc = 110, opts = {}) {
  const dT = opts.dT || 0, eco = crop.eco, ho = clim.heat_obs || null; // ho: frecuencia OBSERVADA de días calurosos (estación SENAMHI)
  const L = cycleLength(crop), { ini, dev, mid } = crop.cycle;
  const maxDays = Math.min(slot.window_days, eco && eco.gmax ? eco.gmax : Infinity);
  const TAW = awc * crop.root_m, RAW = crop.p_depletion * TAW;
  const perYear = []; let nTried = 0, nDone = 0;
  for (const y of clim.years) {
    const start = Date.UTC(y, slot.start.m - 1, slot.start.d);
    let Dr = 0, ok = true;
    for (let t = -SPINUP_DAYS; t < 0; t++) { // barbecho previo con Kc 0,4
      const day = clim.byKey.get(ymd(start + t * 86400000));
      if (!day) { Dr = RAW * 0.5; continue; }
      const ks = Dr > RAW ? Math.max(0, (TAW - Dr) / ((1 - crop.p_depletion) * TAW)) : 1;
      Dr = Math.min(TAW, Math.max(0, Dr - day.P + ks * 0.4 * day.et0));
    }
    let etc = 0, eta = 0, etcMid = 0, etaMid = 0, heat = 0, midDays = 0, heavyEarly = 0, tsum = 0, rain = 0, te = 0, days = 0, done = false;
    for (let t = 0; t < maxDays; t++) {
      const day = clim.byKey.get(ymd(start + t * 86400000));
      if (!day) { ok = false; break; }
      const kc = kcAt(crop, Math.min(te, L - 1e-9)), etcD = kc * day.et0;
      const ks = Dr > RAW ? Math.max(0, (TAW - Dr) / ((1 - crop.p_depletion) * TAW)) : 1;
      const etaD = ks * etcD;
      Dr = Math.min(TAW, Math.max(0, Dr - day.P + etaD));
      etc += etcD; eta += etaD; tsum += day.T; rain += day.P; days++;
      const inMid = te >= ini + dev && te < ini + dev + mid;
      if (inMid) { etcMid += etcD; etaMid += etaD; midDays++; if (ho) heat += heatProb(ho, dayOfYear(day.y, day.m, day.d), crop.t_stress_max + 0.0065 * ((clim.elevation_m ?? ho.station_elevation_m) - ho.station_elevation_m)); else if (day.Tx > crop.t_stress_max) heat++; }
      if (te < ini + dev && day.P >= 20) heavyEarly += day.P;
      te += devRate(eco, day.T + dT);
      if (te >= L) { done = true; break; }
    }
    if (!ok) continue;
    nTried++; if (done) nDone++;
    if (!done) continue; // año sin ciclo completo: cuenta para complete_frac, no para los índices hídricos
    const satTotal = etc > 0 ? eta / etc : 1, satMid = etcMid > 0 ? etaMid / etcMid : 1;
    perYear.push({ year: y, etc, eta, rain, days, sat_total: satTotal, sat_mid: satMid, sat: 0.4 * satTotal + 0.6 * satMid, /* ponderación PROVISIONAL (FAO-33: etapa media más sensible) */
      heat_frac: midDays ? heat / midDays : 0, heavy_early_mm: heavyEarly, tmean: tsum / days });
  }
  if (!nTried) return null;
  const complete_frac = nDone / nTried;
  const med = (a) => { const q = [...a].sort((x, y) => x - y); return q[Math.floor((q.length - 1) / 2)]; };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  if (!perYear.length) return { n_years: 0, complete_frac, cycle_days: L, dur_days: null, max_days: maxDays, window_days: slot.window_days, incomplete: true, sat: 0, drought_frac: 1, drought_frac_rainfed: 1, heat_frac: 0, heavy_early_mm: 0, tmean: NaN, etc_mm: 0, rain_mm: 0, deficit_mm: 0, taw_mm: TAW };
  const droughtFrac = perYear.filter((r) => r.sat < 0.8).length / perYear.length;
  const dur = perYear.map((r) => r.days).sort((a, b) => a - b);
  return {
    n_years: perYear.length, complete_frac, cycle_days: L, dur_days: med(dur), dur_p90_days: dur[Math.min(dur.length - 1, Math.ceil(0.9 * dur.length) - 1)],
    max_days: maxDays, window_days: slot.window_days,
    etc_mm: med(perYear.map((r) => r.etc)), rain_mm: med(perYear.map((r) => r.rain)),
    deficit_mm: med(perYear.map((r) => r.etc - r.eta)),
    sat: med(perYear.map((r) => r.sat)), sat_total: med(perYear.map((r) => r.sat_total)), sat_mid: med(perYear.map((r) => r.sat_mid)),
    drought_frac: irrigated ? droughtFrac * 0.3 : droughtFrac, // SUPUESTO: riego disponible reduce (no elimina) el riesgo
    drought_frac_rainfed: droughtFrac,
    heat_frac: mean(perYear.map((r) => r.heat_frac)), heavy_early_mm: mean(perYear.map((r) => r.heavy_early_mm)), tmean: mean(perYear.map((r) => r.tmean)),
    taw_mm: TAW,
  };
}

/**
 * Ventanas de siembra: para fechas de inicio cada `step` días a lo largo del año, fracción de años en que el ciclo
 * se completa (sin límite de campaña, solo EcoCrop GMAX) y suficiencia hídrica. Estado: viable / marginal / no_viable.
 * Umbrales de estado = decisiones de diseño (no de la literatura): viable si completa ≥90 % de los años (con T−δ) y ETa/ETc ≥ 0,8.
 */
function sowingWindows(clim, crop, irrigated, awc, { step = 15, dT = 0 } = {}) {
  const out = [];
  for (let doy = 1; doy <= 365; doy += step) {
    const d0 = new Date(Date.UTC(2001, 0, doy)); // año de referencia no bisiesto
    const slot = { id: 'W', start: { m: d0.getUTCMonth() + 1, d: d0.getUTCDate() }, window_days: crop.eco && crop.eco.gmax ? Math.min(365, crop.eco.gmax) : 365 };
    const base = evaluateSeason(clim, crop, slot, irrigated, awc);
    const cold = evaluateSeason(clim, crop, slot, irrigated, awc, { dT: -Math.abs(dT) });
    if (!base) continue;
    const sat = base.n_years ? base.sat : 0;
    const cf = base.complete_frac, cfc = cold ? cold.complete_frac : 0;
    const status = cf < 0.5 ? 'no_viable' : (cfc >= 0.9 && sat >= 0.8 ? 'viable' : 'marginal');
    out.push({ doy, month: slot.start.m, day: slot.start.d, status, complete_frac: +cf.toFixed(2), complete_frac_cold: +cfc.toFixed(2), dur_days: base.dur_days, sat: +sat.toFixed(2) });
  }
  return out;
}

/** Cobertura media de dosel durante el ciclo (FAO-56 ec. 76: fc = ((Kc−0,15)/(1,2−0,15))^(1+0,5h)); null si el cultivo no tiene altura. Kc se usa como aproximación de Kcb. */
function canopyCoverMean(crop) {
  if (!Number.isFinite(crop.height_m)) return null;
  const L = cycleLength(crop); let s = 0;
  for (let t = 0; t < L; t++) s += Math.min(0.99, Math.max(0, Math.pow(Math.max(0, (kcAt(crop, t) - 0.15) / 1.05), 1 + 0.5 * crop.height_m)));
  return s / L;
}
const coverOf = (crop) => (crop.canopy_cover != null ? Math.min(crop.cover, crop.canopy_cover) : crop.cover);

module.exports = { canopyCoverMean, coverOf, devRate, tempUncertainty, sowingWindows, buildClimate, evaluateSeason, kcAt, cycleLength, et0Day, extraterrestrial, dayOfYear, awcFromSoil, SLOTS, U2_MIN, SPINUP_DAYS };
