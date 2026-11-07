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
  const p = raw.properties.parameter;
  const [lon, lat, zCell] = raw.geometry.coordinates;
  // SUPUESTO: gradiente térmico estándar −6,5 °C/km entre la celda POWER y la parcela (SRTM). Humedad relativa sin corregir.
  const dz = Number.isFinite(opts.elevation) ? Math.max(-1500, Math.min(1500, opts.elevation - zCell)) : 0;
  const lapse = dz === 0 ? 0 : -0.0065 * dz, zElev = zCell + dz;
  const days = [], byKey = new Map();
  for (const k of Object.keys(p.PRECTOTCORR).sort()) {
    if (opts.yearRange && (+k.slice(0, 4) < opts.yearRange[0] || +k.slice(0, 4) > opts.yearRange[1])) continue;
    const rainVal = opts.rain ? opts.rain[k] : p.PRECTOTCORR[k];
    const v = { P: rainVal === undefined ? -999 : rainVal, T: p.T2M[k], Tx: p.T2M_MAX[k], Tn: p.T2M_MIN[k], RH: p.RH2M[k], WS: p.WS2M[k], RS: p.ALLSKY_SFC_SW_DWN[k] };
    if (Object.values(v).some((x) => x === -999 || x == null || Number.isNaN(x))) continue; // día con dato faltante: se omite
    const y = +k.slice(0, 4), m = +k.slice(4, 6), d = +k.slice(6, 8);
    const T = v.T + lapse + sc.temp_delta, Tx = v.Tx + lapse + sc.temp_delta, Tn = v.Tn + lapse + sc.temp_delta;
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
  return { lat, lon, elevation_m: zElev, cell_elevation_m: zCell, lapse_c: lapse, years, days, byKey, monthly, scenario: sc, annual: { precip_mm: mean(annualP), et0_mm: mean(annualEt0), precip_by_year: annualP, n_years: annualP.length } };
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
 * Siembra al inicio de la campaña `slot` en cada año disponible y simula el balance hídrico diario.
 * Índices: ETa/ETc (1 = sin estrés). Riesgo = fracción de años con ETa/ETc ponderado < 0,8.
 */
function evaluateSeason(clim, crop, slot, irrigated, awc = 110) {
  const L = cycleLength(crop), { ini, dev, mid } = crop.cycle;
  const TAW = awc * crop.root_m, RAW = crop.p_depletion * TAW;
  const perYear = [];
  for (const y of clim.years) {
    const start = Date.UTC(y, slot.start.m - 1, slot.start.d);
    let Dr = 0, ok = true;
    // arranque: barbecho con Kc 0,4 durante SPINUP_DAYS
    for (let t = -SPINUP_DAYS; t < 0; t++) {
      const day = clim.byKey.get(ymd(start + t * 86400000));
      if (!day) { Dr = RAW * 0.5; continue; } // sin datos previos (primer año): condición media y se sigue
      const ks = Dr > RAW ? Math.max(0, (TAW - Dr) / ((1 - crop.p_depletion) * TAW)) : 1;
      Dr = Math.min(TAW, Math.max(0, Dr - day.P + ks * 0.4 * day.et0));
    }
    let etc = 0, eta = 0, etcMid = 0, etaMid = 0, heat = 0, midDays = 0, heavyEarly = 0, tsum = 0, rain = 0;
    for (let t = 0; t < L; t++) {
      const day = clim.byKey.get(ymd(start + t * 86400000));
      if (!day) { ok = false; break; }
      const kc = kcAt(crop, t), etcD = kc * day.et0;
      const ks = Dr > RAW ? Math.max(0, (TAW - Dr) / ((1 - crop.p_depletion) * TAW)) : 1;
      const etaD = ks * etcD;
      Dr = Math.min(TAW, Math.max(0, Dr - day.P + etaD)); // exceso sobre capacidad de campo = percolación/escorrentía
      etc += etcD; eta += etaD; tsum += day.T; rain += day.P;
      if (t >= ini + dev && t < ini + dev + mid) { etcMid += etcD; etaMid += etaD; midDays++; if (day.Tx > crop.t_stress_max) heat++; }
      if (t < ini + dev && day.P >= 20) heavyEarly += day.P;
    }
    if (!ok) continue;
    const satTotal = etc > 0 ? eta / etc : 1, satMid = etcMid > 0 ? etaMid / etcMid : 1;
    perYear.push({ year: y, etc, eta, rain, sat_total: satTotal, sat_mid: satMid, sat: 0.4 * satTotal + 0.6 * satMid, /* ponderación PROVISIONAL (FAO-33: etapa media más sensible) */
      heat_frac: midDays ? heat / midDays : 0, heavy_early_mm: heavyEarly, tmean: tsum / L });
  }
  if (!perYear.length) return null;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const droughtFrac = perYear.filter((r) => r.sat < 0.8).length / perYear.length;
  return {
    n_years: perYear.length, cycle_days: L, window_days: slot.window_days,
    etc_mm: med(perYear.map((r) => r.etc)), rain_mm: med(perYear.map((r) => r.rain)),
    deficit_mm: med(perYear.map((r) => r.etc - r.eta)),
    sat: med(perYear.map((r) => r.sat)), sat_total: med(perYear.map((r) => r.sat_total)), sat_mid: med(perYear.map((r) => r.sat_mid)),
    drought_frac: irrigated ? droughtFrac * 0.3 : droughtFrac, // SUPUESTO: riego disponible reduce (no elimina) el riesgo
    drought_frac_rainfed: droughtFrac,
    heat_frac: mean(perYear.map((r) => r.heat_frac)), heavy_early_mm: mean(perYear.map((r) => r.heavy_early_mm)), tmean: mean(perYear.map((r) => r.tmean)),
    taw_mm: TAW,
  };
}

module.exports = { buildClimate, evaluateSeason, kcAt, cycleLength, et0Day, extraterrestrial, dayOfYear, awcFromSoil, SLOTS, U2_MIN, SPINUP_DAYS };
