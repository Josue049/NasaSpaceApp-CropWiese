'use strict';
/**
 * Textura del suelo ESTIMADA a partir de SoilGrids (arcilla y arena en %; limo = 100 − arcilla − arena).
 * Es una estimación modelada con incertidumbre alta (se informan sus cuantiles 5–95 %); NO es una medición de la parcela
 * y nunca se usa como si el agricultor la hubiera declarado.
 */

/** Clase textural USDA (triángulo de texturas) en español. */
function textureClass(clay, sand) {
  if (!Number.isFinite(clay) || !Number.isFinite(sand) || clay < 0 || sand < 0 || clay + sand > 100.5) return null;
  const silt = Math.max(0, 100 - clay - sand);
  if (silt + 1.5 * clay < 15) return 'arenoso';
  if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return 'areno-francoso';
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) return 'franco-arenoso';
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'franco';
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'franco-limoso';
  if (silt >= 80 && clay < 12) return 'limoso';
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'franco-arcillo-arenoso';
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'franco-arcilloso';
  if (clay >= 27 && clay < 40 && sand <= 20) return 'franco-arcillo-limoso';
  if (clay >= 35 && sand > 45) return 'arcillo-arenoso';
  if (clay >= 40 && silt >= 40) return 'arcillo-limoso';
  if (clay >= 40 && sand <= 45 && silt < 40) return 'arcilloso';
  return 'franco';
}

/** Grupo de tres clases que usa el formulario y el motor (arenosa · franca · arcillosa). */
function group3(cls) {
  if (['arenoso', 'areno-francoso'].includes(cls)) return 'arenosa';
  if (['arcilloso', 'arcillo-limoso', 'arcillo-arenoso'].includes(cls)) return 'arcillosa';
  return cls ? 'franca' : null;
}

/** Estimación con su incertidumbre. `soil` = salida de datasources.getSoil (clay/sand con mean, q05, q95). */
function estimate(soil) {
  if (!soil || !soil.clay || !soil.sand || soil.clay.mean == null || soil.sand.mean == null) return null;
  const c = soil.clay, s = soil.sand, cls = textureClass(c.mean, s.mean);
  // clases posibles en los extremos del intervalo 5–95 % (solo combinaciones físicamente posibles)
  const span = new Set();
  for (const cc of [c.q05 ?? c.mean, c.mean, c.q95 ?? c.mean]) for (const ss of [s.q05 ?? s.mean, s.mean, s.q95 ?? s.mean]) { const k = textureClass(cc, ss); if (k) span.add(k); }
  const g = new Set([...span].map(group3));
  return {
    clay_pct: Math.round(c.mean), sand_pct: Math.round(s.mean), silt_pct: Math.max(0, Math.round(100 - c.mean - s.mean)),
    clay_range_pct: [Math.round(c.q05 ?? c.mean), Math.round(c.q95 ?? c.mean)], sand_range_pct: [Math.round(s.q05 ?? s.mean), Math.round(s.q95 ?? s.mean)],
    class: cls, group: group3(cls), classes_in_range: [...span], groups_in_range: [...g],
    ph: soil.phh2o && soil.phh2o.mean != null ? { mean: +soil.phh2o.mean.toFixed(1), range: [+(soil.phh2o.q05 ?? soil.phh2o.mean).toFixed(1), +(soil.phh2o.q95 ?? soil.phh2o.mean).toFixed(1)] } : null,
    uncertainty: g.size > 1 ? 'alta: el intervalo de SoilGrids abarca más de un grupo textural' : 'moderada',
    note: 'Estimación modelada de SoilGrids (250 m): no es una medición de tu parcela. Si conoces tu textura o tienes un análisis, indícalo en «Datos de mi parcela».',
  };
}

module.exports = { textureClass, group3, estimate };
