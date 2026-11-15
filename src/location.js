'use strict';
/**
 * Resolución de la ubicación del usuario a las celdas NATIVAS de cada fuente.
 *
 * Por qué: POWER (0,5°×0,625°), ERA5 (~0,1°) e IMERG (0,1°) son productos de área; dos clics en la misma celda deben usar
 * la MISMA serie (y compartir caché), y dos clics en celdas distintas deben usar series distintas. La elevación/pendiente
 * (SRTM, 30 m) y el suelo (SoilGrids, 250 m) sí son específicos del punto y no se agrupan aquí.
 *
 * Compatibilidad: si la celda coincide con la de la estación de referencia (centro del dominio), se usan las coordenadas
 * originales de la estación, de modo que los datos de la demo (data/demo_morropon) y las pruebas sigan siendo los mismos.
 * Nunca se sustituye silenciosamente un punto por otro: cada fuente informa la celda realmente usada y su distancia.
 */
const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const r3 = (x) => Math.round(x * 1000) / 1000;

// Rejillas nativas. POWER: MERRA-2 (lat cada 0,5° con centros en múltiplos de 0,5; lon cada 0,625° desde −180).
// ERA5: Open-Meteo devuelve la celda ERA5/ERA5-Land más cercana (~0,1°); se agrupa en cubetas de 0,1° (coordenadas de la cubeta; la
// celda realmente servida se informa en la procedencia). IMERG: celdas de 0,1° con centros en x,x5.
const GRIDS = {
  power: { label: 'NASA POWER (MERRA-2)', resolution: '0,5° × 0,625° (≈ 55 × 70 km)', cell: (lat, lon) => ({ lat: Math.round(lat / 0.5) * 0.5, lon: -180 + Math.round((lon + 180) / 0.625) * 0.625 }) },
  era5: { label: 'ERA5 (vía Open-Meteo)', resolution: '≈ 0,1° (≈ 11 km; celda ERA5-Land más cercana)', cell: (lat, lon) => ({ lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 }) },
  imerg: { label: 'GPM IMERG V07 (ClimateSERV)', resolution: '0,1° (≈ 11 km)', cell: (lat, lon) => ({ lat: Math.floor(lat * 10) / 10 + 0.05, lon: Math.floor(lon * 10) / 10 + 0.05 }) },
};

/** Celda de `src` que contiene al punto. `key` identifica la celda (sirve de clave de caché y de trabajos de descarga). */
function cellOf(src, lat, lon) {
  const c = GRIDS[src].cell(lat, lon);
  return { src, lat: r3(c.lat), lon: r3(c.lon), key: `${src}:${r3(c.lat)}_${r3(c.lon)}` };
}

/**
 * Resuelve las coordenadas con que se consultará cada fuente de clima.
 * @param {number} lat @param {number} lon punto elegido por el usuario
 * @param {{lat:number,lon:number}} station estación de referencia (alias de compatibilidad con la demo)
 */
function resolveCells(lat, lon, station) {
  const out = { requested: { lat, lon }, sources: {} };
  for (const src of Object.keys(GRIDS)) {
    const cell = cellOf(src, lat, lon), stCell = station ? cellOf(src, station.lat, station.lon) : null;
    const sameAsStation = !!stCell && stCell.key === cell.key;
    const use = sameAsStation ? { lat: station.lat, lon: station.lon } : { lat: cell.lat, lon: cell.lon };
    out.sources[src] = { label: GRIDS[src].label, resolution: GRIDS[src].resolution, cell_key: cell.key, cell_center: { lat: cell.lat, lon: cell.lon }, query: use, same_cell_as_station: sameAsStation, distance_to_cell_center_km: +km({ lat, lon }, cell).toFixed(1) };
  }
  return out;
}

module.exports = { GRIDS, cellOf, resolveCells, km };
