'use strict';
/**
 * Precipitación diaria GPM IMERG vía ClimateSERV (SERVIR, NASA/USAID).
 * Se usa ClimateSERV porque la descarga directa de GES DISC exige credenciales Earthdata.
 * API documentada en https://climateserv.servirglobal.net/develop-api  (datatype 26 = IMERG).
 * Devuelve { 'YYYYMMDD': mm/día } promediado sobre un polígono pequeño (~1 celda IMERG de 0,1°).
 */
const BASE = 'https://climateserv.servirglobal.net/api';
const IMERG_DATATYPE = 26;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;

async function getJson(url, ms = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(await r.text());
  } finally { clearTimeout(t); }
}

function squareAround(lat, lon, half = 0.05) {
  return { type: 'Polygon', coordinates: [[[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]] };
}

async function fetchImergDaily(lat, lon, startISO, endISO, { timeoutMs = 240000 } = {}) {
  const geometry = encodeURIComponent(JSON.stringify(squareAround(lat, lon)));
  const url = `${BASE}/submitDataRequest/?datatype=${IMERG_DATATYPE}&begintime=${fmt(new Date(startISO))}&endtime=${fmt(new Date(endISO))}&intervaltype=0&operationtype=5&dateType_Category=default&isZip_CurrentDataType=false&geometry=${geometry}`;
  const sub = await getJson(url);
  const id = Array.isArray(sub) ? sub[0] : sub;
  if (typeof id !== 'string' || id.length < 20) throw new Error(`ClimateSERV rechazó la solicitud: ${JSON.stringify(sub).slice(0, 200)}`);
  const t0 = Date.now();
  for (;;) {
    const prog = await getJson(`${BASE}/getDataRequestProgress/?id=${id}`);
    const p = Array.isArray(prog) ? prog[0] : prog;
    if (p === -1) throw new Error('ClimateSERV reportó error de procesamiento');
    if (p >= 100) break;
    if (Date.now() - t0 > timeoutMs) throw new Error('ClimateSERV: tiempo de espera agotado');
    await sleep(1500);
  }
  const res = await getJson(`${BASE}/getDataFromRequest/?id=${id}`, 120000);
  const rows = res.data || res;
  const out = {};
  for (const r of rows) {
    const date = r.date || r.Date; // formato MM/DD/YYYY
    const v = r.value && typeof r.value === 'object' ? Object.values(r.value)[0] : r.value;
    if (!date || v == null || v < 0) continue; // -9999 = sin dato
    const [m, d, y] = date.split('/');
    out[`${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`] = Number(v);
  }
  return out;
}

module.exports = { fetchImergDaily, IMERG_DATATYPE };
