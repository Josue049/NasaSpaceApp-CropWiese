'use strict';
/**
 * Clima RECIENTE (solo informativo; no entra al puntaje agrícola).
 *
 * Fuente principal: NASA POWER diario (T2M, PRECTOTCORR). Contraste: ERA5 (Open-Meteo, modelo fijado).
 * Reglas:
 *  - Ventana = los últimos 7 días con dato válido COMÚN de temperatura y lluvia (no los últimos 7 días del calendario).
 *  - Se informa la fecha exacta del último registro válido y su retraso respecto de hoy.
 *  - Estados: ok | parcial (<7 días válidos) | desactualizado (último dato >10 días atrás) | sin_conexion (se muestra el último dato en
 *    caché, marcado como no actual) | no_disponible (sin datos ni caché).
 *  - Si POWER y ERA5 discrepan, se muestran AMBOS valores con su procedencia; nunca se oculta la discrepancia.
 *  - Nunca se presenta climatología histórica como clima registrado recientemente.
 */
const fs = require('fs');
const path = require('path');

const CACHE_DIR = process.env.FIELDSHIFT_CACHE || path.join(__dirname, '..', 'data', 'cache');
const TTL_MS = 6 * 3600 * 1000;
const WINDOW = 7;
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const iso = (k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const r1 = (x) => Math.round(x * 10) / 10;

async function getJson(url, ms = 20000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}

/** Calcula la ventana a partir de series diarias {YYYYMMDD: valor|null} de temperatura media y lluvia. Función pura (probada). */
function windowFrom(t2m, pr, n = WINDOW, fill = -999) {
  const ok = (v) => v != null && v !== fill && Number.isFinite(v);
  const common = Object.keys(t2m).filter((k) => ok(t2m[k]) && ok(pr[k])).sort();
  const last = common.slice(-n);
  if (!last.length) return null;
  return { from: iso(last[0]), to: iso(last[last.length - 1]), n: last.length, tmean_c: r1(last.reduce((a, k) => a + t2m[k], 0) / last.length), rain_mm: r1(last.reduce((a, k) => a + pr[k], 0)) };
}

function statusOf(win, todayISO) {
  if (!win) return 'no_disponible';
  const lag = Math.round((Date.parse(todayISO) - Date.parse(win.to)) / 864e5);
  if (lag > 10) return 'desactualizado';
  return win.n < WINDOW ? 'parcial' : 'ok';
}

const cacheFile = (lat, lon) => path.join(CACHE_DIR, `recent_${(+lat).toFixed(2)}_${(+lon).toFixed(2)}.json`);

/**
 * @param {number} lat @param {number} lon  celda de consulta (centro de la estación de referencia o del punto)
 * @param {{now?:Date, fetchJson?:Function, force?:boolean}} opts  (inyectables para pruebas)
 */
async function getRecent(lat, lon, opts = {}) {
  const now = opts.now || new Date(), today = now.toISOString().slice(0, 10), get = opts.fetchJson || getJson, file = cacheFile(lat, lon);
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* sin caché */ }
  if (cached && !opts.force && now - Date.parse(cached.retrieved_at) < TTL_MS) return { ...cached, from_cache: true };
  try {
    const start = new Date(now.getTime() - 25 * 864e5);
    const pw = await get(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=${ymd(start)}&end=${ymd(now)}&format=JSON`);
    const p = pw.properties.parameter;
    const win = windowFrom(p.T2M, p.PRECTOTCORR);
    const out = {
      status: statusOf(win, today), retrieved_at: now.toISOString(), today, query: { lat, lon },
      window: win, last_valid_date: win ? win.to : null, lag_days: win ? Math.round((Date.parse(today) - Date.parse(win.to)) / 864e5) : null,
      source: { name: 'NASA POWER (MERRA-2 / FLASHFlux, casi tiempo real)', url: 'https://power.larc.nasa.gov/docs/services/api/', resolution: '0,5° × 0,625°', note: 'Producto de casi tiempo real: puede diferir del que se usa en la climatología histórica y se revisa después.' },
      comparison: null,
      note: 'Informativo: no modifica el puntaje agrícola.',
    };
    if (win) {
      try {
        const e = await get(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${win.from}&end_date=${win.to}&daily=precipitation_sum,temperature_2m_mean&timezone=UTC&models=era5`);
        const rain = e.daily.precipitation_sum.filter((x) => x != null), t = e.daily.temperature_2m_mean.filter((x) => x != null);
        if (rain.length === win.n || rain.length >= win.n - 1) {
          const era = { name: 'ERA5 (Open-Meteo)', from: win.from, to: win.to, n: rain.length, tmean_c: r1(t.reduce((a, b) => a + b, 0) / t.length), rain_mm: r1(rain.reduce((a, b) => a + b, 0)) };
          out.comparison = { era5: era, rain_ratio_power_over_era5: era.rain_mm > 0 ? r1(win.rain_mm / era.rain_mm) : null, tmean_diff_c: r1(win.tmean_c - era.tmean_c), differs: Math.abs(win.tmean_c - era.tmean_c) >= 1.5 || (Math.max(win.rain_mm, era.rain_mm) >= 10 && Math.max(win.rain_mm, era.rain_mm) / Math.max(0.1, Math.min(win.rain_mm, era.rain_mm)) >= 2),
            note: 'Los productos de reanálisis/estimación difieren; no hay estación en tiempo real para decidir cuál es correcto. Se muestran ambos.' };
        }
      } catch { /* el contraste es opcional */ }
    }
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); } catch { /* caché opcional */ }
    return out;
  } catch (e) {
    if (cached) return { ...cached, status: 'sin_conexion', stale: true, error: e.message, note: 'Sin conexión: se muestra el último dato obtenido, que NO es actual.' };
    return { status: 'no_disponible', retrieved_at: now.toISOString(), today, window: null, last_valid_date: null, error: e.message, comparison: null, source: { name: 'NASA POWER' }, note: 'No se pudo consultar el clima reciente y no hay datos guardados. No se muestra la climatología como si fuera reciente.' };
  }
}

module.exports = { getRecent, windowFrom, statusOf, WINDOW };
