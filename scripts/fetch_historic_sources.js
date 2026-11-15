'use strict';
/**
 * Descarga (una sola vez, con reanudación) las series de POWER, ERA5 e IMERG para el PERIODO COMPARTIDO con la serie
 * SENAMHI Morropón (hasta 2014-06-30). Se guardan en data/validation/historic/ para que la validación sea reproducible sin red.
 *   node scripts/fetch_historic_sources.js            (POWER + ERA5 + IMERG 2001-2014)
 *   node scripts/fetch_historic_sources.js --sin-imerg
 * Punto: referencia del proyecto (data/rice_tinajones.json → station). Las coordenadas de la estación SENAMHI no constan en el TXT.
 */
const fs = require('fs');
const path = require('path');
const { fetchImergDaily } = require('../src/imerg');
const PROFILE = require('../data/rice_tinajones.json');
const { lat, lon } = PROFILE.station;
const OUT = path.join(__dirname, '..', 'data', 'validation', 'historic');
fs.mkdirSync(OUT, { recursive: true });
const SKIP_IMERG = process.argv.includes('--sin-imerg');
const J = async (url, ms = 120000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } };
const save = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));

(async () => {
  const meta = { lat, lon, note: 'Punto de referencia del proyecto; no son coordenadas verificadas de la estación SENAMHI.', fetched_at: new Date().toISOString() };
  // POWER diario (MERRA-2): T2M, T2M_MAX, T2M_MIN, PRECTOTCORR
  if (!fs.existsSync(path.join(OUT, 'power_2000_2014.json'))) {
    const o = await J(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=20000101&end=20141231&format=JSON`);
    const p = o.properties.parameter, data = {};
    for (const d of Object.keys(p.T2M)) { const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; const g = (k) => (p[k][d] === -999 ? null : p[k][d]); data[iso] = { pr: g('PRECTOTCORR'), tx: g('T2M_MAX'), tn: g('T2M_MIN'), tm: g('T2M') }; }
    save('power_2000_2014.json', { ...meta, source: 'NASA POWER daily v' + (o.header && o.header.api && o.header.api.version), product: 'MERRA-2 (rejilla 0.5°×0.625°)', variables: 'PRECTOTCORR mm/día, T2M_MAX, T2M_MIN, T2M °C', data });
    console.log('POWER ok', Object.keys(data).length);
  } else console.log('POWER ya existe');
  // ERA5 vía Open-Meteo (UTC)
  if (!fs.existsSync(path.join(OUT, 'era5_2000_2014.json'))) {
    const o = await J(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2000-01-01&end_date=2014-12-31&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,temperature_2m_mean&timezone=UTC`);
    const data = {}; o.daily.time.forEach((t, i) => { data[t] = { pr: o.daily.precipitation_sum[i], tx: o.daily.temperature_2m_max[i], tn: o.daily.temperature_2m_min[i], tm: o.daily.temperature_2m_mean[i] }; });
    save('era5_2000_2014.json', { ...meta, source: 'ERA5 (ECMWF) vía Open-Meteo archive', product: 'reanálisis ~0.25°; día UTC', grid_point: { lat: o.latitude, lon: o.longitude, elevation: o.elevation }, data });
    console.log('ERA5 ok', Object.keys(data).length, 'celda', o.latitude, o.longitude, 'elev', o.elevation);
  } else console.log('ERA5 ya existe');
  // IMERG V07 Late vía ClimateSERV (datatype 226), por año
  if (!SKIP_IMERG) { // ClimateSERV omite algunos días (2014: 358 de 365): se conservan y las comparaciones usan solo pares compatibles
    const years = Array.from({ length: 14 }, (_, i) => 2001 + i); // IMERG V07 comienza en 2000-06; se usan años completos
    const queue = years.filter((y) => !fs.existsSync(path.join(OUT, `imerg_${y}.json`)));
    let done = 0;
    const worker = async () => { while (queue.length) { const y = queue.shift(); for (let k = 0; k < 3; k++) { try { const d = await fetchImergDaily(lat, lon, `${y}-01-01`, `${y}-12-31`, { timeoutMs: 600000 }); if (Object.keys(d).length < 340) throw new Error('serie incompleta ' + Object.keys(d).length); save(`imerg_${y}.json`, { ...meta, source: 'NASA GPM IMERG V07 Late vía ClimateSERV (datatype 226)', product: 'cuadro de 0.1° alrededor del punto', year: y, data: d }); done++; console.log('IMERG', y, 'ok', Object.keys(d).length); break; } catch (e) { console.log('IMERG', y, 'intento', k + 1, e.message); } } } };
    await Promise.all([worker(), worker(), worker()]);
    console.log('IMERG terminado:', done, 'años nuevos');
  }
})().catch((e) => { console.error(e); process.exit(1); });
