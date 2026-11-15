'use strict';
/** Servidor HTTP sin dependencias externas. API JSON + archivos estáticos de /public. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ds = require('./src/datasources');
const { gatherData, analyze, outOfScope, SCENARIOS, CROPS } = require('./src/pipeline');
const rice = require('./src/rice');
// Demo reducida: solo arroz Tinajones en Morropón. La API genérica de rotaciones queda apagada salvo FIELDSHIFT_LEGACY=1 (pruebas/desarrollo).
const LEGACY = process.env.FIELDSHIFT_LEGACY === '1';

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DB_FILE = process.env.FIELDSHIFT_DB || path.join(__dirname, 'data', 'parcels.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// ---------- persistencia simple (JSON) ----------
function loadDb() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return { parcels: [] }; } }
function saveDb(db) { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// ---------- trabajos de descarga IMERG ----------
const jobs = new Map(); // key -> {state, done, total, errors}
const jobKey = (lat, lon) => `${(+lat).toFixed(2)}_${(+lon).toFixed(2)}`;
function ensureImerg(lat, lon, missing) {
  const key = jobKey(lat, lon);
  const cur = jobs.get(key);
  if (!missing.length) return { state: 'ready', done: 1, total: 1 };
  if (cur && cur.state === 'downloading') return cur;
  if (cur && cur.state === 'failed' && Date.now() - cur.at < 10 * 60000) return cur; // no reintentar de inmediato
  const job = { state: 'downloading', done: 0, total: missing.length, errors: [], at: Date.now() };
  jobs.set(key, job);
  ds.fetchImergYears(+lat, +lon, missing, (d) => { job.done = d; }).then((errs) => {
    job.errors = errs; job.state = errs.length ? 'failed' : 'ready'; job.at = Date.now();
  }).catch((e) => { job.state = 'failed'; job.errors = [e.message]; job.at = Date.now(); });
  return job;
}

// ---------- entradas opcionales del agricultor (motor v2) ----------
const num = (x, lo, hi) => { if (x === '' || x == null) return null; const v = Number(x); return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
/** Economía declarada por cultivo. Solo se aceptan números razonables; lo demás se ignora (nunca se inventa). */
function sanitizeEconomics(e, ids) {
  if (!e || typeof e !== 'object') return null;
  const out = {};
  for (const id of ids) {
    const d = e[id]; if (!d || typeof d !== 'object') continue;
    const o = { yield_t_ha: num(d.yield_t_ha, 0, 60), price_s_per_kg: num(d.price_s_per_kg, 0, 100), cost_establishment_s_ha: num(d.cost_establishment_s_ha, 0, 200000), cost_irrigation_s_ha: num(d.cost_irrigation_s_ha, 0, 100000), cost_other_s_ha: num(d.cost_other_s_ha, 0, 200000) };
    if (Object.values(o).some((x) => x != null)) out[id] = Object.fromEntries(Object.entries(o).filter(([, x]) => x != null));
  }
  return Object.keys(out).length ? out : null;
}
/** Cultivo principal que el agricultor quiere conservar: { crop, campaigns?: ['A'|'B'], min_campaigns?: 1..4 }. */
function sanitizeKeepMain(k, ids) {
  if (!k || typeof k !== 'object' || !ids.includes(k.crop)) return null;
  const o = { crop: k.crop };
  if (Array.isArray(k.campaigns)) { const c = [...new Set(k.campaigns.filter((x) => x === 'A' || x === 'B'))]; if (c.length) o.campaigns = c; }
  const m = Number(k.min_campaigns); if (Number.isInteger(m) && m >= 1 && m <= 4) o.min_campaigns = m;
  return o.campaigns || o.min_campaigns ? o : null;
}

/** Riego: true | false | null (NO declarado). Nunca se asume que hay riego. */
function irrigation3(x) { if (x === true || x === 'si' || x === 'sí') return true; if (x === false || x === 'no') return false; return null; }
/** Entradas declaradas de la parcela. Lo vacío o inválido queda como «no declarado» (null/ausente), jamás como cero. */
function sanitizeDeclared(b) {
  const out = {};
  const d = typeof b.first_sowing_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.first_sowing_date) ? b.first_sowing_date : null;
  if (d) { const t = Date.parse(d), now = Date.now(); if (Number.isFinite(t) && t > now - 400 * 864e5 && t < now + 1100 * 864e5) out.first_sowing_date = d; }
  if (b.cycle_days && typeof b.cycle_days === 'object') { const c = {}; for (const id of ['arroz', 'loctao']) { const v = num(b.cycle_days[id], 40, 200); if (v != null) c[id] = Math.round(v); } if (Object.keys(c).length) out.cycle_days = c; }
  if (b.soil && typeof b.soil === 'object') { const s = {}; const ph = num(b.soil.ph, 3.5, 9.5); if (ph != null) s.ph = ph; if (['arenosa', 'franca', 'arcillosa'].includes(b.soil.texture)) s.texture = b.soil.texture; if (Object.keys(s).length) out.soil = s; }
  return out;
}

// ---------- validación de entrada ----------
function validateInput(b) {
  const errs = [];
  const lat = Number(b.lat), lon = Number(b.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errs.push('latitud inválida');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) errs.push('longitud inválida');
  if (Math.abs(lat) > 55) errs.push('el motor está calibrado para latitudes tropicales/subtropicales (|lat| ≤ 55°)');
  const ids = new Set(CROPS.crops.map((c) => c.id));
  if (!Array.isArray(b.history) || !b.history.length || b.history.some((h) => !ids.has(h))) errs.push('historial de cultivos vacío o con cultivos no soportados');
  if (b.excluded_crops && b.excluded_crops.some((h) => !ids.has(h))) errs.push('exclusiones con cultivos no soportados');
  if (errs.length) return { errs };
  const pr = {}; for (const k of ['protect_soil', 'water', 'resilience', 'pests', 'income', 'low_cost']) { const v = Number(b.priorities?.[k] ?? 3); pr[k] = Math.max(0, Math.min(5, Number.isFinite(v) ? v : 3)); }
  return {
    input: {
      lat, lon, area_ha: Math.max(0, Number(b.area_ha) || 0), irrigation: !!b.irrigation, start_slot: b.start_slot === 'B' ? 'B' : 'A',
      history: b.history.slice(-4), priorities: pr, excluded_crops: b.excluded_crops || [], market_pref: b.market_pref || {},
      ...(b.weighting_model === 'grouped_v1' ? { weighting_model: 'grouped_v1', group_priorities: b.group_priorities || undefined } : {}), // modo EXPERIMENTAL opt-in (revisión externa de pesos)
    },
    scenario: SCENARIOS[b.scenario] || SCENARIOS.base,
  };
}

function defaultStartSlot(now = new Date()) {
  const m = now.getUTCMonth() + 1; // A: nov-abr (siembra desde 1-nov); B: 15-abr a oct
  return m >= 11 || m <= 3 ? 'A' : (m === 4 && now.getUTCDate() < 15 ? 'A' : 'B');
}

// ---------- utilidades HTTP ----------
function send(res, code, obj) { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) { reject(new Error('cuerpo demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('JSON inválido')); } });
  });
}

function validateRiceInput(b) {
  const errs = [], lat = Number(b.lat), lon = Number(b.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errs.push('latitud inválida');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) errs.push('longitud inválida');
  let sowing = null;
  if (b.sowing_date != null && b.sowing_date !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.sowing_date)) || Number.isNaN(Date.parse(b.sowing_date))) errs.push('fecha de siembra inválida (use AAAA-MM-DD)'); else sowing = String(b.sowing_date);
  }
  const iv = b.mode === 'precisa' ? require('./src/insitu').validateInsitu(b.insitu) : { insitu: null, errors: [] };
  errs.push(...iv.errors);
  if (errs.length) return { errs };
  return { input: { lat, lon, area_ha: Math.max(0, Math.min(1000, Number(b.area_ha) || 0)), sowing_date: sowing, mode: b.mode === 'precisa' ? 'precisa' : 'instantanea', insitu: iv.insitu } };
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/rice/meta') return send(res, 200, { scope: rice.DOMAIN, profile: rice.PROFILE, weights: rice.WEIGHTS, limitations: rice.LIMITATIONS, slots: require('./src/morropon').SLOTS });
  if (req.method === 'GET' && p === '/api/validation') { // resumen de la retroprueba (npm run backtest); solo lectura
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'validation', 'results.json'), 'utf8'));
      const oos = v.phenology.oos.map((r) => r.err).filter((x) => x != null);
      return send(res, 200, { generated_at: v.generated_at, temperature: v.temperature, phenology_oos: v.phenology.oos, phenology_oos_mae_days: oos.length ? oos.reduce((a, x) => a + Math.abs(x), 0) / oos.length : null, ndvi: v.ndvi && { pattern: v.ndvi.cls.pattern, peak_date: v.ndvi.cls.peak_date, peak_off_days: v.ndvi.peak_off_days }, annual_rain: v.annual_rain, ranking: v.ranking });
    } catch { return send(res, 404, { error: 'Aún no hay resultados de validación (ejecute npm run backtest).' }); }
  }
  if (req.method === 'POST' && p === '/api/satellite/check') {
    const b = await readBody(req), lat = +(+b.lat).toFixed(4), lon = +(+b.lon).toFixed(4);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return send(res, 400, { error: 'Entrada inválida', details: ['latitud y longitud requeridas'] });
    if (!rice.inBox(lat, lon)) return send(res, 400, { error: 'Fuera del alcance de la demo (Morropón, Alto Piura)' });
    try { return send(res, 200, await require('./src/satellite').checkParcel(lat, lon, rice.PROFILE)); }
    catch (e) { return send(res, 502, { error: 'No se pudo consultar Sentinel-2: ' + e.message }); }
  }
  if (req.method === 'POST' && p === '/api/rotation/analyze') {
    const b = await readBody(req);
    const { ROTATION_CROPS, LEGACY_ROTATION_CROPS } = require('./src/morropon');
    const allowed = b.engine === 'v1' ? LEGACY_ROTATION_CROPS : ROTATION_CROPS;
    if (!Array.isArray(b.history) || !b.history.length || b.history.some((h) => !allowed.includes(h))) return send(res, 400, { error: 'Entrada inválida', details: ['el historial solo admite: ' + allowed.join(', ')] });
    const irr3 = irrigation3(b.irrigation);
    const v = validateInput({ ...b, irrigation: irr3 === true, excluded_crops: [] });
    if (v.errs) return send(res, 400, { error: 'Entrada inválida', details: v.errs });
    // Modo Precisa: el ciclo del arroz se recalibra con las fechas del agricultor (misma lógica que /api/rice/analyze).
    const iv = b.mode === 'precisa' ? require('./src/insitu').validateInsitu(b.insitu) : { insitu: null, errors: [] };
    if (iv.errors.length) return send(res, 400, { error: 'Entrada inválida', details: iv.errors });
    const cal = require('./src/insitu').calibratedProfile(rice.PROFILE, iv.insitu);
    if (cal.profile.calibrated) v.input.rice_cycle = cal.profile.cycle;
    // Entradas del motor v2 (todas opcionales y declaradas por el agricultor; no se verifican)
    v.input.engine = b.engine === 'v1' ? 'v1' : 'v2';
    v.input.irrigation = irr3 === null && v.input.engine === 'v1' ? true : irr3; // v1 (referencia histórica) conservaba el supuesto de riego; v2 no lo asume
    if (v.input.engine === 'v2' && b.mode === 'precisa') Object.assign(v.input, sanitizeDeclared(b));
    const ec = sanitizeEconomics(b.economics, allowed); if (ec) v.input.economics = ec;
    const km = sanitizeKeepMain(b.keep_main, allowed); if (km) v.input.keep_main = km;
    const irr = iv.insitu && iv.insitu.irrigation;
    if (irr) { v.input.water = { supply_m3_ha: irr.supply_m3_ha ?? null, percolation_mm_day: irr.percolation_mm_day ?? null, management: irr.management || null }; if (irr.management === 'secano') v.input.irrigation = false; else if (irr.supply_m3_ha > 0 && v.input.irrigation === null) v.input.irrigation = true; }
    // La ubicación elegida por el usuario es la que alimenta el motor (clima por celda nativa; elevación, pendiente y suelo del punto).
    if (!rice.inBox(v.input.lat, v.input.lon)) { // fuera del ámbito: se explica sin consultar datos de otro lugar
      const r0 = outOfScope(v.input); r0.input = v.input; r0.mode = 'instantanea'; r0.imerg_job = { state: 'ready', done: 0, total: 0, errors: [] };
      return send(res, 200, r0);
    }
    const g = await gatherData(v.input.lat, v.input.lon);
    const job = ensureImerg(g.imergQuery.lat, g.imergQuery.lon, g.imergMissing);
    let result;
    try { result = analyze(v.input, g, v.scenario); } catch (e) { return send(res, 422, { error: e.message }); }
    result.imerg_job = { state: job.state, done: job.done, total: job.total, errors: job.errors };
    result.input = v.input;
    result.mode = v.input.rice_cycle || (result.inputs_used && result.inputs_used.length) ? 'precisa' : 'instantanea';
    result.insitu = { applied: cal.applied, ignored: cal.ignored, calibrated_rice_cycle: cal.profile.calibrated ? cal.profile.cycle : null,
      notes: result.mode === 'precisa' ? ['Datos in situ declarados por el agricultor: no verificados. En la rotación solo se usa el ciclo recalibrado del arroz; la dotación de riego no entra (el motor genérico no la incorpora).'] : [] };
    if (!result.unsupported) {
      const { evaluateRiceCriteria } = require('./src/rice_criteria_proposal');
      const fam = Object.fromEntries(CROPS.crops.map((c) => [c.id, c.family]));
      const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      for (const st of result.strategies) {
        st.criteria_c1_c2_c7 = evaluateRiceCriteria({
          sequence: st.sequence, prior_crop_id: v.input.history[v.input.history.length - 1], family_by_id: fam,
          complete_fraction: avg(st.timeline.map((t) => t.thermal.complete_frac)), complete_fraction_cold: avg(st.timeline.map((t) => t.thermal.complete_frac_cold)),
          flowering_heat_fraction: null, // el motor genérico mide calor en la etapa media, NO en floración: no son equivalentes
          etc_mm: avg(st.timeline.map((t) => t.etc_mm)),
        }, { provenance: 'motor genérico de rotaciones (src/engine.js)' });
      }
    }
    return send(res, 200, result);
  }
  if (req.method === 'POST' && p === '/api/rice/analyze') {
    const v = validateRiceInput(await readBody(req));
    if (v.errs) return send(res, 400, { error: 'Entrada inválida', details: v.errs });
    if (!rice.inBox(v.input.lat, v.input.lon)) { const r0 = outOfScope(v.input); r0.imerg_job = { state: 'ready', done: 0, total: 0, errors: [] }; return send(res, 200, r0); }
    const g = await gatherData(v.input.lat, v.input.lon); // datos del punto elegido, no del centro del dominio
    const job = ensureImerg(g.imergQuery.lat, g.imergQuery.lon, g.imergMissing);
    let result;
    try { result = rice.analyzeRice(v.input, g); } catch (e) { return send(res, 422, { error: e.message }); }
    result.imerg_job = { state: job.state, done: job.done, total: job.total, errors: job.errors };
    return send(res, 200, result);
  }
  if (!LEGACY && (p === '/api/meta' || p === '/api/analyze' || p.startsWith('/api/parcels'))) return send(res, 410, { error: 'Fuera del alcance de esta demo: solo arroz Tinajones en Morropón (Alto Piura). Use /api/rice/analyze.' });
  if (req.method === 'GET' && p === '/api/climate/recent') { // clima reciente informativo (NASA POWER diario); no alimenta el motor
    const { getRecent } = require('./src/recent'), { cellOf } = require('./src/location'), station = require('./src/morropon').PROFILE.station;
    let lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !rice.inBox(lat, lon)) { lat = station.lat; lon = station.lon; }
    const same = cellOf('power', lat, lon).key === cellOf('power', station.lat, station.lon).key, q = same ? station : cellOf('power', lat, lon);
    return send(res, 200, await getRecent(q.lat, q.lon));
  }
  if (req.method === 'GET' && p === '/api/validation/senamhi') { // resumen de la validación frente a la estación SENAMHI Morropón
    try {
      const cal = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'validation', 'calibration_senamhi.json'), 'utf8')), v = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'validation', 'senamhi_sources.json'), 'utf8'));
      const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'senamhi', 'morropon_resumen.json'), 'utf8'));
      const P = v.precipitacion;
      return send(res, 200, {
        estacion: { nombre: 'SENAMHI Morropón', periodo_serie: `${meta.periodo.first} → ${meta.periodo.last}`, cobertura_pct: { lluvia: meta.cobertura.total.pr_mm, tmax: meta.cobertura.total.tmax_c, tmin: meta.cobertura.total.tmin_c } },
        periodo_comparado: v.periodo_comun, aviso: v.advertencia,
        precipitacion: { fuentes: Object.keys(P).map((id) => ({ id, rmse_mensual_mm: P[id].mensual.ALL.rmse, sesgo_pct: P[id].mensual.ALL.bias_pct, r_mensual: P[id].mensual.ALL.r, r_temporada_ene_abr: P[id].temporada_ene_abr.r, peso: cal.precipitacion.pesos_confiabilidad[id] })), fuente_principal: cal.precipitacion.fuente_principal, ganador_confiable: cal.precipitacion.ganador_confiable_frente_a_otras, correccion: cal.precipitacion.correccion_de_sesgo, desfase: cal.precipitacion.desfase_diario },
        temperatura: { fuente_elegida: cal.temperatura.fuente_elegida, motivo: cal.temperatura.motivo, rmse_fuera_de_muestra_c: cal.temperatura.fuentes[cal.temperatura.fuente_elegida].rmse_fuera_de_muestra_medio, linea_base_climatologia_obs_rmse_c: cal.temperatura.linea_base_climatologia_obs_rmse, calor: cal.calor_observado.descripcion },
        supuesto: cal.aviso, climatologia_2001_2014: meta.climatologia_mensual_2001_2014,
      });
    } catch (e) { return send(res, 404, { error: 'Aún no hay validación frente a SENAMHI.', detail: e.message }); }
  }
  if (req.method === 'GET' && p === '/api/soil/estimate') { // textura y pH ESTIMADOS por SoilGrids en el punto (no es una medición de la parcela)
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !rice.inBox(lat, lon)) return send(res, 400, { error: 'Ubicación fuera del ámbito de la demo.' });
    const r = await require('./src/datasources').getSoil(lat, lon);
    if (!r.ok) return send(res, 200, { available: false, reason: r.error, note: 'No hay estimación de SoilGrids para este punto; no se sustituye por la de otro lugar.' });
    return send(res, 200, { available: true, source: 'ISRIC SoilGrids 2.0 (250 m, modelado)', ...require('./src/suelo').estimate(r.data) });
  }
  if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, version: require('./package.json').version, time: new Date().toISOString() });
  if (req.method === 'GET' && p === '/api/meta') {
    return send(res, 200, {
      crops: CROPS.crops.map((c) => ({ id: c.id, name: c.name, family: c.family, type: c.type, notes: c.notes, regime: c.regime })),
      kb_status: CROPS._meta.status, scenarios: Object.values(SCENARIOS), default_start_slot: defaultStartSlot(),
    });
  }
  if (req.method === 'POST' && p === '/api/analyze') {
    const body = await readBody(req);
    const v = validateInput(body);
    if (v.errs) return send(res, 400, { error: 'Entrada inválida', details: v.errs });
    const g = await gatherData(v.input.lat, v.input.lon);
    const job = ensureImerg(v.input.lat, v.input.lon, g.imergMissing);
    let result;
    try { result = analyze(v.input, g, v.scenario); } catch (e) { return send(res, 422, { error: e.message }); }
    result.imerg_job = { state: job.state, done: job.done, total: job.total, errors: job.errors };
    result.input = v.input;
    return send(res, 200, result);
  }
  if (req.method === 'GET' && p === '/api/parcels') return send(res, 200, loadDb().parcels);
  if (req.method === 'POST' && p === '/api/parcels') {
    const b = await readBody(req);
    const lat = Number(b.lat), lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !String(b.name || '').trim()) return send(res, 400, { error: 'nombre y coordenadas requeridos' });
    const db = loadDb();
    const parcel = { id: crypto.randomUUID(), name: String(b.name).slice(0, 80), lat, lon, area_ha: Number(b.area_ha) || 0, irrigation: !!b.irrigation, history: b.history || [], priorities: b.priorities || {}, excluded_crops: b.excluded_crops || [], decisions: [], created_at: new Date().toISOString() };
    db.parcels.push(parcel); saveDb(db);
    return send(res, 201, parcel);
  }
  const m = p.match(/^\/api\/parcels\/([\w-]+)(\/decision)?$/);
  if (m) {
    const db = loadDb(); const idx = db.parcels.findIndex((x) => x.id === m[1]);
    if (idx < 0) return send(res, 404, { error: 'parcela no encontrada' });
    if (req.method === 'DELETE' && !m[2]) { db.parcels.splice(idx, 1); saveDb(db); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && m[2]) {
      const b = await readBody(req);
      db.parcels[idx].decisions.push({ at: new Date().toISOString(), chosen: String(b.chosen || ''), sequence: b.sequence || [], note: String(b.note || '').slice(0, 500), engine_version: b.engine_version, scenario: b.scenario, weights: b.weights, scores: b.scores });
      saveDb(db); return send(res, 201, db.parcels[idx]);
    }
    if (req.method === 'GET') return send(res, 200, db.parcels[idx]);
  }
  return send(res, 404, { error: 'ruta no encontrada' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try { if (url.pathname.startsWith('/api/')) await handleApi(req, res, url); else serveStatic(req, res, url); }
  catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Error interno', detail: e.message }); }
});

if (require.main === module) server.listen(PORT, () => console.log(`Field Shift en http://localhost:${PORT}`));
module.exports = { server, validateInput, defaultStartSlot };
