'use strict';
// Descarga y cachea IMERG diario año por año (un archivo por año) para un punto.
// Uso: node scripts/fetch_imerg_cache.js <lat> <lon> [añoIni] [añoFin]
const fs = require('fs');
const path = require('path');
const { fetchImergDaily } = require('../src/imerg');

const [lat, lon, y0 = '2015', y1 = '2024'] = process.argv.slice(2);
if (!lat || !lon) { console.error('Uso: node scripts/fetch_imerg_cache.js <lat> <lon> [añoIni] [añoFin]'); process.exit(1); }
const dir = process.env.FIELDSHIFT_CACHE || path.join(__dirname, '..', 'data', 'cache');
const { IMERG_DATATYPE: DT } = require('../src/imerg');
fs.mkdirSync(dir, { recursive: true });

(async () => {
  for (let y = +y0; y <= +y1; y++) {
    const f = path.join(dir, `imerg${DT}_${(+lat).toFixed(2)}_${(+lon).toFixed(2)}_${y}.json`);
    if (fs.existsSync(f)) { console.log(y, 'ya en caché'); continue; }
    const t = Date.now();
    try {
      const data = await fetchImergDaily(+lat, +lon, `${y}-01-01`, `${y}-12-31`, { timeoutMs: 300000 });
      const n = Object.keys(data).length;
      if (n < 360) throw new Error(`serie incompleta (${n} días)`);
      fs.writeFileSync(f, JSON.stringify({ fetchedAt: new Date().toISOString(), lat: +lat, lon: +lon, year: y, product: 'GPM IMERG via ClimateSERV (datatype ' + DT + ')', data }));
      console.log(y, 'OK', n, 'días', ((Date.now() - t) / 1000).toFixed(0), 's');
    } catch (e) { console.error(y, 'ERROR', e.message); }
  }
})();
