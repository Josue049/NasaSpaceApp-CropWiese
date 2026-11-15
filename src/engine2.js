'use strict';
/**
 * Motor de rotaciones en DOS ETAPAS (v2) para el dominio Morropón (arroz + frijol Loctao).
 *
 *  Etapa 1 — VIABILIDAD por cultivo × campaña × parcela, propagando incertidumbre: fuente de lluvia × desplazamiento térmico × parámetros
 *            INCIERTOS del cultivo (ciclo y umbral de calor del Loctao, umbral de calor y percolación del arroz).
 *            Estados: favorable / condicionada (moderada | alta) / inviable.
 *            «Inviable» solo por LÍMITES DOCUMENTADOS (ciclo que no cabe según EcoCrop/tiempo térmico, altitud y pH fuera del rango absoluto de la
 *            especie, arroz sin riego). Un umbral METODOLÓGICO (p. ej. ETa/ETc < 0,5) produce «condicionada» de riesgo alto, nunca una prohibición.
 *  Etapa 2 — COMPARACIÓN de las secuencias sin campañas inviables ni de riesgo alto: primero menos condiciones, luego puntaje.
 *
 * PRINCIPIO: nada se inventa en silencio. Cada dato lleva categoría de procedencia:
 *   A observado · B bibliográfico · C declarado por el agricultor · D estimado (modelo documentado) · E hipótesis (sin respaldo suficiente).
 * Lo desconocido no se convierte en cero ni en un valor «por defecto» que parezca una declaración: si el riego no se declara, se evalúa como
 * ESCENARIO y se marca lo que depende de él. Ver docs/AUDITORIA_PARAMETROS.md y src/parametros.js.
 */
const climate = require('./climate');
const { evaluateSeason, tempUncertainty, awcFromSoil, cycleLength, coverOf } = climate;

const ENGINE_VERSION = 'v2.1 · dos etapas (viabilidad → comparación) con procedencia';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
function wmed(vals, ws) { const a = vals.map((v, i) => [v, ws[i]]).filter(([v]) => Number.isFinite(v)).sort((x, y) => x[0] - y[0]); if (!a.length) return NaN; const tot = a.reduce((s, [, w]) => s + w, 0); let acc = 0; for (const [v, w] of a) { acc += w; if (acc >= tot / 2) return v; } return a[a.length - 1][0]; }
function wmean(vals, ws) { const tot = ws.reduce((a, b) => a + b, 0); return tot ? vals.reduce((s, v, i) => s + v * ws[i], 0) / tot : 0; }
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Parámetros del motor. cat: A observado · B bibliográfico · C declarado · D estimado · E hipótesis (ver cabecera).
 * status: LITERATURA | HEREDADO | PROVISIONAL | DESACTIVADO | HIPÓTESIS.
 */
const PARAMS = {
  rice_perc_mm_day: { value: 5, range: [2, 8], cat: 'B', status: 'LITERATURA', source: 'FAO, Irrigation Water Management (necesidades de riego del arroz): percolación 2 mm/d en arcilla pesada, 8 mm/d en suelos arenosos, 5 mm/d como media si no hay dato local (https://www.fao.org/4/t7202e/t7202e07.htm). No hay medición local: se propaga el rango 2–8; con textura declarada se usa el valor FAO de esa textura; con percolación declarada, esa.' },
  rice_sat_mm: { value: 200, range: [0, 200], cat: 'B', status: 'LITERATURA', source: 'FAO (misma obra): saturación de la zona radicular en la preparación de suelo ≈ 200 mm; el batido reduce la percolación.' },
  rice_t_stress_c: { value: 35, range: [33, 37], cat: 'E', status: 'HIPÓTESIS', source: 'Umbral de calor del arroz en la etapa media. 35 °C es un valor genérico no verificado para Tinajones; se propaga 33–37 °C.' },
  loctao_cycle_days: { value: 59, range: [59, 90], cat: 'E', status: 'HIPÓTESIS', source: 'Observado: 54 d de emergencia a maduración (SENAMHI Morropón 2024, una temporada) + ~5 d de siembra a emergencia (estimación) = 59 d. Nota de prensa 2025: 75–90 d a grano seco, sin indicar desde cuándo se cuenta. Se propagan 59, 75 y 90 d salvo que el agricultor declare su ciclo.' },
  loctao_t_stress_c: { value: 35, range: [32, 38], cat: 'E', status: 'HIPÓTESIS', source: 'Umbral de calor del Loctao en la etapa media: sin umbral citable único (estudios: 35 °C como condición control, pérdida de flores >40 °C). Se propaga 32–38 °C.' },
  fail_inviable: { value: 0.8, cat: 'E', status: 'PROVISIONAL', source: 'Fracción ponderada de escenarios (fuente × temperatura × parámetros inciertos) que deben incumplir un LÍMITE DOCUMENTADO para declarar inviable. Umbral metodológico; sensibilidad 0,7–0,9 sin efecto.' },
  fail_conditional: { value: 0.1, cat: 'E', status: 'PROVISIONAL', source: 'Por encima de esta fracción de escenarios con incumplimiento (documentado o metodológico) la campaña pasa a condicionada.' },
  heat_soft: { value: 0.25, cat: 'E', status: 'PROVISIONAL', source: 'Fracción de días de la etapa media con Tmax > umbral que genera una alerta (no excluye).' },
  cover_hard: { value: 0.5, cat: 'E', status: 'HEREDADO', source: 'ETa/ETc mínimo (umbral METODOLÓGICO del motor original): por debajo se marca riesgo hídrico alto (condicionada), nunca inviable.' },
  cover_soft: { value: 0.8, cat: 'E', status: 'HEREDADO', source: 'ETa/ETc < 0,8 = déficit hídrico (criterio del motor original); genera una alerta.' },
  slope_risk_pct: { value: 25, cat: 'E', status: 'HEREDADO', source: 'Pendiente > 25 % con cobertura baja → riesgo alto (regla del motor original; metodológica, no excluyente).' },
  rice_slope_max_pct: { value: null, cat: 'E', status: 'DESACTIVADO', source: 'Pendiente máxima para arroz inundado: no se encontró un valor citable; no se aplica. Habilitar con FAO Soils Bulletin 55 o criterio de un agrónomo.' },
  rot_same_crop: { value: 0.45, cat: 'E', status: 'PROVISIONAL', source: 'Penalización por repetir el mismo cultivo en campañas consecutivas (supuesto del equipo; sin cuantificación).' },
  rot_same_family: { value: 0.3, cat: 'E', status: 'PROVISIONAL', source: 'Penalización por repetir la familia botánica (supuesto del equipo).' },
  tie_margin: { value: 1.0, cat: 'E', status: 'PROVISIONAL', source: 'Diferencia de puntaje (de 100) por debajo de la cual se prefiere la secuencia con más campañas documentadas localmente.' },
  n_ordinal: { value: null, cat: 'E', status: 'PROVISIONAL', source: 'Aporte de N: escala ordinal cualitativa (sin kg N/ha). Fijación típica de mungo 26–42 kg N/ha (CSIRO/GRDC, fuera de Piura).' },
};
const pv = (k, ov) => (ov && ov[k] != null ? ov[k] : PARAMS[k].value);

/** Textura declarada por el agricultor → capacidad de agua útil (valores del motor original) y percolación del arroz (FAO por textura). */
const TEXTURE = {
  arenosa: { label: 'arenosa', awc: 70, clayHigh: false, perc: { value: 8, range: [8, 8], src: 'FAO: 8 mm/d en suelos arenosos' } },
  franca: { label: 'franca / media', awc: 110, clayHigh: false, perc: { value: 5, range: [5, 6], src: 'FAO: 5 mm/d (manual) a 6 mm/d (ficha) como media' } },
  arcillosa: { label: 'arcillosa', awc: 120, clayHigh: true, perc: { value: 3, range: [2, 4], src: 'FAO: 2 mm/d (manual) a 4 mm/d (ficha) en arcilla pesada' } },
};

const ORDER = { A: ['A', 'B', 'A', 'B'], B: ['B', 'A', 'B', 'A'] };
const RANK = { favorable: 0, condicionada: 1, inviable: 3 };

/** Escala las etapas del ciclo a una duración total (días efectivos). */
function scaleCycle(crop, total) {
  const L = cycleLength(crop); if (Math.round(total) === L) return crop;
  const k = total / L, st = ['ini', 'dev', 'mid', 'late'].map((s) => Math.max(1, Math.round(crop.cycle[s] * k)));
  return { ...crop, cycle: { ini: st[0], dev: st[1], mid: st[2], late: st[3] } };
}

function applySoil(soil, d) {
  if (!d) return { soil: soil ?? null, awc: null, clayHigh: null };
  let s = soil ? { ...soil } : null;
  if (d.ph != null) s = { ...(s || {}), phh2o: { ...(s && s.phh2o ? s.phh2o : {}), mean: d.ph, declared: true } };
  const t = d.texture && TEXTURE[d.texture] ? TEXTURE[d.texture] : null;
  return { soil: s, awc: t ? t.awc : null, clayHigh: t ? t.clayHigh : null };
}

function buildEnv(input, data, ov) {
  const crops = Object.fromEntries(data.crops.map((c) => [c.id, c]));
  const prim = data.climates.find((c) => c.role === 'primary') || data.climates[0];
  const sd = applySoil(data.soil ?? null, input.soil || null);
  const slotById = Object.fromEntries(data.slots.map((s) => [s.id, s]));
  let order = ORDER[input.start_slot === 'B' ? 'B' : 'A'].slice(), first = null;
  const m = input.first_sowing_date && /^\d{4}-\d{2}-\d{2}$/.test(input.first_sowing_date) ? input.first_sowing_date : null;
  if (m) { // fecha prevista de siembra declarada: se usa SOLO para la primera campaña
    const base = slotById[order[0]], mm = +m.slice(5, 7), dd = +m.slice(8, 10);
    slotById.F = { ...base, id: 'F', base: base.id, start: { m: mm, d: dd }, label: `Campaña 1 (siembra prevista ${dd}/${mm})`, declared: true };
    order[0] = 'F'; first = { date: m, base: base.id };
  }
  return {
    input, crops, cropList: data.crops, climates: data.climates, slope: data.slope ?? null, soil: sd.soil,
    slots: data.slots, slotById, slotOrder: order, firstSowing: first,
    awc: sd.awc ?? awcFromSoil(sd.soil), clayHigh: sd.clayHigh ?? (sd.soil && sd.soil.clay && sd.soil.clay.mean != null ? sd.soil.clay.mean > 40 : false),
    dT: tempUncertainty(prim.climate), elev: prim.climate.elevation_m, primary: prim.id, cache: new Map(), ov: ov || {}, sourceWeights: data.source_weights || null,
  };
}

const seasonOf = (env, climId, crop, slot, dT, tsShift) => {
  const k = `${climId}|${crop.id}|${cycleLength(crop)}|${crop.t_stress_max}|${slot.id}|${slot.start.m}-${slot.start.d}|${dT.toFixed(2)}|${tsShift.toFixed(2)}`;
  if (!env.cache.has(k)) {
    const clim = env.climates.find((c) => c.id === climId).climate;
    const c2 = tsShift ? { ...crop, t_stress_max: crop.t_stress_max - tsShift } : crop; // T más alta ≡ umbral efectivo menor
    env.cache.set(k, evaluateSeason(clim, c2, slot, false, env.awc, { dT }));
  }
  return env.cache.get(k);
};

/** Necesidad neta de riego (mm). Arroz: ETc − lluvia + saturación + percolación×días (FAO). Otros: déficit del balance hídrico. */
function netNeed(crop, s, perc, sat) {
  const base = Math.max(0, s.deficit_mm ?? 0);
  return crop.id === 'arroz' ? base + sat + perc * (s.dur_days ?? s.max_days ?? 0) : base;
}

/** Percolación del arroz: declarada (C) > textura declarada (B por textura) > rango FAO sin dato local (B). */
function percInfo(env, ov) {
  const d = env.input.water && env.input.water.percolation_mm_day;
  if (d != null && Number.isFinite(d)) return { central: d, set: [d], cat: 'C', basis: `declarada por el agricultor: ${d} mm/d (no verificada)` };
  const t = env.input.soil && env.input.soil.texture && TEXTURE[env.input.soil.texture];
  if (t) { const set = [...new Set([t.perc.range[0], t.perc.value, t.perc.range[1]])]; return { central: t.perc.value, set, cat: 'B', basis: `textura declarada (${t.label}): ${t.perc.src}` }; }
  const r = PARAMS.rice_perc_mm_day.range;
  return { central: pv('rice_perc_mm_day', ov), set: [r[0], pv('rice_perc_mm_day', ov), r[1]], cat: 'B', basis: 'rango FAO 2–8 mm/d (sin dato local; 5 mm/d como media)' };
}

/**
 * Dotación de agua por campaña (mm).
 *   irrigation === false  → 0 (secano declarado)
 *   irrigation === true   → volumen declarado, o Infinity («riego declarado sin volumen»: se informa la demanda)
 *   irrigation == null    → NO declarado: se evalúa el ESCENARIO «con riego sin límite» y se marca lo que depende del riego.
 */
function supplyFor(input) {
  if (input.irrigation === false) return { mm: 0, basis: 'secano declarado por el agricultor', cat: 'C' };
  const v = input.water && input.water.supply_m3_ha;
  if (input.irrigation === true) {
    if (v != null && Number.isFinite(v)) return { mm: v / 10, basis: `dotación declarada por campaña: ${Math.round(v)} m³/ha (no verificada)`, cat: 'C' };
    return { mm: Infinity, basis: 'riego declarado sin volumen: no se evalúa limitación de agua; se informa la demanda', cat: 'C' };
  }
  if (v != null && Number.isFinite(v) && v > 0) return { mm: v / 10, basis: `dotación declarada por campaña: ${Math.round(v)} m³/ha (no verificada)`, cat: 'C' };
  return { mm: Infinity, unknown: true, basis: 'ESCENARIO (no declaraste si tienes riego): se evalúa con riego sin límite y se marca lo que depende de él', cat: 'E' };
}

/** Variantes inciertas por cultivo: ciclo y umbral de calor del Loctao; umbral de calor del arroz. Un ciclo declarado fija el valor. */
function variantsFor(env, crop, ov) {
  const declared = !!(env.input.cycle_days && env.input.cycle_days[crop.id]) || !!crop.cycle_declared;
  const tsOf = { loctao: PARAMS.loctao_t_stress_c, arroz: PARAMS.rice_t_stress_c }[crop.id];
  const ts = tsOf ? [tsOf.range[0], tsOf.value, tsOf.range[1]] : [crop.t_stress_max];
  const cyc = crop.id === 'loctao' && !declared ? [PARAMS.loctao_cycle_days.value, 75, PARAMS.loctao_cycle_days.range[1]] : [cycleLength(crop)];
  const out = [];
  for (const c of cyc) for (const t of ts) out.push({ crop: { ...scaleCycle(crop, c), t_stress_max: t }, cycle: c, ts: t });
  return out;
}

/** ETAPA 1. */
function viability(env, crop, slot, supply, ov) {
  const pinf = percInfo(env, ov), sat = pv('rice_sat_mm', ov);
  const fi = pv('fail_inviable', ov), fc = pv('fail_conditional', ov), heatSoft = pv('heat_soft', ov), covHard = pv('cover_hard', ov), covSoft = pv('cover_soft', ov);
  const slopeRisk = pv('slope_risk_pct', ov);
  const baseSlot = slot.base || slot.id;
  const variants = variantsFor(env, crop, ov), percs = crop.id === 'arroz' ? pinf.set : [pinf.central];
  const SW = env.sourceWeights || {}, nC = env.climates.length, nV = variants.length * percs.length;
  const wSrc = (id) => (SW[id] != null ? SW[id] : 1 / nC);
  const rows = [];
  for (const v of variants) for (const pc of percs) for (const c of env.climates) for (const sh of [-1, 0, 1]) {
    const s = seasonOf(env, c.id, v.crop, slot, sh * env.dT, sh * env.dT); if (!s) continue;
    rows.push({ s, v, perc: pc, src: c.id, sh, w: wSrc(c.id) / 3 / nV, weq: 1 / (nC * 3 * nV) });
  }
  const reasons = {}, basis = {}, tag = (k, b) => { reasons[k] = (reasons[k] || 0) + 1; basis[k] = b; };
  const cls = rows.map((r) => {
    const s = r.s, dur = s.dur_days ?? s.max_days, need = netNeed(v2crop(r), s, r.perc, sat);
    const covRain = s.incomplete ? 0 : s.sat;
    const cov = s.incomplete ? 0 : supply === 0 ? covRain : supply === Infinity ? 1 : Math.max(covRain, clamp(1 - Math.max(0, need - supply) / Math.max(1, s.etc_mm || 1)));
    let doc = false, risk = false, alert = false;
    if (s.incomplete || s.complete_frac < 0.5) { doc = true; tag('no completa su ciclo con la temperatura estimada (EcoCrop/tiempo térmico)', 'documentado'); }
    if (crop.regime === 'irrigated_required' && supply === 0) { doc = true; tag('el arroz requiere riego/inundación y declaraste secano', 'documentado'); }
    else if (cov < covHard) { risk = true; tag(supply === 0 ? 'la lluvia de la campaña no cubre el cultivo (ETa/ETc < 0,5): riesgo hídrico alto' : 'la dotación declarada no cubre el cultivo (ETa/ETc < 0,5): riesgo hídrico alto', 'metodológico'); }
    if (crop.eco && crop.eco.altmx != null && env.elev > crop.eco.altmx) { doc = true; tag('altitud sobre el máximo EcoCrop de la especie', 'documentado'); }
    if (env.slope != null && env.slope > slopeRisk && coverOf(crop) < 0.5) { risk = true; tag('pendiente > 25 % con cobertura baja: riesgo de erosión alto', 'metodológico'); }
    if (crop.id === 'arroz' && PARAMS.rice_slope_max_pct.value != null && env.slope > PARAMS.rice_slope_max_pct.value) { risk = true; tag('pendiente excesiva para arroz inundado', 'metodológico'); }
    if (crop.ph_abs && env.soil && env.soil.phh2o && env.soil.phh2o.mean != null && (env.soil.phh2o.mean < crop.ph_abs[0] || env.soil.phh2o.mean > crop.ph_abs[1])) { doc = true; tag('pH fuera del rango absoluto de la especie (EcoCrop)', 'documentado'); }
    if (!s.incomplete && s.complete_frac >= 0.5 && s.complete_frac < 0.9) { alert = true; tag('el ciclo se completa en menos del 90 % de los años', 'alerta'); }
    if (s.heat_frac > heatSoft) { alert = true; tag('calor sobre el umbral en la etapa media', 'alerta'); }
    if (!doc && !risk && cov < covSoft) { alert = true; tag('cobertura hídrica < 80 %', 'alerta'); }
    if (crop.ph && env.soil && env.soil.phh2o && env.soil.phh2o.mean != null) { const ph = env.soil.phh2o.mean, d = ph < crop.ph[0] ? crop.ph[0] - ph : ph > crop.ph[1] ? ph - crop.ph[1] : 0; if (d > 0.5) { alert = true; tag('pH fuera del óptimo', 'alerta'); } }
    return { doc, risk, alert, need, cov, dur };
  });
  function v2crop(r) { return r.v.crop; }
  const agg = (key) => { let tot = 0, d = 0, k = 0, a = 0; rows.forEach((r, i) => { const w = r[key]; tot += w; if (cls[i].doc) d += w; else if (cls[i].risk) k += w; else if (cls[i].alert) a += w; }); return tot ? { pDoc: d / tot, pRisk: k / tot, pAlert: a / tot } : { pDoc: 0, pRisk: 0, pAlert: 0 }; };
  const statusOf = (p) => (p.pDoc >= fi ? 'inviable' : (p.pDoc > fc || p.pRisk > fc) ? 'condicionada' : 'favorable');
  const sevOf = (p, st) => (st === 'condicionada' ? ((p.pDoc + p.pRisk) >= 0.8 ? 'alta' : 'moderada') : null);
  const pw = agg('w'), pe = agg('weq'), sw = statusOf(pw), se = statusOf(pe);
  // la clasificación debe resistir el cambio de ponderación de fuentes: si cambia, se toma la más cautelosa
  const rankFull = (st, sev) => (st === 'condicionada' ? (sev === 'alta' ? 2 : 1) : RANK[st]);
  const aw = rankFull(sw, sevOf(pw, sw)), ae = rankFull(se, sevOf(pe, se));
  const finalP = ae > aw ? pe : pw, status = ae > aw ? se : sw, severity = sevOf(finalP, status), sourceDependent = sw !== se || aw !== ae;
  const doc = (crop.local_evidence && crop.local_evidence.campaigns_documented) || null;
  const localEvidence = doc ? doc.includes(baseSlot) : null;
  const use = rows.map((r, i) => ({ r, c: cls[i] })).filter((x) => !x.c.doc && !x.c.risk).length ? rows.map((r, i) => ({ r, c: cls[i] })).filter((x) => !x.c.doc && !x.c.risk) : rows.map((r, i) => ({ r, c: cls[i] }));
  const W = use.map((x) => x.r.w);
  const prim = rows.filter((r) => r.src === env.primary && r.sh === 0 && r.v.cycle === variants[0].cycle && r.v.ts === (variants.find((x) => x.crop.t_stress_max === crop.t_stress_max) || variants[0]).ts)[0] || use[0].r;
  const demand = rows.map((r, i) => ({ r, c: cls[i] })).filter((x) => !x.r.s.incomplete), DW = demand.map((x) => x.r.w); // la DEMANDA no depende de que la campaña sea viable
  const lo = (r, pcLo) => netNeed(r.v.crop, r.s, crop.id === 'arroz' ? pcLo : 0, crop.id === 'arroz' ? PARAMS.rice_sat_mm.range[0] : 0), hi = (r, pcHi) => netNeed(r.v.crop, r.s, crop.id === 'arroz' ? pcHi : 0, crop.id === 'arroz' ? PARAMS.rice_sat_mm.range[1] : 0);
  const pLo = Math.min(...pinf.set), pHi = Math.max(...pinf.set);
  const pr = rows.filter((r) => r.src === env.primary && r.sh === 0), cl = pr.map((r) => cls[rows.indexOf(r)]);
  const rng = (a) => (a.length ? [Math.min(...a), Math.max(...a)] : null);
  const unc = [];
  if (variants.length > 1) {
    const cs = [...new Set(variants.map((x) => x.cycle))], ts = [...new Set(variants.map((x) => x.ts))];
    if (cs.length > 1) unc.push({ param: 'ciclo (días)', range: [Math.min(...cs), Math.max(...cs)], cat: 'E' });
    if (ts.length > 1) unc.push({ param: 'umbral de calor (°C)', range: [Math.min(...ts), Math.max(...ts)], cat: 'E' });
  }
  if (crop.id === 'arroz' && pinf.set.length > 1) unc.push({ param: 'percolación (mm/d)', range: [pLo, pHi], cat: pinf.cat });
  return {
    crop: crop.id, slot: slot.id, base_slot: baseSlot, status, severity, p_doc: +finalP.pDoc.toFixed(2), p_risk: +finalP.pRisk.toFixed(2), p_fail: +(finalP.pDoc + finalP.pRisk).toFixed(2), p_alert: +finalP.pAlert.toFixed(2),
    reasons, reason_basis: basis, local_evidence: localEvidence, source_dependent: sourceDependent, uncertainty: unc, n_draws: rows.length,
    m: { dur: wmed(use.map((x) => x.c.dur), W), etc: wmed(use.map((x) => x.r.s.etc_mm || 0), W), rain: wmed(use.map((x) => x.r.s.rain_mm || 0), W), need: wmed(demand.map((x) => x.c.need), DW),
      need_range: [Math.min(...demand.map((x) => lo(x.r, pLo))), Math.max(...demand.map((x) => hi(x.r, pHi)))],
      heat: wmean(use.map((x) => x.r.s.heat_frac), W), heat_range: rng(pr.map((r) => r.s.heat_frac)), dur_range: rng(pr.map((r) => r.s.dur_days ?? r.s.max_days).filter(Number.isFinite)),
      cov: wmean(use.map((x) => x.c.cov), W), complete: wmean(use.map((x) => x.r.s.complete_frac), W), tmean: wmean(use.map((x) => x.r.s.tmean || 0), W), early: wmean(use.map((x) => x.r.s.heavy_early_mm || 0), W), prim: prim ? prim.s : null },
  };
}

/** Unión de dos evaluaciones del mismo cultivo/campaña bajo escenarios de riego distintos (riego no declarado). */
function mergeUnknownIrrigation(full, none) {
  const rk = (v) => (v.status === 'condicionada' ? (v.severity === 'alta' ? 2 : 1) : RANK[v.status]);
  if (rk(none) <= rk(full)) return full;
  const first = Object.keys(none.reasons)[0] || 'sin riego la campaña no es viable';
  return { ...full, status: full.status === 'favorable' ? 'condicionada' : full.status, severity: full.status === 'favorable' ? 'moderada' : full.severity,
    reasons: { ...full.reasons, [`depende de que dispongas de riego (no declarado): ${first}`]: 1 }, reason_basis: { ...full.reason_basis, [`depende de que dispongas de riego (no declarado): ${first}`]: 'escenario' }, irrigation_dependent: true, status_without_irrigation: none.status };
}

/** Métricas por fuente de lluvia para una campaña (dT = 0), usadas en la etapa 2. */
function campaignOn(env, crop, slot, climId, perc, sat, supply) {
  const s = seasonOf(env, climId, crop, slot, 0, 0) || { incomplete: true, sat: 0, deficit_mm: 0, etc_mm: 0, rain_mm: 0, heat_frac: 0, heavy_early_mm: 0, tmean: NaN, dur_days: null, max_days: slot.window_days, complete_frac: 0 };
  const need = netNeed(crop, s, perc, sat);
  const cov = s.incomplete ? 0 : supply === 0 ? s.sat : supply === Infinity ? null : Math.max(s.sat, clamp(1 - Math.max(0, need - supply) / Math.max(1, s.etc_mm || 1)));
  const cycle = s.dur_days ?? s.max_days, win = slot.window_days, gap = Math.max(0, win - cycle);
  const eff = (coverOf(crop) * cycle + 0.25 * crop.biomass * gap) / win;
  const slopeF = env.slope == null ? 0.4 : Math.min(1, env.slope / 30), earlyF = Math.min(1, (s.heavy_early_mm || 0) / 120);
  const erosion = (0.3 + 0.7 * slopeF) * (0.3 + 0.7 * earlyF) * (1 - eff);
  let soilFit = null;
  if (env.soil && env.soil.phh2o && env.soil.phh2o.mean != null) { const ph = env.soil.phh2o.mean, r = crop.ph, d = ph < r[0] ? r[0] - ph : ph > r[1] ? ph - r[1] : 0; soilFit = clamp(1 - d / 1.0) * (env.clayHigh ? 1 - 0.3 * crop.waterlog_sens : 1); }
  return { s, need, cov, cycle, gap, erosion, soilFit, heat: s.heat_frac || 0, eff };
}

/** Economía declarada: margen por campaña si hay rendimiento, precio y al menos un costo del cultivo. */
function economicsFor(crop, e) {
  const d = e && e[crop.id];
  if (!d) return { complete: false, missing: ['rendimiento', 'precio', 'costos'] };
  const miss = []; if (!(d.yield_t_ha > 0)) miss.push('rendimiento'); if (!(d.price_s_per_kg > 0)) miss.push('precio'); if (!(d.cost_establishment_s_ha >= 0) && !(d.cost_irrigation_s_ha >= 0) && !(d.cost_other_s_ha >= 0)) miss.push('costos');
  if (miss.length) return { complete: false, missing: miss };
  const rev = d.yield_t_ha * 1000 * d.price_s_per_kg, cost = (d.cost_establishment_s_ha || 0) + (d.cost_irrigation_s_ha || 0) + (d.cost_other_s_ha || 0);
  return { complete: true, revenue: rev, cost, margin: rev - cost };
}

function groupWeights(prio) {
  const p = Object.assign({ protect_soil: 3, water: 3, resilience: 3, pests: 3, income: 3, low_cost: 3 }, prio || {});
  return { protect_soil: Math.max(0.25, p.protect_soil), water: Math.max(0.25, p.water), resilience: Math.max(0.25, p.resilience), pests: Math.max(0.25, p.pests), income: Math.max(0.25, p.income) };
}

/** Puntaje de una secuencia ya validada. Los criterios sin datos se omiten (no se rellenan). */
function scoreSeq(env, seq, m, ctx, w0, ords) {
  const crops = ords || env.crops, sc = {}, w = {};
  const hasCov = m.every((x) => x.cov != null);
  sc.water_use = clamp(1 - mean(m.map((x) => x.need)) / ctx.maxNeed);
  if (hasCov) sc.water_cover = mean(m.map((x) => x.cov));
  sc.heat = clamp(1 - mean(m.map((x) => x.heat)) / 0.25);
  sc.erosion = clamp(1 - mean(m.map((x) => x.erosion)) / 0.5);
  sc.soil_n = (mean(seq.map((c) => crops[c].n_balance)) + 2) / 4;
  if (m.every((x) => x.soilFit != null)) sc.soil_fit = mean(m.map((x) => x.soilFit));
  const chain = [...ctx.hist, ...seq]; let pen = 0;
  for (let i = 1; i < chain.length; i++) { const a = crops[chain[i - 1]], b = crops[chain[i]]; if (!a || !b) continue; if (a.id === b.id) pen += pv('rot_same_crop', env.ov); else if (a.family === b.family) pen += pv('rot_same_family', env.ov); }
  sc.rotation = clamp(0.7 - pen + 0.1 * (new Set(seq.map((c) => crops[c].family)).size - 1));
  if (ctx.econ) { const mg = seq.reduce((a, c) => a + ctx.econ[c].margin, 0); sc.economics = ctx.maxMargin > ctx.minMargin ? (mg - ctx.minMargin) / (ctx.maxMargin - ctx.minMargin) : 0.5; }
  else if (env.input.market_pref && Object.keys(env.input.market_pref).length) sc.market = mean(seq.map((c) => (((env.input.market_pref[c] ?? 3) - 1) / 4)));
  const g = w0;
  const split = (k, parts) => { const live = parts.filter((p) => sc[p.k] != null); const tot = live.reduce((a, p) => a + p.f, 0); live.forEach((p) => { w[p.k] = (w[p.k] || 0) + g[k] * p.f / tot; }); };
  split('water', [{ k: 'water_use', f: 0.5 }, { k: 'water_cover', f: 0.5 }]);
  split('resilience', [{ k: 'heat', f: 1 }]);
  split('protect_soil', [{ k: 'erosion', f: 0.4 }, { k: 'soil_n', f: 0.4 }, { k: 'soil_fit', f: 0.2 }]);
  split('pests', [{ k: 'rotation', f: 1 }]);
  if (sc.economics != null) split('income', [{ k: 'economics', f: 1 }]); else if (sc.market != null) split('income', [{ k: 'market', f: 1 }]);
  const ws = Object.values(w).reduce((a, b) => a + b, 0);
  const total = ws ? 100 * Object.keys(w).reduce((a, k) => a + w[k] * sc[k], 0) / ws : 0;
  return { sc, w: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / ws])), total };
}

const CRIT_LABEL = { water_use: 'Demanda de agua (menor es mejor)', water_cover: 'Cobertura hídrica con tu dotación', heat: 'Estrés por calor en etapa media', erosion: 'Riesgo de erosión y suelo cubierto', soil_n: 'Nitrógeno del suelo (cualitativo)', soil_fit: 'Aptitud de suelo (pH, encharcamiento)', rotation: 'Rotación (repetición de cultivo/familia)', economics: 'Margen económico declarado', market: 'Preferencia de mercado declarada' };

function projectCurrent(history, n = 4) {
  const h = history.length; let p = h;
  for (let q = 1; q < h; q++) { let ok = true; for (let i = q; i < h; i++) if (history[i] !== history[i - q]) { ok = false; break; } if (ok) { p = q; break; } }
  return Array.from({ length: n }, (_, i) => history[(h + i) % p]);
}
const hamming = (a, b) => a.reduce((d, x, i) => d + (x !== b[i] ? 1 : 0), 0);

function keepOk(seq, order, keep) {
  if (!keep || !keep.crop) return true;
  const base = (s) => s; // 'F' (siembra declarada) conserva la campaña de referencia en `slot.base`
  if (Array.isArray(keep.campaigns) && keep.campaigns.length) { for (let i = 0; i < 4; i++) if (keep.campaigns.includes(base(order[i])) && seq[i] !== keep.crop) return false; }
  if (keep.min_campaigns) return seq.filter((c) => c === keep.crop).length >= keep.min_campaigns;
  return true;
}

function run(input, data, ov) {
  const env = buildEnv(input, data, ov);
  const history = (input.history || []).filter(Boolean);
  if (!history.length) throw new Error('Se requiere al menos un cultivo en el historial.');
  for (const h of history) if (!env.crops[h]) throw new Error(`Cultivo desconocido en historial: ${h}`);
  const supply = supplyFor(input), order = env.slotOrder, pinf = percInfo(env, ov), perc = pinf.central, sat = pv('rice_sat_mm', ov);
  const slotIds = [...new Set(order)];
  const baseOf = (sid) => (env.slotById[sid].base || sid);
  // keep_main usa la campaña de referencia ('A'/'B'): se traduce el orden
  const orderBase = order.map(baseOf);

  // ---- etapa 1
  const V = {};
  for (const c of env.cropList) {
    V[c.id] = {};
    for (const sid of slotIds) {
      let v = viability(env, c, env.slotById[sid], supply.mm, ov);
      if (supply.unknown) v = mergeUnknownIrrigation(v, viability(env, c, env.slotById[sid], 0, ov));
      V[c.id][sid] = v;
    }
  }
  const eligibility = order.map((sid) => ({ slot: baseOf(sid), ok: env.cropList.filter((c) => V[c.id][sid].status !== 'inviable').map((c) => c.id), conditioned: env.cropList.filter((c) => V[c.id][sid].status === 'condicionada').map((c) => c.id), blocked: Object.fromEntries(env.cropList.filter((c) => V[c.id][sid].status === 'inviable').map((c) => [c.id, Object.keys(V[c.id][sid].reasons).slice(0, 3)])) }));

  // ---- enumeración y filtros
  const all = []; (function rec(i, acc) { if (i === 4) { all.push([...acc]); return; } for (const c of env.cropList) { acc.push(c.id); rec(i + 1, acc); acc.pop(); } })(0, []);
  const dropped = {}; const drop = (k) => { dropped[k] = (dropped[k] || 0) + 1; };
  const keep = input.keep_main && input.keep_main.crop && env.crops[input.keep_main.crop] ? input.keep_main : null;
  const viable = [];
  for (const seq of all) {
    const bad = seq.findIndex((cid, i) => V[cid][order[i]].status === 'inviable');
    if (bad >= 0) { drop(`${env.crops[seq[bad]].name} en la campaña ${orderBase[bad] === 'A' ? 'grande' : 'chica'}: ${Object.keys(V[seq[bad]][order[bad]].reasons)[0] || 'inviable'}`); continue; }
    if (!keepOk(seq, orderBase, keep)) { drop(`no conserva ${env.crops[keep.crop].name} como pediste`); continue; }
    viable.push(seq);
  }

  // ---- etapa 2
  const cropFor = (cid, cv) => (cv && cv[cid]) || env.crops[cid];
  const metricsFor = (seq, climId, p, st, cv) => seq.map((cid, i) => campaignOn(env, cropFor(cid, cv), env.slotById[order[i]], climId, p, st, supply.mm));
  const maxNeedOf = (p, st) => Math.max(1, ...env.cropList.flatMap((c) => slotIds.map((sid) => netNeed(c, V[c.id][sid].m.prim || { deficit_mm: V[c.id][sid].m.need, dur_days: V[c.id][sid].m.dur }, p, st))));
  const econ = (() => { const e = input.economics; if (!e) return null; const per = Object.fromEntries(env.cropList.map((c) => [c.id, economicsFor(c, e)])); return Object.values(per).every((x) => x.complete) ? per : null; })();
  const econReport = (() => { const e = input.economics; return { provided: !!e, complete: !!econ, per_crop: Object.fromEntries(env.cropList.map((c) => [c.id, economicsFor(c, e)])), note: econ ? 'Márgenes calculados con los datos que declaraste (no verificados); no son rendimientos validados para Morropón.' : 'Comparación económica incompleta: faltan datos del agricultor; el puntaje no incluye ingreso.' }; })();
  const w0 = groupWeights(input.priorities);
  const mkCtx = (p, st, e2) => { const mg = e2 ? Object.values(e2).map((x) => x.margin) : null; return { maxNeed: maxNeedOf(p, st), hist: history.slice(-1), econ: e2, maxMargin: mg ? 4 * Math.max(...mg) : 0, minMargin: mg ? 4 * Math.min(...mg) : 0 }; };
  const ctx0 = mkCtx(perc, sat, econ);
  const evalAll = (seq) => { const per = {}; for (const c of env.climates) { const m = metricsFor(seq, c.id, perc, sat); per[c.id] = { m, ...scoreSeq(env, seq, m, ctx0, w0) }; } return per; };
  const level = (v) => (v.status === 'condicionada' ? (v.severity === 'alta' ? 2 : 1) : 0);
  const scored = viable.map((seq) => {
    const per = evalAll(seq), totals = Object.fromEntries(env.climates.map((c) => [c.id, per[c.id].total]));
    const lv = seq.map((cid, i) => level(V[cid][order[i]]));
    return { seq, per, totals, primary: totals[env.primary], worst: Math.min(...Object.values(totals)), conds: lv.reduce((a, b) => a + b, 0), altas: lv.filter((x) => x === 2).length, undocumented: seq.filter((cid, i) => V[cid][order[i]].local_evidence === false).length };
  });
  const tie = pv('tie_margin', ov);
  scored.sort((a, b) => a.conds - b.conds || ((Math.abs(b.primary - a.primary) < tie) ? a.undocumented - b.undocumented : 0) || b.primary - a.primary);
  // una campaña de riesgo ALTO no se propone como alternativa mientras exista otra opción
  const recommendable = scored.filter((c) => c.altas === 0);

  const curSeq = projectCurrent(history), curKey = curSeq.join('|');
  const curViab = curSeq.map((cid, i) => V[cid][order[i]]);
  const curPer = evalAll(curSeq), curTotals = Object.fromEntries(env.climates.map((c) => [c.id, curPer[c.id].total]));
  const pool = recommendable.filter((c) => c.seq.join('|') !== curKey);
  const altA = pool[0] || null;
  const rest = altA ? pool.filter((c) => c.conds <= altA.conds && hamming(c.seq, altA.seq) >= 2).sort((a, b) => b.worst - a.worst) : [];
  const altB = altA ? (rest[0] || pool[1] || null) : null;

  // ---- sensibilidad (Monte Carlo reproducible): pesos, ordinales, percolación/saturación, fuente de lluvia y PARÁMETROS INCIERTOS DEL CULTIVO
  const rnd = mulberry32(20261115), gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()), U = (h) => (2 * rnd() - 1) * h;
  const N = 300, acc = { aTop: 0, aBeatsCur: 0, bBeatsCur: 0, aBeatsB: 0, dAC: [], dAB: [], dBC: [] };
  const cands = recommendable.slice(0, 40); if (altA && !cands.includes(altA)) cands.push(altA); if (altB && !cands.includes(altB)) cands.push(altB);
  const vcache = Object.fromEntries(env.cropList.map((c) => [c.id, variantsFor(env, c, ov).map((x) => x.crop)]));
  for (let n = 0; n < N; n++) {
    const wd = {}; for (const k of Object.keys(w0)) wd[k] = w0[k] * Math.exp(0.35 * gauss());
    const crops2 = Object.fromEntries(Object.entries(env.crops).map(([id, c]) => [id, { ...c, n_balance: clamp(c.n_balance + U(0.5), -2, 2) }]));
    const p2 = pinf.set.length > 1 ? Math.min(...pinf.set) + rnd() * (Math.max(...pinf.set) - Math.min(...pinf.set)) : pinf.central;
    const s2 = PARAMS.rice_sat_mm.range[0] + rnd() * (PARAMS.rice_sat_mm.range[1] - PARAMS.rice_sat_mm.range[0]);
    const cv = Object.fromEntries(env.cropList.map((c) => { const vs = vcache[c.id]; return [c.id, vs[Math.floor(rnd() * vs.length)]]; })); // ciclo y umbral de calor al azar dentro de su rango
    const climId = env.climates[Math.floor(rnd() * env.climates.length)].id, ctx2 = mkCtx(p2, s2, econ);
    const tot = (seq) => { const m = metricsFor(seq, climId, p2, s2, cv); return scoreSeq(env, seq, m, ctx2, wd, crops2).total; };
    let best = null, bt = -1; for (const c of cands) { const t = tot(c.seq) - 100 * c.conds; if (t > bt) { bt = t; best = c; } }
    if (best === altA) acc.aTop++;
    const tc = tot(curSeq), ta = altA ? tot(altA.seq) : 0, tb = altB ? tot(altB.seq) : 0;
    if (ta > tc) acc.aBeatsCur++; if (tb > tc) acc.bBeatsCur++; if (ta > tb) acc.aBeatsB++;
    acc.dAC.push(ta - tc); acc.dAB.push(ta - tb); acc.dBC.push(tb - tc);
  }
  const q = (a, p) => { const x = [...a].sort((m, n2) => m - n2); return x[Math.min(x.length - 1, Math.floor(p * x.length))]; };
  const verdict = (pFirst, deltas, nameA, nameB) => {
    const md = q(deltas, 0.5);
    if (Math.abs(md) < 2) return { text: `${nameA} y ${nameB} son prácticamente equivalentes (diferencia mediana ${md.toFixed(1)} puntos).`, level: 'equivalentes' };
    const win = md > 0 ? nameA : nameB, p = md > 0 ? pFirst : 1 - pFirst;
    if (p >= 0.9) return { text: `${win} es claramente preferible (gana en ${Math.round(p * 100)} % de los sorteos).`, level: 'claramente_preferible' };
    if (p >= 0.7) return { text: `${win} es probablemente preferible (gana en ${Math.round(p * 100)} % de los sorteos).`, level: 'probablemente_preferible' };
    return { text: `No hay una preferencia clara entre ${nameA} y ${nameB} con la incertidumbre actual (${nameA} gana en ${Math.round(pFirst * 100)} % de los sorteos).`, level: 'indistinguibles' };
  };
  const cmp = (p, d, a, b) => ({ ...verdict(p, d, a, b), p_first: +p.toFixed(2), delta_p05_p50_p95: [q(d, 0.05), q(d, 0.5), q(d, 0.95)].map((x) => +x.toFixed(1)) });
  const comparisons = {};
  if (altA) comparisons.a_vs_current = cmp(acc.aBeatsCur / N, acc.dAC, 'La alternativa A', 'tu rotación actual');
  if (altB) { comparisons.b_vs_current = cmp(acc.bBeatsCur / N, acc.dBC, 'La alternativa B', 'tu rotación actual'); comparisons.a_vs_b = cmp(acc.aBeatsB / N, acc.dAB, 'La alternativa A', 'la alternativa B'); }
  const sensitive = !!altA && (acc.aTop / N < 0.6 || (comparisons.a_vs_current && comparisons.a_vs_current.level === 'indistinguibles') || recommendable.some((c) => c.conds > 0) && altA.conds > 0);

  // ---- descripción
  const describe = (id, label, seq, per, totals, extra = {}) => describeStrategy(env, V, order, id, label, seq, per, totals, { perc, sat, supply, econ, ctx0, w0 }, extra);
  const curViol = []; curSeq.forEach((cid, i) => { const v = curViab[i]; if (v.status === 'inviable') curViol.push(`Campaña ${i + 1} (${env.crops[cid].name}): ${Object.keys(v.reasons).slice(0, 2).join('; ')}`); });
  const strategies = [describe('current', history.length > 1 ? 'Tu rotación actual (proyectada)' : 'Tu cultivo actual (proyectado: se supone que continúas con el mismo)', curSeq, curPer, curTotals, { violations: curViol, viability_note: curViab.some((v) => v.status === 'inviable') ? 'Tu rotación actual incluye campañas que los datos consideran inviables.' : null })];
  if (altA) strategies.push(describe('alt_a', 'Alternativa A · mejor puntaje entre las opciones viables', altA.seq, altA.per, altA.totals, { top_freq: acc.aTop / N, beats_current: acc.aBeatsCur / N, sensitive_to_assumptions: sensitive }));
  if (altB) strategies.push(describe('alt_b', 'Alternativa B · opción distinta y más robusta', altB.seq, altB.per, altB.totals, { beats_current: acc.bBeatsCur / N }));

  const noViable = !altA ? buildNoViable(env, V, order, supply, dropped, keep, scored.length > 0) : null;
  const limitations = [];
  if (!altA) limitations.push(noViable ? noViable.summary : 'No se encontró ninguna alternativa distinta de tu rotación actual con los datos disponibles.');
  else if (!altB) limitations.push('Solo hay una alternativa viable distinta de la actual: las condiciones limitan las opciones.');

  const used = inputsUsed(env, input, supply, pinf, econ, keep);
  const res = {
    engine_version: ENGINE_VERSION, generated_at: new Date().toISOString(), engine: 'v2',
    candidates_total: all.length, candidates_viable: viable.length, candidates_recommendable: recommendable.length, candidates_dropped: dropped,
    viability: Object.fromEntries(env.cropList.map((c) => [c.id, Object.fromEntries(slotIds.map((sid) => { const v = V[c.id][sid]; return [baseOf(sid) === sid ? sid : 'F', { status: v.status, severity: v.severity, basis: v.reason_basis, p_fail: v.p_fail, p_doc: v.p_doc, p_risk: v.p_risk, p_alert: v.p_alert, reasons: v.reasons, local_evidence: v.local_evidence, source_dependent: v.source_dependent, irrigation_dependent: !!v.irrigation_dependent, uncertainty: v.uncertainty, base_slot: baseOf(sid), duration_days: v.m.dur, duration_range_days: v.m.dur_range, etc_mm: Math.round(v.m.etc), rain_mm: Math.round(v.m.rain), net_water_need_mm: Math.round(v.m.need), net_water_need_range_mm: v.m.need_range.map(Math.round), heat_frac: +v.m.heat.toFixed(2), heat_range: v.m.heat_range ? v.m.heat_range.map((x) => +x.toFixed(2)) : null, tmean_c: +v.m.tmean.toFixed(1) }]; }))])),
    eligibility, strategies, no_viable: noViable, limitations, sensitive_to_assumptions: sensitive,
    water_scenarios: supply.unknown ? [
      { id: 'con_riego', label: 'Escenario: con riego sin límite (NO es una condición declarada de tu parcela)', used_for: 'puntaje y orden de las secuencias' },
      { id: 'sin_riego', label: 'Escenario: sin riego (NO es una condición declarada de tu parcela)', used_for: 'marcar como condicionado lo que depende del riego',
        status_by_crop: Object.fromEntries(env.cropList.map((c) => [c.id, Object.fromEntries(slotIds.map((sid) => [baseOf(sid), V[c.id][sid].status_without_irrigation || V[c.id][sid].status]))])) },
    ] : null,
    water: { supply_basis: supply.basis, supply_category: supply.cat, scenario: !!supply.unknown, supply_mm_per_campaign: supply.mm === Infinity ? null : supply.mm, rice_percolation_mm_day: perc, rice_percolation_range: [Math.min(...pinf.set), Math.max(...pinf.set)], rice_percolation_basis: pinf.basis, rice_saturation_mm: sat },
    economics: econReport, keep_main: keep, first_sowing: env.firstSowing,
    engine_params: Object.entries(PARAMS).map(([k, p]) => ({ id: k, value: p.value, range: p.range || null, cat: p.cat, status: p.status, source: p.source })),
    inputs_used: used,
    source_weights: env.sourceWeights ? { ...env.sourceWeights, basis: 'estimadas: 1/RMSE² mensual frente a SENAMHI Morropón 2001-2014 (docs/VALIDACION_FUENTES_SENAMHI.md); NO validadas para 2015-2023: la clasificación se comprueba también con pesos iguales' } : { basis: 'pesos iguales (sin calibración disponible)' },
    weights: Object.fromEntries(Object.entries(w0).map(([k, v]) => [k, +v.toFixed(3)])), weighting_model: 'v2: prioridades repartidas entre criterios sin duplicar', weights_status: 'PROVISIONALES: derivadas de las prioridades del agricultor (neutras = 3 si no se declaran); no calibradas con datos de campaña.',
    sensitivity: { draws: N, perturbation: 'pesos × exp(N(0,0.35²)); N ordinal ±0,5; percolación y saturación del arroz dentro del rango FAO (o la declarada); ciclo y umbral de calor dentro de su rango de incertidumbre; fuente de lluvia al azar; semilla fija', comparisons, alt_a_is_top: acc.aTop / N, alt_a_beats_current: acc.aBeatsCur / N, alt_b_beats_current: acc.bBeatsCur / N,
      note: 'La estabilidad del ranking mide la sensibilidad a la incertidumbre declarada; NO es validación agronómica.' },
    robustness: { by_source: env.climates.map((c) => ({ source: c.id, label: c.label, role: c.role, totals: Object.fromEntries(strategies.map((s) => [s.id, s.totals_by_source[c.id]])), annual_precip_mm: c.climate.annual.precip_mm })), note: 'Los productos de lluvia discrepan; la viabilidad propaga ese desacuerdo en vez de elegir una fuente.' },
    context: { slope_pct: env.slope, soil: env.soil, irrigated: supply.mm !== 0, irrigation_declared: input.irrigation === true || input.irrigation === false, start_slot: input.start_slot || 'A', history, first_sowing_date: env.firstSowing ? env.firstSowing.date : null },
  };
  res.provenance = buildProvenance(env, res, supply, pinf);
  return res;
}

/** Qué datos declarados se usaron y para qué (los campos que no se usan no deben aparecer como «aplicados»). */
function inputsUsed(env, input, supply, pinf, econ, keep) {
  const u = [];
  const add = (field, value, usedFor) => u.push({ field, value, used_for: usedFor });
  if (input.irrigation === true || input.irrigation === false) add('riego', input.irrigation ? 'sí' : 'no', input.irrigation ? 'habilita el arroz y evalúa agua' : 'el arroz queda inviable y se evalúa la lluvia sola');
  if (input.water && input.water.supply_m3_ha != null) add('agua por campaña', `${input.water.supply_m3_ha} m³/ha`, 'cobertura hídrica y viabilidad de cada cultivo con esa dotación');
  if (input.water && input.water.percolation_mm_day != null) add('percolación del arroz', `${input.water.percolation_mm_day} mm/d`, 'demanda de riego del arroz');
  if (input.soil && input.soil.texture) add('textura del suelo', TEXTURE[input.soil.texture] ? TEXTURE[input.soil.texture].label : input.soil.texture, 'capacidad de agua útil, encharcamiento y percolación del arroz');
  if (input.soil && input.soil.ph != null) add('pH del suelo', input.soil.ph, 'aptitud de suelo y límites de la especie (sustituye a SoilGrids)');
  if (env.firstSowing) add('fecha prevista de siembra', env.firstSowing.date, 'ventana de la primera campaña (clima, agua y calor de esas fechas)');
  if (input.cycle_days) for (const [c, d] of Object.entries(input.cycle_days)) if (d != null) add(`ciclo del ${env.crops[c] ? env.crops[c].name : c}`, `${d} d`, 'duración, agua, calor y suelo desnudo (fija el valor; deja de usarse el rango)');
  if (keep) add('cultivo principal a conservar', env.crops[keep.crop].name, 'restringe las secuencias comparadas');
  if (econ) add('datos económicos', 'completos', 'criterio de margen en el puntaje'); else if (input.economics) add('datos económicos', 'incompletos', 'no puntúan (se informa lo que falta)');
  if (prioritiesDeclared(input.priorities)) add('prioridades', 'declaradas', 'pesos del puntaje');
  return u;
}

/** Las prioridades «neutras» (todas = 3) no son una declaración: solo se consideran declaradas si alguna difiere. */
const prioritiesDeclared = (p) => !!p && Object.values(p).some((v) => Number(v) !== 3);
const CATNAME = { A: 'observado', B: 'bibliográfico', C: 'declarado', D: 'estimado', E: 'hipótesis' };
/** Procedencia de los datos que realmente intervinieron en ESTA recomendación. */
function buildProvenance(env, res, supply, pinf) {
  const it = [];
  const add = (id, label, value, cat, source, note) => it.push({ id, label, value, cat, cat_name: CATNAME[cat], source, ...(note ? { note } : {}) });
  const inp = env.input;
  add('riego', 'Disponibilidad de riego', supply.unknown ? 'no declarada → escenario con riego' : inp.irrigation === false ? 'no' : 'sí', supply.cat, supply.basis, supply.unknown ? 'Lo que depende del riego se marca como condicionado.' : null);
  if (supply.mm !== Infinity && supply.mm !== 0) add('dotacion', 'Agua por campaña', `${Math.round(supply.mm * 10)} m³/ha`, 'C', 'declarada por el agricultor; no verificada');
  add('percolacion', 'Percolación del arroz', `${pinf.central} mm/d (rango ${Math.min(...pinf.set)}–${Math.max(...pinf.set)})`, pinf.cat, pinf.basis);
  add('campanas', 'Fechas de campaña', env.firstSowing ? `1.ª campaña: ${env.firstSowing.date}` : 'grande ≈ 21 ene · chica ≈ 15 jul', env.firstSowing ? 'C' : 'B', env.firstSowing ? 'fecha prevista declarada (solo la primera campaña)' : 'fechas de referencia documentadas (SENAMHI 2026 y 2024); no son un calendario fijo');
  for (const c of env.cropList) {
    const decl = inp.cycle_days && inp.cycle_days[c.id], obs = c.id === 'arroz' && !decl;
    add(`ciclo_${c.id}`, `Ciclo del ${c.name}`, decl ? `${decl} d` : c.id === 'loctao' ? 'rango 59–90 d' : `${cycleLength(c)} d`, decl ? 'C' : c.id === 'loctao' ? 'E' : 'A', decl ? 'declarado por el agricultor' : c.id === 'loctao' ? '54 d observados (SENAMHI 2024) + 5 d estimados; 75–90 d en prensa sin base de conteo: se propaga el rango' : 'observado: SENAMHI Morropón 2026 (una temporada)');
    add(`calor_${c.id}`, `Umbral de calor del ${c.name}`, c.id === 'loctao' ? 'rango 32–38 °C' : 'rango 33–37 °C', 'E', 'hipótesis: sin umbral citable único; se propaga el rango');
  }
  add('lluvia', 'Lluvia', 'IMERG (principal) + ERA5 y POWER como escenarios', 'D', 'pesos estimados con SENAMHI 2001–2014 (no validados en 2015–2023); la clasificación se comprueba con pesos iguales');
  add('temperatura', 'Temperatura', 'ERA5-Land + offsets mensuales', 'D', 'calibrada con SENAMHI Morropón 2001–2014 (mejora fuera de muestra)');
  add('calor_obs', 'Frecuencia de días calurosos', 'estación SENAMHI 1981–2014', 'A', 'frecuencia observada por día del año; se transfiere al punto con gradiente térmico (estimación)');
  const sd = inp.soil || {};
  add('ph', 'pH del suelo', env.soil && env.soil.phh2o && env.soil.phh2o.mean != null ? env.soil.phh2o.mean.toFixed(2) : 'sin dato', sd.ph != null ? 'C' : 'D', sd.ph != null ? 'declarado (análisis del agricultor); no verificado' : 'SoilGrids 250 m: estimación modelada, no una medición de tu parcela');
  add('textura', 'Textura del suelo', sd.texture ? TEXTURE[sd.texture].label : env.clayHigh ? 'arcillosa (SoilGrids)' : 'estimada por SoilGrids', sd.texture ? 'C' : 'D', sd.texture ? 'declarada por el agricultor' : 'SoilGrids (modelado)');
  add('relieve', 'Altitud y pendiente', `${Math.round(env.elev)} m · ${env.slope != null ? env.slope.toFixed(1) : '—'} %`, 'D', 'SRTM 30 m en el punto elegido (estimación)');
  add('ordinales', 'Cobertura, biomasa y nitrógeno de los cultivos', 'escalas ordinales', 'E', 'criterio del equipo, sin cantidades físicas');
  add('rotacion', 'Penalización por repetir cultivo', `${PARAMS.rot_same_crop.value} / ${PARAMS.rot_same_family.value}`, 'E', 'supuesto del equipo; sin cuantificación');
  add('umbrales', 'Umbrales de clasificación', `inviable ≥ ${PARAMS.fail_inviable.value} · condicionada > ${PARAMS.fail_conditional.value}`, 'E', 'metodológicos; «inviable» solo por límites documentados; los umbrales metodológicos dan «condicionada»');
  add('prioridades', 'Prioridades', prioritiesDeclared(inp.priorities) ? 'declaradas' : 'neutras (no declaradas)', prioritiesDeclared(inp.priorities) ? 'C' : 'E', prioritiesDeclared(inp.priorities) ? 'declaradas por el agricultor' : 'peso igual para todas las prioridades');
  if (res.economics.provided || res.economics.complete) add('economia', 'Datos económicos', res.economics.complete ? 'completos' : 'incompletos', 'C', 'declarados por el agricultor; no verificados');
  const sum = {}; it.forEach((x) => { sum[x.cat] = (sum[x.cat] || 0) + 1; });
  return { items: it, summary: sum, legend: CATNAME };
}

function describeStrategy(env, V, order, id, label, seq, per, totals, X, extra) {
  const P = per[env.primary];
  const timeline = seq.map((cid, i) => {
    const crop = env.crops[cid], slot = env.slotById[order[i]], v = V[cid][order[i]], m = P.m[i], start = slot.start, base = slot.base || slot.id;
    const yearOffset = Math.floor((i + (order[0] === 'B' || (env.firstSowing && env.firstSowing.base === 'B') ? 1 : 0)) / 2);
    return {
      campaign: i + 1, slot: base, slot_label: slot.label, year_offset: yearOffset, crop: cid, crop_name: crop.name, family: crop.family, cycle_days: cycleLength(crop), cycle_days_effective: cycleLength(crop),
      duration_days: v.m.dur, duration_range_days: v.m.dur_range, sowing_md: `${String(start.m).padStart(2, '0')}-${String(start.d).padStart(2, '0')}`, sowing_declared: !!slot.declared,
      etc_mm: Math.round(v.m.etc), rain_mm: Math.round(v.m.rain), water_need_mm: Math.round(v.m.need), water_need_range_mm: v.m.need_range.map(Math.round), water_deficit_mm: Math.round(m.s.deficit_mm || 0),
      water_coverage_pct: m.cov == null ? null : Math.round(m.cov * 100), drought_year_frac: 0, heat_stress_frac: +v.m.heat.toFixed(2), heat_range: v.m.heat_range ? v.m.heat_range.map((x) => +x.toFixed(2)) : null, tmean_c: Number.isFinite(v.m.tmean) ? +v.m.tmean.toFixed(1) : null,
      thermal: { complete_frac: +v.m.complete.toFixed(2), complete_frac_cold: +v.m.complete.toFixed(2), status: v.status === 'inviable' ? 'no_viable' : v.status === 'favorable' ? 'viable' : 'marginal' },
      bare_soil_pct: Math.round(100 * m.gap / slot.window_days), eff_cover_pct: Math.round(100 * m.eff),
      viability: { status: v.status, severity: v.severity || null, p_fail: v.p_fail, alerts: v.p_alert, reasons: v.reasons, basis: v.reason_basis, local_evidence: v.local_evidence, source_dependent: v.source_dependent, irrigation_dependent: !!v.irrigation_dependent, uncertainty: v.uncertainty },
    };
  });
  const criteria = {}; for (const k of Object.keys(P.sc)) criteria[k] = { label: CRIT_LABEL[k], score: +P.sc[k].toFixed(3), weight: +(P.w[k] || 0).toFixed(3) };
  const reasons = [], risks = [];
  timeline.forEach((t) => {
    const v = t.viability, where = `${t.crop_name}, campaña ${t.campaign} (${t.slot === 'A' ? 'grande' : 'chica'})`;
    if (v.status === 'condicionada') risks.push(`${where}: ${v.severity === 'alta' ? 'riesgo alto' : 'viabilidad condicionada'} — ${Object.keys(v.reasons).filter((k) => v.basis[k] !== 'alerta').slice(0, 2).join('; ') || 'depende de la incertidumbre de los datos'}.`);
    if (v.status === 'inviable') risks.push(`${where}: inviable — ${Object.keys(v.reasons).slice(0, 2).join('; ')}.`);
    if (v.local_evidence === false) risks.push(`${where}: sin evidencia local directa en esta campaña; evaluado por condiciones climáticas.`);
    if (v.source_dependent) risks.push(`${where}: la clasificación cambia según el peso que se dé a cada fuente de lluvia (se muestra la más cautelosa).`);
    if (t.heat_stress_frac >= 0.25) risks.push(`${where}: ${Math.round(t.heat_stress_frac * 100)} % de los días de la etapa media superan el umbral de calor (hipótesis; rango ${t.heat_range ? Math.round(100 * t.heat_range[0]) + '–' + Math.round(100 * t.heat_range[1]) + ' %' : '—'}).`);
  });
  seq.forEach((cid, i) => { const prev = i === 0 ? env.input.history.slice(-1)[0] : seq[i - 1]; if (prev && env.crops[prev] && env.crops[prev].id === cid) risks.push(`Repite ${env.crops[cid].name} en campañas consecutivas (${i === 0 ? 'historial → 1' : `${i} → ${i + 1}`}): acumulación de plagas y enfermedades del cultivo.`); });
  const leg = seq.filter((c) => env.crops[c].family === 'Fabaceae').length, rice = seq.filter((c) => c === 'arroz').length;
  reasons.push(`Demanda neta de riego por campaña (mm): ${timeline.map((t) => `${t.crop_name} ${t.water_need_mm}`).join(' · ')}.`);
  if (leg) reasons.push(`Incluye ${leg} campaña(s) con leguminosa (fijación de N: efecto cualitativo, sin cantidad estimada).`);
  if (rice && leg) reasons.push('Alterna arroz y leguminosa: beneficio de rotación y menor demanda de agua en la campaña con leguminosa.');
  return {
    id, label, sequence: seq, timeline, criteria, score: +totals[env.primary].toFixed(1), totals_by_source: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +v.toFixed(1)])), reasons, risks,
    economics: X.econ ? { complete: true, margin_s_ha_horizon: Math.round(seq.reduce((a, c) => a + X.econ[c].margin, 0)), note: 'Según datos declarados por el agricultor' } : { complete: false },
    ...extra,
    assumptions: ['Cada campaña se siembra al inicio de su ventana (grande ≈ 21-ene; chica ≈ 15-jul) salvo que declares la fecha de la primera.', 'Viabilidad: sorteos de fuente de lluvia (IMERG/ERA5/POWER) × desplazamiento térmico ±δ × parámetros inciertos del cultivo.', `Arroz: demanda = ETc − lluvia + saturación (${X.sat} mm) + percolación (${X.perc} mm/d, rango FAO salvo dato tuyo).`, 'Escalas ordinales (N, cobertura, biomasa) = criterio del equipo, no medidas.'],
    unknowns: ['Fertilidad química real de la parcela.', 'Presión real de plagas y enfermedades.', 'Variedades, densidades y manejo.', 'Rendimiento, precios y costos (solo si los declaras).'],
    specialist_check: ['Contrastar fechas y variedades con DRAP/INIA.', 'Confirmar el pH y la materia orgánica con análisis de suelo.'],
  };
}

/** Explica por qué no hay una alternativa que proponer y qué dato o decisión permitiría evaluarla. */
function buildNoViable(env, V, order, supply, dropped, keep, hadHighRisk) {
  const slotIds = [...new Set(order)];
  const perSlot = slotIds.map((sid) => ({ slot: env.slotById[sid].base || sid, label: env.slotById[sid].label, crops: env.cropList.map((c) => ({ crop: c.id, name: c.name, status: V[c.id][sid].status, severity: V[c.id][sid].severity || null, reasons: Object.keys(V[c.id][sid].reasons).filter((k) => V[c.id][sid].reason_basis[k] !== 'alerta').slice(0, 3) })) }));
  const blocked = perSlot.filter((s) => s.crops.every((c) => c.status === 'inviable' || c.severity === 'alta'));
  const what = [];
  if (supply.mm === 0) what.push('Declarar el volumen de riego disponible (m³/ha por campaña): sin agua, el arroz es inviable y la lluvia de la campaña chica no alcanza para ningún cultivo.');
  else if (supply.mm !== Infinity) what.push('Con la dotación declarada algunos cultivos no completan su ciclo: aumentar la dotación o evaluar menos campañas.');
  if (keep) what.push('Relajar la condición de conservar el cultivo principal en esas campañas.');
  what.push('Evaluar una sola campaña (la grande) en lugar de un horizonte de cuatro campañas.');
  return { summary: blocked.length ? `No hay una opción recomendable en ${blocked.map((s) => s.slot === 'A' ? 'la campaña grande' : 'la campaña chica').join(' ni ')} con los datos y condiciones declarados (inviable o con riesgo hídrico alto), por lo que no se propone ninguna rotación.` : 'Ninguna combinación de cultivos cumple todas las condiciones en las cuatro campañas.', by_campaign: perSlot, blocked_campaigns: blocked.map((s) => s.slot), dropped_reasons: dropped, high_risk_excluded: !!hadHighRisk, what_would_help: what };
}

module.exports = { run, viability, PARAMS, TEXTURE, ENGINE_VERSION, projectCurrent, buildEnv, supplyFor, netNeed, CRIT_LABEL, scaleCycle, CATNAME };
