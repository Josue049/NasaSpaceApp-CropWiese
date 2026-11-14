'use strict';
/**
 * Acceso a datos con caché en disco, procedencia explícita y degradación controlada.
 * Cada función devuelve { ok, data, provenance } o { ok:false, error, provenance }.
 * Nunca se inventan valores: si no hay dato, se informa.
 */
const fs = require('fs');
const path = require('path');
const { fetchImergDaily, IMERG_DATATYPE } = require('./imerg');

const CACHE_DIR = process.env.FIELDSHIFT_CACHE || path.join(__dirname, '..', 'data', 'cache');
const DEMO_DIR = path.join(__dirname, '..', 'data', 'demo');
const DEMO_DIR_MORROPON = path.join(__dirname, '..', 'data', 'demo_morropon'); // instantánea real de la demo reducida (arroz Tinajones, Morropón)
const Y0 = 2015, Y1 = 2023; // ventana fija y común a todas las fuentes (datatype 26 termina el 2024-06-01; el 226 llega a 2025+, ventana ampliable)
fs.mkdirSync(CACHE_DIR, { recursive: true });

const r2 = (x) => (+x).toFixed(2);
async function httpJson(url, ms = 90000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
function readCache(name) {
  for (const dir of [CACHE_DIR, DEMO_DIR, DEMO_DIR_MORROPON]) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) { try { return { json: JSON.parse(fs.readFileSync(f, 'utf8')), file: f }; } catch { /* corrupto */ } }
  }
  return null;
}
const writeCache = (name, obj) => fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(obj));

// ---------- NASA POWER (temperatura, humedad, radiación, viento; lluvia sólo como referencia) ----------
async function getPower(lat, lon) {
  const name = `power_${r2(lat)}_${r2(lon)}.json`;
  const prov = {
    source: 'NASA POWER (MERRA-2 / SYN1DEG), API diaria v2.10', variables: 'T2M, T2M_MAX, T2M_MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR',
    period: `${Y0}-${Y1}`, resolution: 'rejilla ~0,5° × 0,625° (≈ 55 km): contexto zonal, NO la parcela', kind: 'reanálisis/estimación', url: 'https://power.larc.nasa.gov/docs/services/api/',
  };
  const cached = readCache(name);
  if (cached) return { ok: true, data: cached.json.raw, provenance: { ...prov, fetchedAt: cached.json.fetchedAt, cached: true } };
  try {
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN&community=AG&longitude=${lon}&latitude=${lat}&start=${Y0}0101&end=${Y1}1231&format=JSON`;
    const raw = await httpJson(url);
    if (!raw.properties?.parameter?.T2M) throw new Error('respuesta POWER sin parámetros');
    const rec = { fetchedAt: new Date().toISOString(), raw };
    writeCache(name, rec);
    return { ok: true, data: raw, provenance: { ...prov, fetchedAt: rec.fetchedAt, cached: false } };
  } catch (e) { return { ok: false, error: `NASA POWER no disponible: ${e.message}`, provenance: prov }; }
}

// ---------- GPM IMERG vía ClimateSERV (lluvia, producto NASA) ----------
const imergFile = (lat, lon, y, dt = IMERG_DATATYPE) => `imerg${dt}_${r2(lat)}_${r2(lon)}_${y}.json`;
function getImergCached(lat, lon) {
  const out = {}; let missing = [];
  for (let y = Y0; y <= Y1; y++) {
    const c = readCache(imergFile(lat, lon, y));
    if (c) Object.assign(out, c.json.data); else missing.push(y);
  }
  return { data: out, missing };
}
async function fetchImergYears(lat, lon, years, onProgress, concurrency = 3) {
  const queue = [...years]; let done = 0; const errors = [];
  async function worker() {
    while (queue.length) {
      const y = queue.shift();
      try {
        const data = await fetchImergDaily(lat, lon, `${y}-01-01`, `${y}-12-31`, { timeoutMs: 300000 });
        if (Object.keys(data).length < 360) throw new Error('serie incompleta');
        writeCache(imergFile(lat, lon, y), { fetchedAt: new Date().toISOString(), lat, lon, year: y, product: IMERG_LABEL[IMERG_DATATYPE] || `GPM IMERG vía ClimateSERV (datatype ${IMERG_DATATYPE})`, data });
      } catch (e) { errors.push(`${y}: ${e.message}`); }
      done++; if (onProgress) onProgress(done, years.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return errors;
}
const IMERG_LABEL = { 26: 'NASA GPM IMERG V06 Late (ClimateSERV datatype 26, serie heredada)', 226: 'NASA GPM IMERG V07 Late (ClimateSERV datatype 226)', 227: 'NASA GPM IMERG V07 Early (ClimateSERV datatype 227)' };
const IMERG_PROV = {
  source: IMERG_LABEL[IMERG_DATATYPE] || `NASA GPM IMERG Late (ClimateSERV datatype ${IMERG_DATATYPE})`, variables: 'precipitation (mm/día), promedio de un cuadro de 0,1°',
  period: `${Y0}-${Y1}`, resolution: '0,1° (≈ 11 km); pixel ≠ parcela', kind: 'estimación satelital multisensor (calibrada con pluviómetros a escala mensual)', url: 'https://gpm.nasa.gov/data/imerg',
};

// ---------- ERA5 (control independiente, no NASA) ----------
async function getEra5(lat, lon) {
  const name = `era5_${r2(lat)}_${r2(lon)}.json`;
  const prov = { source: 'ERA5 reanálisis (ECMWF) vía Open-Meteo', variables: 'precipitation_sum (mm/día)', period: `${Y0}-${Y1}`, resolution: '~0,25° (≈ 25-30 km)', kind: 'reanálisis; FUENTE NO-NASA usada sólo como control', url: 'https://open-meteo.com/en/docs/historical-weather-api' };
  const cached = readCache(name);
  if (cached) return { ok: true, data: cached.json.data, provenance: { ...prov, fetchedAt: cached.json.fetchedAt, cached: true } };
  try {
    const o = await httpJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${Y0}-01-01&end_date=${Y1}-12-31&daily=precipitation_sum&timezone=UTC`);
    const data = {};
    o.daily.time.forEach((t, i) => { if (o.daily.precipitation_sum[i] != null) data[t.replace(/-/g, '')] = o.daily.precipitation_sum[i]; });
    writeCache(name, { fetchedAt: new Date().toISOString(), data });
    return { ok: true, data, provenance: { ...prov, fetchedAt: new Date().toISOString(), cached: false } };
  } catch (e) { return { ok: false, error: `ERA5 no disponible: ${e.message}`, provenance: prov }; }
}

// ---------- Pendiente (SRTM 1 arc-sec) vía OpenTopoData ----------
async function getSlope(lat, lon) {
  const name = `slope_${(+lat).toFixed(3)}_${(+lon).toFixed(3)}.json`;
  const prov = { source: 'SRTM 1 arc-sec (NASA/USGS/NGA) vía API pública OpenTopoData (espejo de terceros)', variables: 'elevación → pendiente (Horn, 3×3, paso ≈ 90 m)', resolution: '~30 m; error vertical SRTM de varios metros → pendiente indicativa', kind: 'medición derivada', url: 'https://www.opentopodata.org/datasets/srtm/' };
  const cached = readCache(name);
  if (cached) return { ok: true, data: cached.json.data, provenance: { ...prov, fetchedAt: cached.json.fetchedAt, cached: true } };
  try {
    const d = 90; // m
    const dlat = d / 111320, dlon = d / (111320 * Math.cos((lat * Math.PI) / 180));
    const pts = [];
    for (const dy of [1, 0, -1]) for (const dx of [-1, 0, 1]) pts.push(`${(lat + dy * dlat).toFixed(6)},${(lon + dx * dlon).toFixed(6)}`);
    const res = await httpJson(`https://api.opentopodata.org/v1/srtm30m?locations=${pts.join('|')}`, 40000);
    if (res.status !== 'OK') throw new Error(res.error || 'respuesta inválida');
    const z = res.results.map((r) => r.elevation);
    if (z.some((v) => v == null)) throw new Error('celdas sin dato SRTM');
    const [a, b, c, dd, e, f, g, h, i] = z; // filas norte→sur
    const dzdx = ((c + 2 * f + i) - (a + 2 * dd + g)) / (8 * d);
    const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * d);
    const slope = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100; // %
    const data = { slope_pct: slope, elevation_m: e, window_m: 2 * d };
    writeCache(name, { fetchedAt: new Date().toISOString(), data });
    return { ok: true, data, provenance: { ...prov, fetchedAt: new Date().toISOString(), cached: false } };
  } catch (e) { return { ok: false, error: `SRTM no disponible: ${e.message}`, provenance: prov }; }
}

// ---------- Suelo (SoilGrids 2.0, modelado) ----------
async function getSoil(lat, lon) {
  const name = `soil_${(+lat).toFixed(3)}_${(+lon).toFixed(3)}.json`;
  const prov = { source: 'ISRIC SoilGrids 2.0 (REST)', variables: 'pH(H2O), carbono orgánico, arcilla, arena, 0-30 cm', resolution: '250 m; predicción modelada con incertidumbre alta en trópico, NO análisis de laboratorio', kind: 'estimación modelada', url: 'https://rest.isric.org/soilgrids/v2.0/docs' };
  const cached = readCache(name);
  if (cached) return { ok: true, data: cached.json.data, provenance: { ...prov, fetchedAt: cached.json.fetchedAt, cached: true } };
  const offsets = [[0, 0], [0.0025, 0], [-0.0025, 0], [0, 0.0025], [0, -0.0025], [0.005, 0.005], [-0.005, -0.005]];
  try {
    for (const [dy, dx] of offsets) {
      const la = lat + dy, lo = lon + dx;
      const q = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lo}&lat=${la}&property=phh2o&property=soc&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean&value=Q0.05&value=Q0.95`;
      const j = await httpJson(q, 60000);
      const out = {}; let valid = true;
      for (const layer of j.properties.layers) {
        const df = layer.unit_measure.d_factor || 1, w = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 };
        let sm = 0, sl = 0, sh = 0, sw = 0;
        for (const dep of layer.depths) {
          const v = dep.values; if (v.mean == null) { valid = false; break; }
          sm += (v.mean / df) * w[dep.label]; sl += ((v['Q0.05'] ?? v.mean) / df) * w[dep.label]; sh += ((v['Q0.95'] ?? v.mean) / df) * w[dep.label]; sw += w[dep.label];
        }
        if (!valid) break;
        out[layer.name] = { mean: sm / sw, q05: sl / sw, q95: sh / sw, unit: layer.unit_measure.target_units };
      }
      if (valid && out.phh2o) {
        const data = { ...out, queried_at: { lat: la, lon: lo }, moved_from_input: dy !== 0 || dx !== 0 };
        writeCache(name, { fetchedAt: new Date().toISOString(), data });
        return { ok: true, data, provenance: { ...prov, fetchedAt: new Date().toISOString(), cached: false } };
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error('sin datos en el punto ni en su entorno inmediato (posible zona urbana/enmascarada)');
  } catch (e) { return { ok: false, error: `SoilGrids no disponible: ${e.message}`, provenance: prov }; }
}

/** Validación de series (unidades, rangos, continuidad). Devuelve lista de hallazgos. */
function validatePower(raw) {
  const p = raw.properties.parameter, issues = [];
  const ranges = { T2M: [-5, 45], T2M_MAX: [-5, 50], T2M_MIN: [-15, 40], RH2M: [0, 100], ALLSKY_SFC_SW_DWN: [0, 40], PRECTOTCORR: [0, 400], WS2M: [0, 60] };
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    const v = Object.values(p[k] || {});
    if (!v.length) { issues.push(`${k}: ausente`); continue; }
    const miss = v.filter((x) => x === -999).length;
    if (miss) issues.push(`${k}: ${miss} valores de relleno (-999)`);
    const bad = v.filter((x) => x !== -999 && (x < lo || x > hi)).length;
    if (bad) issues.push(`${k}: ${bad} valores fuera de [${lo}, ${hi}]`);
  }
  const ws = Object.values(p.WS2M || {}).filter((x) => x !== -999);
  if (ws.length && Math.max(...ws) < 1) issues.push(`WS2M máx ${Math.max(...ws).toFixed(2)} m/s: muy bajo (rugosidad/escala de la rejilla); se aplica piso FAO-56 de 0,5 m/s en ET0 (efecto ≈+2 % con u2=0,8; ver AUDITORIA.md)`);
  return issues;
}

module.exports = { getPower, getImergCached, fetchImergYears, getEra5, getSlope, getSoil, validatePower, IMERG_PROV, Y0, Y1, CACHE_DIR };
