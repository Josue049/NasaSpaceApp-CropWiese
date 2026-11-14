'use strict';
/**
 * Verificación del terreno con imágenes SENTINEL-2 L2A (10 m) vía Microsoft Planetary Computer (STAC + API de punto, acceso abierto).
 * Para un punto devuelve la serie de NDVI por escena, descartando pixeles con nubes/sombras (clase SCL).
 * Alcance: indica si el pixel muestra un PATRÓN ESTACIONAL de vegetación compatible con un cultivo anual. NO identifica la especie
 * (no distingue arroz de otro cultivo), no mide rendimiento ni estado hídrico, y un pixel de 10 m puede no representar la parcela.
 * Los umbrales de clasificación son decisiones de DISEÑO, no resultados validados.
 */
const fs = require('fs');
const path = require('path');

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const POINT = 'https://planetarycomputer.microsoft.com/api/data/v1/item/point';
const CACHE_DIR = process.env.FIELDSHIFT_CACHE || path.join(__dirname, '..', 'data', 'cache');
const DEMO_DIR = path.join(__dirname, '..', 'data', 'demo_morropon');
const DEFAULT_RANGE = { start: '2025-11-01', end: '2026-07-15' };
const VALID_SCL = new Set([4, 5, 6]); // 4 vegetación, 5 suelo desnudo, 6 agua (arrozal inundado). Se excluyen nubes, sombras, cirros, saturado, sin dato.
const PROV = {
  source: 'Sentinel-2 L2A (ESA/Copernicus) vía Microsoft Planetary Computer', url: 'https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a',
  variables: 'B04 (rojo), B08 (infrarrojo cercano), SCL (clasificación de escena)', resolution: '10 m (pixel del punto)', kind: 'imagen satelital (reflectancia de superficie)',
  note: 'NDVI = (NIR − Rojo)/(NIR + Rojo) con reflectancia corregida del offset de la línea base ≥ 04.00 ((DN − 1000)/10000).',
};
const r4 = (x) => (+x).toFixed(4);
async function http(url, opts = {}, ms = 45000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(t); }
}
const cacheName = (lat, lon, s, e) => `s2ndvi_${r4(lat)}_${r4(lon)}_${s}_${e}.json`;
function readCache(name) { for (const d of [CACHE_DIR, DEMO_DIR]) { const f = path.join(d, name); if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* corrupto */ } } } return null; }

async function searchScenes(lat, lon, start, end, maxCloud) {
  const body = { collections: ['sentinel-2-l2a'], intersects: { type: 'Point', coordinates: [lon, lat] }, datetime: `${start}/${end}`, query: { 'eo:cloud_cover': { lt: maxCloud } }, limit: 100, sortby: [{ field: 'datetime', direction: 'asc' }] };
  const j = await http(STAC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (j.features || []).map((f) => ({ id: f.id, date: f.properties.datetime.slice(0, 10), scene_cloud_pct: +(+f.properties['eo:cloud_cover']).toFixed(0), baseline: f.properties['s2:processing_baseline'] || '' }));
}
const baselineMajor = (b) => { const n = parseFloat(String(b)); return Number.isFinite(n) ? n : 0; };

async function pointValues(lat, lon, scene) {
  const url = `${POINT}/${lon},${lat}?collection=sentinel-2-l2a&item=${encodeURIComponent(scene.id)}&assets=B04&assets=B08&assets=SCL`;
  const j = await http(url);
  const [red, nir, scl] = j.values;
  const off = baselineMajor(scene.baseline) >= 4 ? 1000 : 0;
  const R = (red - off) / 10000, N = (nir - off) / 10000;
  const valid = VALID_SCL.has(scl) && red > 0 && nir > 0;
  const ndvi = R + N > 0 ? (N - R) / (N + R) : null;
  return { date: scene.date, scl, scene_cloud_pct: scene.scene_cloud_pct, ndvi: ndvi == null ? null : +ndvi.toFixed(3), valid: valid && ndvi != null };
}

/** Serie NDVI del punto. Cachea en disco. Concurrencia limitada para no saturar el servicio. */
async function fetchSeries(lat, lon, { start = DEFAULT_RANGE.start, end = DEFAULT_RANGE.end, maxCloud = 70, concurrency = 6 } = {}) {
  const name = cacheName(lat, lon, start, end), cached = readCache(name);
  if (cached) return { ...cached, cached: true };
  const scenes = await searchScenes(lat, lon, start, end, maxCloud);
  const out = new Array(scenes.length); let next = 0, errors = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, scenes.length) }, async () => {
    while (next < scenes.length) { const i = next++; try { out[i] = await pointValues(lat, lon, scenes[i]); } catch { errors++; out[i] = null; } }
  }));
  const series = out.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const rec = { fetchedAt: new Date().toISOString(), lat, lon, start, end, max_scene_cloud_pct: maxCloud, scenes_found: scenes.length, scene_errors: errors, provenance: PROV, series };
  if (series.length && errors <= scenes.length * 0.2) fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(rec));
  return { ...rec, cached: false };
}

const pctl = (a, p) => { const q = [...a].sort((x, y) => x - y); return q.length ? q[Math.min(q.length - 1, Math.max(0, Math.round(p * (q.length - 1))))] : null; };
/**
 * Clasifica el patrón de NDVI (umbrales de DISEÑO): insuficiente · suelo_agua_o_urbano · estacional · vegetacion_permanente · ambiguo.
 * Usa solo observaciones válidas con NDVI de vegetación/suelo (excluye agua: NDVI negativo no describe el cultivo).
 */
function classify(series) {
  const veg = series.filter((s) => s.valid && s.scl !== 6 && s.ndvi != null);
  const water = series.filter((s) => s.valid && s.scl === 6).length;
  if (veg.length < 6) return { pattern: 'insuficiente', n_valid: veg.length, n_water: water, message: 'Pocas observaciones sin nubes (menos de 6): no se puede evaluar el patrón estacional.' };
  const v = veg.map((s) => s.ndvi), p10 = pctl(v, 0.1), p90 = pctl(v, 0.9), amp = p90 - p10;
  const peak = veg.reduce((m, s) => (s.ndvi > m.ndvi ? s : m), veg[0]);
  let pattern, message;
  if (p90 < 0.25) { pattern = 'suelo_agua_o_urbano'; message = 'NDVI siempre bajo: suelo desnudo, agua o superficie construida; no se observa vegetación activa.'; }
  else if (amp >= 0.30) { pattern = 'estacional'; message = 'NDVI con subida y bajada marcadas: patrón compatible con un cultivo anual (o pasto/maleza estacional). No identifica la especie.'; }
  else if (p10 >= 0.55 && amp < 0.20) { pattern = 'vegetacion_permanente'; message = 'NDVI alto y estable: cobertura permanente (monte, frutal, caña…); no parece un cultivo anual en este periodo.'; }
  else { pattern = 'ambiguo'; message = 'Variación intermedia: no se puede decidir si es cultivo anual, pastura o vegetación mixta con esta serie.'; }
  return { pattern, message, n_valid: veg.length, n_water: water, ndvi_p10: +p10.toFixed(2), ndvi_p90: +p90.toFixed(2), amplitude: +amp.toFixed(2), peak_date: peak.date, peak_ndvi: peak.ndvi };
}

const addDays = (iso, d) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
/**
 * Contraste INFORMATIVO con la fenología modelada de la campaña SENAMHI (siembra 21-ene-2026): el pico de NDVI de un arrozal
 * debería caer cerca de panoja–floración (79–93 días tras la siembra). No es validación (una parcela, un pixel, una temporada).
 */
function phenologyContrast(cls, profile) {
  if (!cls.peak_date) return null;
  const sow = profile.observed_campaign.sowing_date, d = profile.phenology_das;
  const lo = addDays(sow, d.panicle), hi = addDays(sow, d.flowering);
  const t = Date.parse(cls.peak_date), within = t >= Date.parse(lo) && t <= Date.parse(hi);
  const off = within ? 0 : Math.round(Math.min(Math.abs(t - Date.parse(lo)), Math.abs(t - Date.parse(hi))) / 86400000);
  return { sowing_date: sow, expected_peak_window: [lo, hi], observed_peak_date: cls.peak_date, within_window: within, days_outside_window: off,
    note: 'Solo tiene sentido si esa parcela fue sembrada hacia el 21‑ene‑2026 (campaña SENAMHI). Con otra fecha de siembra el pico cae en otro momento.' };
}

async function checkParcel(lat, lon, profile, opts) {
  const rec = await fetchSeries(lat, lon, opts);
  const cls = classify(rec.series);
  return { lat, lon, range: [rec.start, rec.end], cached: rec.cached, scenes_found: rec.scenes_found, scene_errors: rec.scene_errors, provenance: rec.provenance, series: rec.series, classification: cls, phenology_contrast: profile ? phenologyContrast(cls, profile) : null,
    limitations: [
      'Es un solo pixel de 10 m: puede caer en un camino, un canal o un borde y no representar la parcela.',
      'Detecta un patrón de vegetación, no la especie: no distingue arroz de otro cultivo anual.',
      'En arrozales inundados el NDVI es bajo hasta que el cultivo cubre el agua; las escenas con agua se cuentan aparte.',
      'Con nubes frecuentes quedan pocas observaciones; con menos de 6 válidas no se emite veredicto.',
      'Los umbrales de clasificación son de diseño y no están validados con verdad de campo.',
    ] };
}

module.exports = { fetchSeries, classify, phenologyContrast, checkParcel, PROV, VALID_SCL };
