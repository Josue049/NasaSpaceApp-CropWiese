'use strict';
// Añade el frijol Loctao (Vigna radiata) a data/crops.json por inserción de texto (no reformatea el resto del archivo).
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'crops.json');
let txt = fs.readFileSync(file, 'utf8');
if (/"id": "loctao"/.test(txt)) { console.log('loctao ya existe'); process.exit(0); }

const P = (status, value, source, note) => ({ status, value, source, ...(note ? { note } : {}) });
const loctao = {
  id: 'loctao', name: 'Frijol Loctao (mungo)', sci: 'Vigna radiata', family: 'Fabaceae', type: 'legume',
  cycle: { ini: 12, dev: 23, mid: 11, late: 13 },
  kc: { ini: 0.4, mid: 1.05, end: 0.5 },
  t_abs: [8, 40], t_stress_max: 35, ph: [5.5, 7.2], ph_abs: [4.3, 8.3], regime: 'rainfed',
  cover: 0.6, biomass: 0.4, n_balance: 0.5, cost: 1, waterlog_sens: 0.8,
  refs: ['FAO56', 'ECOCROP', 'SENAMHI2024'],
  notes: 'Frijol Loctao = frijol mungo o chino (Vigna radiata). No es Phaseolus vulgaris ni Vigna unguiculata. Ciclo corto; sensible al anegamiento; leguminosa (fijación de N cualitativa).',
  root_m: 0.6, p_depletion: 0.45,
  local_evidence: {
    campaigns_documented: ['B'],
    note: 'Documentado en la campaña chica (emergencia 22-jul-2024, estación SENAMHI Morropón; 200 ha instaladas en el distrito de Morropón hacia sep-2025). No hay evidencia directa en la campaña grande, pero tampoco de inviabilidad: se evalúa por condiciones y se marca "sin evidencia local directa".',
    sources: ['SENAMHI, Boletín agroclimático Piura 2024, págs. 6-7 (https://www.senamhi.gob.pe/load/file/03503SENA-111.pdf)', 'AgroPeru/Tridge 2025-09-02: 300 ha promovidas, 200 instaladas en Morropón (https://www.tridge.com/news/piura-promotes-productive-alternatives-with--bmkzcz)'],
  },
  cycle_uncertainty: {
    central_days: 59, plausible_range_days: [54, 90],
    note: 'Observado: 54 d de emergencia a "maduración" (SENAMHI 2024, una temporada, variedad no precisada; 22-jul → 14-sep) + ~5 d siembra→emergencia (estimación) = 59 d. Nota de prensa (AgroPeru 2025): "75 a 90 días hasta grano seco", sin indicar desde cuándo se cuenta. Hipótesis (no comprobada): 54 d = emergencia→inicio de maduración y 75-90 d = siembra→grano seco completo. Cerrar con la ficha de la variedad (INIA/DRAP).',
  },
  param_status: {
    cycle: 'OBSERVADO + ESTIMACIÓN: SENAMHI Morropón 2024 (54 d emergencia→maduración, una temporada) + 5 d siembra→emergencia (estimación); reparto por etapas = estimación. Intervalo abierto 54-90 d',
    kc: 'LITERATURA: FAO-56 Tabla 12 "Green gram, cowpeas" (ini 0.4, mid 1.05, fin 0.60-0.35; se usa 0.5)',
    root_m: 'LITERATURA: FAO-56 Tabla 22 "Green gram and cowpeas" (0.6-1.0 m; se usa el extremo conservador)',
    p_depletion: 'LITERATURA: FAO-56 Tabla 22 (0.45)',
    height_m: 'LITERATURA: FAO-56 Tabla 12 (0.4 m)',
    eco: 'LITERATURA: FAO EcoCrop, Vigna radiata (tmin 8, óptimo 21-36, tmax 40; ciclo 50-120 d; altitud ≤ 2000 m). Una guía de Sudáfrica da óptimo 27-30 °C',
    t_stress_max: 'HIPÓTESIS: 35 °C (condición control no estresante en estudios de calor; pérdida de flores >40 °C). Sin umbral citable único; se prueba 32-40 °C',
    ph: 'FUENTES EN CONFLICTO: EcoCrop óptimo 5.5-6.2 (tolera 4.3-8.3) vs guía de Sudáfrica 6.3-7.2; se usa 5.5-7.2 como rango óptimo (unión) y 4.3-8.3 como absoluto',
    waterlog_sens: 'ESTIMACIÓN ordinal: sensible al anegamiento (reduce nodulación, fijación de N y emergencia tras arroz); valor 0.8 sin fuente cuantitativa',
    n_balance: 'ESTIMACIÓN ordinal: leguminosa; fijación típica 26-42 kg N/ha, hasta ~70 (CSIRO/GRDC, fuera de Piura); ordinal 0.5, sin cantidad',
    cover: 'PROVISIONAL: juicio propio ordinal, sin fuente', biomass: 'PROVISIONAL: juicio propio ordinal, sin fuente', cost: 'PROVISIONAL: juicio propio ordinal, sin fuente. El costo real debe declararlo el agricultor',
    pests: 'PENDIENTE: riesgos fitosanitarios no investigados',
  },
  eco: { species: 'Vigna radiata', tmin: 8.0, topmn: 21.0, topmx: 36.0, tmax: 40.0, ktmp: null, gmin: 50.0, gmax: 120.0, altmx: 2000.0, source: 'FAO EcoCrop (EcoCrop_DB.csv, copia openclim/ecocrop); rangos amplios de la especie, NO específicos de variedad ni de zona' },
  height_m: 0.4,
};
const eol = txt.includes('\r\n') ? '\r\n' : '\n';
const body = JSON.stringify(loctao, null, 2).split('\n').map((l) => '    ' + l).join(eol);
const end = txt.lastIndexOf(eol + '  ]');
if (end < 0) throw new Error('estructura inesperada de crops.json');
txt = txt.slice(0, end) + ',' + eol + body + txt.slice(end);
JSON.parse(txt); // validar
fs.writeFileSync(file, txt);
console.log('loctao añadido');
