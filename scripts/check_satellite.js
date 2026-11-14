'use strict';
// Verificación Sentinel-2 de un punto (requiere red la primera vez; luego usa caché). Uso: node scripts/check_satellite.js [lat lon]
const { checkParcel } = require('../src/satellite');
const { PROFILE } = require('../src/morropon');
const lat = Number(process.argv[2] ?? -5.1944), lon = Number(process.argv[3] ?? -79.9867);
const t = Date.now();
checkParcel(lat, lon, PROFILE).then((r) => {
  console.log(`(${lat}, ${lon}) escenas ${r.scenes_found}, errores ${r.scene_errors}, ${((Date.now() - t) / 1000).toFixed(1)} s, caché ${r.cached}`);
  console.log(r.series.map((s) => `${s.date} scl${s.scl} ${s.valid ? s.ndvi : '(' + (s.ndvi ?? '—') + ' ✗)'}`).join('\n'));
  console.log(JSON.stringify(r.classification), '\n', JSON.stringify(r.phenology_contrast));
}).catch((e) => { console.error(e); process.exit(1); });
