'use strict';
// Descarga NASA POWER diario ene–jun 2026 para las estaciones SENAMHI (validación). Un solo uso.
const fs = require('fs'), path = require('path');
const ST = { morropon: [-5.1944, -79.9867], partidor: [-4.6406, -80.2522], lambayeque: [-6.7042, -79.9269], talla: [-7.2711, -79.4222], oyotun: [-6.8417, -79.3236] };
(async () => {
  for (const [k, [lat, lon]] of Object.entries(ST)) {
    const f = path.join(__dirname, '..', 'data', 'validation', `power2026_${k}.json`);
    if (fs.existsSync(f)) { console.log(k, 'ya en caché'); continue; }
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN&community=AG&longitude=${lon}&latitude=${lat}&start=20251101&end=20260630&format=JSON`;
    try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); if (!j.properties?.parameter?.T2M) throw new Error('sin T2M'); fs.writeFileSync(f, JSON.stringify({ fetchedAt: new Date().toISOString(), lat, lon, raw: j })); console.log(k, 'OK', Object.keys(j.properties.parameter.T2M).length, 'días', 'celda z', j.geometry.coordinates[2]); }
    catch (e) { console.log(k, 'ERROR', e.message); }
  }
})();
