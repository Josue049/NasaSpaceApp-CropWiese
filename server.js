'use strict';
/** Servidor HTTP sin dependencias externas. API JSON + archivos estáticos de /public. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ds = require('./src/datasources');
const { gatherData, analyze, SCENARIOS, CROPS } = require('./src/pipeline');

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

async function handleApi(req, res, url) {
  const p = url.pathname;
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
