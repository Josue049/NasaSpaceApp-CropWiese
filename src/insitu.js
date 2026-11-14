'use strict';
/**
 * Modo PRECISA: datos in situ que aporta el agricultor (todos opcionales; cada uno se aplica por separado y se informa qué se usó y qué no).
 *
 *   sowing_date            AAAA-MM-DD   siembra real de la campaña
 *   establishment          'siembra_directa' | 'trasplante'      (informativo)
 *   variety                texto ≤ 40                            (el perfil está calibrado SOLO para Tinajones: otra variedad se advierte)
 *   observed_dates         { tillering, panicle, flowering, hard_ripening }  fechas observadas de cada fase (macollaje, panoja, floración, maduración córnea)
 *   irrigation             { management: 'inundacion_continua'|'intermitente'|'secano', supply_m3_ha, percolation_mm_day }
 *
 * Qué cambia en el análisis (ver docs/MODOS.md):
 *   - Con siembra + fecha de madurez, el ciclo de la parcela se recalibra (duración observada en lugar de los 114 días de SENAMHI 2026).
 *   - Con fases observadas, se compara el modelo contra lo observado y se centra la ventana de floración en la fecha observada.
 *   - Con dotación de riego, C1 (agua) pasa a ser calculable como cociente dotación/requerimiento (exploratorio; no es lámina verificada).
 * Nada de esto se guarda en el servidor.
 */
const PHASES = ['tillering', 'panicle', 'flowering', 'hard_ripening'];
const PHASE_ES = { tillering: 'Macollaje', panicle: 'Panoja', flowering: 'Floración', hard_ripening: 'Maduración córnea' };
const ESTAB = ['siembra_directa', 'trasplante'];
const MGMT = ['inundacion_continua', 'intermitente', 'secano'];
const isoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(Date.parse(s)).toISOString().slice(0, 10) === s;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Normaliza y valida. Devuelve { insitu (o null si no aportó nada), errors[] }. */
function validateInsitu(raw) {
  if (raw == null || typeof raw !== 'object') return { insitu: null, errors: [] };
  const errors = [], out = {};
  if (raw.sowing_date != null && raw.sowing_date !== '') { if (isoDate(raw.sowing_date)) out.sowing_date = raw.sowing_date; else errors.push('siembra real: fecha inválida (use AAAA-MM-DD)'); }
  if (raw.establishment) { if (ESTAB.includes(raw.establishment)) out.establishment = raw.establishment; else errors.push('método de establecimiento inválido'); }
  if (raw.variety != null && String(raw.variety).trim()) out.variety = String(raw.variety).trim().slice(0, 40);
  const od = {};
  for (const k of PHASES) {
    const v = raw.observed_dates && raw.observed_dates[k];
    if (v == null || v === '') continue;
    if (isoDate(v)) od[k] = v; else errors.push(`fase ${PHASE_ES[k]}: fecha inválida (use AAAA-MM-DD)`);
  }
  if (Object.keys(od).length) out.observed_dates = od;
  const ir = raw.irrigation && typeof raw.irrigation === 'object' ? raw.irrigation : null;
  if (ir) {
    const o = {};
    if (ir.management) { if (MGMT.includes(ir.management)) o.management = ir.management; else errors.push('manejo de riego inválido'); }
    if (ir.supply_m3_ha != null && ir.supply_m3_ha !== '') { const v = Number(ir.supply_m3_ha); if (Number.isFinite(v) && v >= 0 && v <= 40000) o.supply_m3_ha = v; else errors.push('dotación de riego: use un valor entre 0 y 40 000 m³/ha por campaña'); }
    if (ir.percolation_mm_day != null && ir.percolation_mm_day !== '') { const v = Number(ir.percolation_mm_day); if (Number.isFinite(v) && v >= 0 && v <= 30) o.percolation_mm_day = v; else errors.push('percolación: use un valor entre 0 y 30 mm/día'); }
    if (Object.keys(o).length) out.irrigation = o;
  }
  // coherencia de fechas (solo si no hubo errores de formato)
  if (!errors.length && out.observed_dates) {
    if (!out.sowing_date) { /* se informará como no aplicado, no es error */ } else {
      let prev = out.sowing_date;
      for (const k of PHASES) { const v = out.observed_dates[k]; if (!v) continue; if (days(prev, v) <= 0) errors.push(`las fechas deben ir en orden: ${PHASE_ES[k]} debe ser posterior a la fase o siembra previa`); prev = v; }
      const hard = out.observed_dates.hard_ripening;
      if (hard) { const d = days(out.sowing_date, hard); if (d < 70 || d > 220) errors.push(`la maduración córnea a los ${d} días de la siembra no es plausible (se esperan entre 70 y 220)`); }
    }
  }
  return { insitu: Object.keys(out).length ? out : null, errors };
}

const sum = (c) => c.ini + c.dev + c.mid + c.late;
/**
 * Perfil de la parcela a partir del perfil base y los datos in situ.
 * Devuelve { profile, applied[], ignored[] }, donde cada entrada explica qué se usó y qué no, y por qué.
 */
function calibratedProfile(base, insitu) {
  const applied = [], ignored = [];
  const prof = { ...base, cycle: { ...base.cycle }, phenology_das: { ...base.phenology_das }, flowering_window_das: [...base.flowering_window_das], calibrated: false };
  if (!insitu) return { profile: prof, applied, ignored };
  const od = insitu.observed_dates || {};
  if (insitu.variety) {
    if (/tinajones/i.test(insitu.variety)) applied.push(`Variedad declarada: ${insitu.variety} (coincide con el perfil).`);
    else ignored.push(`Variedad «${insitu.variety}»: el perfil base es de Tinajones; su ciclo se toma de las fechas que usted aporte, no de la variedad.`);
  }
  if (insitu.establishment) applied.push(`Establecimiento: ${insitu.establishment === 'trasplante' ? 'trasplante' : 'siembra directa'} (informativo; el modelo no lo distingue).`);
  if (Object.keys(od).length && !insitu.sowing_date) ignored.push('Fases observadas: requieren la fecha de siembra real; no se usaron.');
  if (insitu.sowing_date && Object.keys(od).length) {
    const das = {}; for (const k of PHASES) if (od[k]) das[k] = days(insitu.sowing_date, od[k]);
    const baseDas = base.phenology_das, hardObs = das.hard_ripening;
    const f = hardObs ? hardObs / baseDas.hard_ripening : null; // factor global de escala solo si hay madurez observada
    if (f) for (const s of Object.keys(prof.phenology_das)) prof.phenology_das[s] = Math.max(1, Math.round(baseDas[s] * f));
    for (const k of PHASES) if (das[k]) prof.phenology_das[k] = das[k];
    // las fases no observadas conservan la escala; se exige monotonía para no romper el ciclo
    const order = ['emergence', 'seedling', 'tillering', 'stem_elongation', 'panicle', 'panicle_development', 'flowering', 'milk_ripening', 'dough_ripening', 'hard_ripening'];
    for (let i = 1; i < order.length; i++) if (prof.phenology_das[order[i]] <= prof.phenology_das[order[i - 1]]) prof.phenology_das[order[i]] = prof.phenology_das[order[i - 1]] + 1;
    const p = prof.phenology_das, hard = p.hard_ripening, milk = Math.min(p.milk_ripening, hard - 1);
    prof.cycle = { ini: p.tillering, dev: p.panicle - p.tillering, mid: milk - p.panicle, late: hard - milk };
    if (sum(prof.cycle) !== hard) prof.cycle.late += hard - sum(prof.cycle);
    prof.flowering_window_das = [p.flowering - 7, p.flowering + 9]; // misma anchura que el perfil base (86–102 alrededor de 93)
    prof.calibrated = true;
    applied.push(`Ciclo de la parcela recalibrado: ${hard} días a maduración córnea${f ? '' : ' (estimado con las fases aportadas)'} en lugar de ${baseDas.hard_ripening}.`);
    if (!hardObs) applied.push('Sin fecha de madurez: el resto del ciclo se estima con la escala base; la calibración es parcial.');
    applied.push(`Ventana de floración centrada en el día ${p.flowering} tras la siembra (${p.flowering - 7}–${p.flowering + 9}).`);
  }
  return { profile: prof, applied, ignored, observed_das: Object.keys(od).length && insitu.sowing_date ? Object.fromEntries(PHASES.filter((k) => od[k]).map((k) => [k, days(insitu.sowing_date, od[k])])) : null };
}

/** Lámina de dotación (mm) a partir de m³/ha (1 mm = 10 m³/ha). */
const supplyMm = (insitu) => (insitu && insitu.irrigation && Number.isFinite(insitu.irrigation.supply_m3_ha) ? insitu.irrigation.supply_m3_ha / 10 : null);

module.exports = { validateInsitu, calibratedProfile, supplyMm, PHASES, PHASE_ES };
