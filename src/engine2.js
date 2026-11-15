'use strict';
/**
 * Motor de rotaciones en DOS ETAPAS (v2) para el dominio Morropón (arroz + frijol Loctao).
 *
 *  Etapa 1 — VIABILIDAD por cultivo × campaña × parcela, propagando incertidumbre (fuentes de lluvia × desplazamiento térmico):
 *            favorable / condicionada / inviable. Una campaña inviable nunca llega a la comparación.
 *  Etapa 2 — COMPARACIÓN de las secuencias sin campañas inviables: primero menos condiciones críticas, luego puntaje de las prioridades
 *            del agricultor sobre criterios que NO se cuentan dos veces. Los criterios sin datos se omiten (no se rellenan).
 *
 * Todo parámetro que no es medido ni citado se declara en PARAMS con su estado (provisional / hipótesis / literatura) y se informa en la
 * respuesta (`engine_params`). Nada se inventa: sin datos económicos del agricultor no hay comparación económica.
 * Sensibilidad: scripts/ y docs/MOTOR_V2.md. Referencias de laboratorio: ../fieldshift-lab/INFORME.md.
 */
const climate = require('./climate');
const { evaluateSeason, tempUncertainty, awcFromSoil, cycleLength, coverOf } = climate;

const ENGINE_VERSION = 'v2.0 · dos etapas (viabilidad → comparación)';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const med = (a) => { const q = [...a].filter(Number.isFinite).sort((x, y) => x - y); return q.length ? q[Math.floor((q.length - 1) / 2)] : NaN; };
/** Mediana y media ponderadas (pesos de confiabilidad de la fuente de lluvia). */
function wmed(vals, ws) { const a = vals.map((v, i) => [v, ws[i]]).filter(([v]) => Number.isFinite(v)).sort((x, y) => x[0] - y[0]); if (!a.length) return NaN; const tot = a.reduce((s, [, w]) => s + w, 0); let acc = 0; for (const [v, w] of a) { acc += w; if (acc >= tot / 2) return v; } return a[a.length - 1][0]; }
function wmean(vals, ws) { const tot = ws.reduce((a, b) => a + b, 0); return tot ? vals.reduce((s, v, i) => s + v * ws[i], 0) / tot : 0; }
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Parámetros del motor con su respaldo. status: LITERATURA | HEREDADO | PROVISIONAL | DESACTIVADO. */
const PARAMS = {
  rice_perc_mm_day: { value: 5, range: [2, 8], status: 'LITERATURA', source: 'FAO, Irrigation Water Management (necesidades de riego del arroz): percolación 2 mm/d en arcilla pesada, 8 mm/d en suelos arenosos, 5 mm/d como media si no hay dato local (https://www.fao.org/4/t7202e/t7202e07.htm). Sin medición local: incierto.' },
  rice_sat_mm: { value: 200, range: [0, 200], status: 'LITERATURA', source: 'FAO (misma obra): saturación de la zona radicular en la preparación de suelo ≈ 200 mm; el batido reduce la percolación.' },
  fail_inviable: { value: 0.8, status: 'PROVISIONAL', source: 'Fracción de sorteos (fuente de lluvia × ±δ°C) que deben fallar para declarar inviable. Sensibilidad 0,7–0,9 sin efecto en el laboratorio.' },
  fail_conditional: { value: 0.1, status: 'PROVISIONAL', source: 'Por encima de esta fracción de sorteos fallidos la campaña es condicionada.' },
  heat_soft: { value: 0.25, status: 'PROVISIONAL', source: 'Fracción de días de la etapa media con Tmax > umbral del cultivo que genera una alerta (no excluye).' },
  cover_hard: { value: 0.5, status: 'HEREDADO', source: 'ETa/ETc mínimo para completar el ciclo; es la misma regla del motor original en secano.' },
  cover_soft: { value: 0.8, status: 'HEREDADO', source: 'ETa/ETc < 0,8 = déficit hídrico (criterio del motor original).' },
  rice_slope_max_pct: { value: null, status: 'DESACTIVADO', source: 'Pendiente máxima para arroz inundado: no se encontró un valor citable; solo se alerta (>5 %). Habilitar con FAO Soils Bulletin 55 o criterio de un agrónomo.' },
  rot_same_crop: { value: 0.45, status: 'PROVISIONAL', source: 'Penalización por repetir el mismo cultivo en campañas consecutivas (supuesto del equipo; sin cuantificación).' },
  rot_same_family: { value: 0.3, status: 'PROVISIONAL', source: 'Penalización por repetir la familia botánica (supuesto del equipo).' },
  tie_margin: { value: 1.0, status: 'PROVISIONAL', source: 'Diferencia de puntaje (de 100) por debajo de la cual se prefiere la secuencia con más campañas documentadas localmente.' },
  n_ordinal: { value: null, status: 'PROVISIONAL', source: 'Aporte de N: escala ordinal cualitativa (sin kg N/ha). Fijación típica de mungo 26–42 kg N/ha (CSIRO/GRDC, fuera de Piura).' },
};
const pv = (k, ov) => (ov && ov[k] != null ? ov[k] : PARAMS[k].value);

const ORDER = { A: ['A', 'B', 'A', 'B'], B: ['B', 'A', 'B', 'A'] };

function buildEnv(input, data, ov) {
  const crops = Object.fromEntries(data.crops.map((c) => [c.id, c]));
  const prim = data.climates.find((c) => c.role === 'primary') || data.climates[0];
  return {
    input, crops, cropList: data.crops, climates: data.climates, slope: data.slope ?? null, soil: data.soil ?? null,
    slots: data.slots, slotById: Object.fromEntries(data.slots.map((s) => [s.id, s])), slotOrder: ORDER[input.start_slot === 'B' ? 'B' : 'A'],
    awc: awcFromSoil(data.soil), dT: tempUncertainty(prim.climate), elev: prim.climate.elevation_m, primary: prim.id, cache: new Map(), ov: ov || {}, sourceWeights: data.source_weights || null,
  };
}

const seasonOf = (env, climId, crop, slot, dT, tsShift) => {
  const k = `${climId}|${crop.id}|${crop.cycle.mid}|${slot.id}|${dT.toFixed(2)}|${tsShift.toFixed(2)}`;
  if (!env.cache.has(k)) {
    const clim = env.climates.find((c) => c.id === climId).climate;
    const c2 = tsShift ? { ...crop, t_stress_max: crop.t_stress_max - tsShift } : crop; // T más alta ≡ umbral efectivo menor
    env.cache.set(k, evaluateSeason(clim, c2, slot, false, env.awc, { dT }));
  }
  return env.cache.get(k);
};

/** Necesidad neta de riego (mm). Arroz: ETc − lluvia + saturación + percolación×días (FAO). Otros: ETc − lluvia efectiva (déficit del balance). */
function netNeed(crop, s, perc, sat) {
  const base = Math.max(0, s.deficit_mm ?? 0);
  return crop.id === 'arroz' ? base + sat + perc * (s.dur_days ?? s.max_days ?? 0) : base;
}

/** Dotación disponible por campaña (mm): Infinity = riego declarado sin volumen; 0 = secano; número = volumen declarado. */
function supplyFor(input) {
  if (input.irrigation === false) return { mm: 0, basis: 'secano (sin riego declarado)' };
  const v = input.water && input.water.supply_m3_ha;
  if (v != null && Number.isFinite(v)) return { mm: v / 10, basis: `dotación declarada por campaña: ${Math.round(v)} m³/ha (no verificada)` };
  return { mm: Infinity, basis: 'riego declarado sin volumen: no se evalúa limitación de agua; se informa la demanda' };
}

/** ETAPA 1. */
function viability(env, crop, slot, supply, ov) {
  const perc = (env.input.water && env.input.water.percolation_mm_day != null) ? env.input.water.percolation_mm_day : pv('rice_perc_mm_day', ov);
  const sat = pv('rice_sat_mm', ov);
  const fi = pv('fail_inviable', ov), fc = pv('fail_conditional', ov), heatSoft = pv('heat_soft', ov), covHard = pv('cover_hard', ov), covSoft = pv('cover_soft', ov);
  const draws = [];
  const SW = env.sourceWeights || {}, wSrc = (id) => (SW[id] != null ? SW[id] : 1 / env.climates.length);
  for (const c of env.climates) for (const sh of [-1, 0, 1]) { const s = seasonOf(env, c.id, crop, slot, sh * env.dT, sh * env.dT); if (s) draws.push({ src: c.id, sh, s, w: wSrc(c.id) / 3 }); }
  let fails = 0, softs = 0, totW = 0; const reasons = {}, tag = (k) => { reasons[k] = (reasons[k] || 0) + 1; };
  const rows = draws.map(({ s, w }) => {
    let fail = false, soft = false;
    const dur = s.dur_days ?? s.max_days;
    const need = netNeed(crop, s, perc, sat);
    const covRain = s.incomplete ? 0 : s.sat;
    const cov = s.incomplete ? 0 : supply === 0 ? covRain : supply === Infinity ? 1 : Math.max(covRain, clamp(1 - Math.max(0, need - supply) / Math.max(1, s.etc_mm || 1)));
    if (s.incomplete || s.complete_frac < 0.5) { fail = true; tag('no completa su ciclo con la temperatura estimada'); }
    if (crop.regime === 'irrigated_required' && supply === 0) { fail = true; tag('requiere riego y no hay agua declarada'); }
    else if (cov < covHard) { fail = true; tag(supply === 0 ? 'la lluvia de la campaña no basta (ETa/ETc < 0,5)' : 'la dotación de agua no basta (ETa/ETc < 0,5)'); }
    if (crop.eco && crop.eco.altmx != null && env.elev > crop.eco.altmx) { fail = true; tag('altitud sobre el máximo EcoCrop'); }
    if (env.slope != null && env.slope > 25 && coverOf(crop) < 0.5) { fail = true; tag('pendiente > 25 % con cobertura baja'); }
    if (crop.id === 'arroz' && PARAMS.rice_slope_max_pct.value != null && env.slope > PARAMS.rice_slope_max_pct.value) { fail = true; tag('pendiente excesiva para arroz inundado'); }
    if (crop.ph_abs && env.soil && (env.soil.phh2o.mean < crop.ph_abs[0] || env.soil.phh2o.mean > crop.ph_abs[1])) { fail = true; tag('pH fuera del rango absoluto de la especie'); }
    if (!s.incomplete && s.complete_frac >= 0.5 && s.complete_frac < 0.9) { soft = true; tag('el ciclo se completa en menos del 90 % de los años'); }
    if (s.heat_frac > heatSoft) { soft = true; tag('calor sobre el umbral en la etapa media'); }
    if (!fail && cov < covSoft) { soft = true; tag('cobertura hídrica < 80 %'); }
    if (crop.ph && env.soil) { const ph = env.soil.phh2o.mean, d = ph < crop.ph[0] ? crop.ph[0] - ph : ph > crop.ph[1] ? ph - crop.ph[1] : 0; if (d > 0.5) { soft = true; tag('pH fuera del óptimo'); } }
    totW += w; if (fail) fails += w; else if (soft) softs += w;
    return { s, need, cov, fail, w };
  });
  const n = rows.length || 1, pFail = totW ? fails / totW : 0, pSoft = totW ? softs / totW : 0;
  const doc = (crop.local_evidence && crop.local_evidence.campaigns_documented) || null;
  const localEvidence = doc ? doc.includes(slot.id) : null; // null = sin información de campañas
  const status = pFail >= fi ? 'inviable' : pFail > fc ? 'condicionada' : 'favorable';
  const use = rows.filter((r) => !r.fail).length ? rows.filter((r) => !r.fail) : rows;
  const primRows = rows.filter((_, i) => draws[i].src === env.primary && draws[i].sh === 0);
  const prim = primRows[0] || use[0];
  const needAll = use.map((r) => r.need);
  const lo = (r) => netNeed(crop, r.s, crop.id === 'arroz' ? PARAMS.rice_perc_mm_day.range[0] : 0, crop.id === 'arroz' ? PARAMS.rice_sat_mm.range[0] : 0);
  const hi = (r) => netNeed(crop, r.s, crop.id === 'arroz' ? PARAMS.rice_perc_mm_day.range[1] : 0, crop.id === 'arroz' ? PARAMS.rice_sat_mm.range[1] : 0);
  return {
    crop: crop.id, slot: slot.id, status, p_fail: +pFail.toFixed(2), p_alert: +pSoft.toFixed(2), reasons, local_evidence: localEvidence, n_draws: n,
    m: { dur: wmed(use.map((r) => r.s.dur_days ?? r.s.max_days), use.map((r) => r.w)), etc: wmed(use.map((r) => r.s.etc_mm || 0), use.map((r) => r.w)), rain: wmed(use.map((r) => r.s.rain_mm || 0), use.map((r) => r.w)), need: wmed(needAll, use.map((r) => r.w)), need_range: [Math.min(...use.map(lo)), Math.max(...use.map(hi))],
      heat: wmean(use.map((r) => r.s.heat_frac), use.map((r) => r.w)), cov: wmean(use.map((r) => r.cov), use.map((r) => r.w)), complete: wmean(use.map((r) => r.s.complete_frac), use.map((r) => r.w)), tmean: wmean(use.map((r) => r.s.tmean || 0), use.map((r) => r.w)), early: wmean(use.map((r) => r.s.heavy_early_mm || 0), use.map((r) => r.w)), prim: prim ? prim.s : null },
    rows, // para el recálculo con otras hipótesis de percolación
  };
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
  if (env.soil) { const ph = env.soil.phh2o.mean, r = crop.ph, d = ph < r[0] ? r[0] - ph : ph > r[1] ? ph - r[1] : 0; soilFit = clamp(1 - d / 1.0) * (env.soil.clay.mean > 40 ? 1 - 0.3 * crop.waterlog_sens : 1); }
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
  const raw = { protect_soil: Math.max(0.25, p.protect_soil), water: Math.max(0.25, p.water), resilience: Math.max(0.25, p.resilience), pests: Math.max(0.25, p.pests), income: Math.max(0.25, p.income) };
  return raw;
}

/** Puntaje de una secuencia ya validada. `m` = métricas por campaña. Devuelve criterios y total (criterios sin datos se omiten). */
function scoreSeq(env, seq, m, ctx, w0, ords) {
  const crops = ords || env.crops;
  const sc = {}, w = {};
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
  // pesos: cada prioridad se reparte entre sus criterios (sin contar dos veces el mismo beneficio)
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

/** Restricción del cultivo principal. keep = { crop, campaigns?: ['A'|'B'], min_campaigns?: n } */
function keepOk(seq, order, keep) {
  if (!keep || !keep.crop) return true;
  if (Array.isArray(keep.campaigns) && keep.campaigns.length) { for (let i = 0; i < 4; i++) if (keep.campaigns.includes(order[i]) && seq[i] !== keep.crop) return false; }
  if (keep.min_campaigns) return seq.filter((c) => c === keep.crop).length >= keep.min_campaigns;
  return true;
}

function run(input, data, ov) {
  const env = buildEnv(input, data, ov);
  const history = (input.history || []).filter(Boolean);
  if (!history.length) throw new Error('Se requiere al menos un cultivo en el historial.');
  for (const h of history) if (!env.crops[h]) throw new Error(`Cultivo desconocido en historial: ${h}`);
  const supply = supplyFor(input), order = env.slotOrder;
  const perc = (input.water && input.water.percolation_mm_day != null) ? input.water.percolation_mm_day : pv('rice_perc_mm_day', ov), sat = pv('rice_sat_mm', ov);
  const slotIds = ['A', 'B'].filter((s) => env.slotById[s]);

  // ---- etapa 1
  const V = {};
  for (const c of env.cropList) { V[c.id] = {}; for (const sid of slotIds) V[c.id][sid] = viability(env, c, env.slotById[sid], supply.mm, ov); }
  const eligibility = order.map((sid) => ({ slot: sid, ok: env.cropList.filter((c) => V[c.id][sid].status !== 'inviable').map((c) => c.id), conditioned: env.cropList.filter((c) => V[c.id][sid].status === 'condicionada').map((c) => c.id), blocked: Object.fromEntries(env.cropList.filter((c) => V[c.id][sid].status === 'inviable').map((c) => [c.id, Object.keys(V[c.id][sid].reasons).slice(0, 3)])) }));

  // ---- enumeración y filtros
  const all = []; (function rec(i, acc) { if (i === 4) { all.push([...acc]); return; } for (const c of env.cropList) { acc.push(c.id); rec(i + 1, acc); acc.pop(); } })(0, []);
  const dropped = {}; const drop = (k) => { dropped[k] = (dropped[k] || 0) + 1; };
  const keep = input.keep_main && input.keep_main.crop && env.crops[input.keep_main.crop] ? input.keep_main : null;
  const viable = [];
  for (const seq of all) {
    const bad = seq.findIndex((cid, i) => V[cid][order[i]].status === 'inviable');
    if (bad >= 0) { drop(`${env.crops[seq[bad]].name} en la campaña ${order[bad] === 'A' ? 'grande' : 'chica'}: ${Object.keys(V[seq[bad]][order[bad]].reasons)[0] || 'inviable'}`); continue; }
    if (!keepOk(seq, order, keep)) { drop(`no conserva ${env.crops[keep.crop].name} como pediste`); continue; }
    viable.push(seq);
  }

  // ---- etapa 2
  const metricsFor = (seq, climId, p, st) => seq.map((cid, i) => campaignOn(env, env.crops[cid], env.slotById[order[i]], climId, p, st, supply.mm));
  const maxNeedOf = (p, st) => Math.max(1, ...env.cropList.flatMap((c) => slotIds.map((sid) => netNeed(c, V[c.id][sid].m.prim || { deficit_mm: V[c.id][sid].m.need, dur_days: V[c.id][sid].m.dur }, p, st))));
  const econ = (() => {
    const e = input.economics; if (!e) return null;
    const per = Object.fromEntries(env.cropList.map((c) => [c.id, economicsFor(c, e)]));
    return Object.values(per).every((x) => x.complete) ? per : null;
  })();
  const econReport = (() => {
    const e = input.economics;
    return { provided: !!e, complete: !!econ, per_crop: Object.fromEntries(env.cropList.map((c) => { const x = economicsFor(c, e); return [c.id, x]; })),
      note: econ ? 'Márgenes calculados con los datos que declaraste (no verificados); no son rendimientos validados para Morropón.' : 'Comparación económica incompleta: faltan datos del agricultor; el puntaje no incluye ingreso.' };
  })();
  const w0 = groupWeights(input.priorities);
  const mkCtx = (p, st, e2) => { const mg = e2 ? Object.values(e2).map((x) => x.margin) : null; return { maxNeed: maxNeedOf(p, st), hist: history.slice(-1), econ: e2, maxMargin: mg ? 4 * Math.max(...mg) : 0, minMargin: mg ? 4 * Math.min(...mg) : 0 }; };
  const ctx0 = mkCtx(perc, sat, econ);
  const evalAll = (seq) => { const per = {}; for (const c of env.climates) { const m = metricsFor(seq, c.id, perc, sat); per[c.id] = { m, ...scoreSeq(env, seq, m, ctx0, w0) }; } return per; };
  const scored = viable.map((seq) => {
    const per = evalAll(seq), totals = Object.fromEntries(env.climates.map((c) => [c.id, per[c.id].total]));
    const conds = seq.filter((cid, i) => V[cid][order[i]].status === 'condicionada').length;
    const undocumented = seq.filter((cid, i) => V[cid][order[i]].local_evidence === false).length;
    return { seq, per, totals, primary: totals[env.primary], worst: Math.min(...Object.values(totals)), conds, undocumented };
  });
  const tie = pv('tie_margin', ov);
  scored.sort((a, b) => a.conds - b.conds || ((Math.abs(b.primary - a.primary) < tie) ? a.undocumented - b.undocumented : 0) || b.primary - a.primary);

  const curSeq = projectCurrent(history), curKey = curSeq.join('|');
  const curViab = curSeq.map((cid, i) => V[cid][order[i]]);
  const curPer = evalAll(curSeq), curTotals = Object.fromEntries(env.climates.map((c) => [c.id, curPer[c.id].total]));
  const pool = scored.filter((c) => c.seq.join('|') !== curKey);
  const altA = pool[0] || null;
  const rest = altA ? pool.filter((c) => c.conds <= altA.conds && hamming(c.seq, altA.seq) >= 2).sort((a, b) => b.worst - a.worst) : [];
  const altB = altA ? (rest[0] || pool[1] || null) : null;

  // ---- sensibilidad (Monte Carlo reproducible): pesos, ordinales, percolación/saturación, fuente de lluvia
  const rnd = mulberry32(20261115), gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()), U = (h) => (2 * rnd() - 1) * h;
  const N = 300, acc = { aTop: 0, aBeatsCur: 0, bBeatsCur: 0, aBeatsB: 0, dAC: [], dAB: [], dBC: [] };
  const cands = scored.slice(0, 40); if (altA && !cands.includes(altA)) cands.push(altA); if (altB && !cands.includes(altB)) cands.push(altB);
  for (let n = 0; n < N; n++) {
    const wd = {}; for (const k of Object.keys(w0)) wd[k] = w0[k] * Math.exp(0.35 * gauss());
    const crops2 = Object.fromEntries(Object.entries(env.crops).map(([id, c]) => [id, { ...c, n_balance: clamp(c.n_balance + U(0.5), -2, 2) }]));
    const p2 = input.water && input.water.percolation_mm_day != null ? input.water.percolation_mm_day : PARAMS.rice_perc_mm_day.range[0] + rnd() * (PARAMS.rice_perc_mm_day.range[1] - PARAMS.rice_perc_mm_day.range[0]);
    const s2 = PARAMS.rice_sat_mm.range[0] + rnd() * (PARAMS.rice_sat_mm.range[1] - PARAMS.rice_sat_mm.range[0]);
    const climId = env.climates[Math.floor(rnd() * env.climates.length)].id, ctx2 = mkCtx(p2, s2, econ);
    const tot = (seq) => { const m = metricsFor(seq, climId, p2, s2); return scoreSeq(env, seq, m, ctx2, wd, crops2).total; };
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

  // ---- descripción
  const describe = (id, label, seq, per, totals, extra = {}) => describeStrategy(env, V, order, id, label, seq, per, totals, { perc, sat, supply, econ, ctx0, w0 }, extra);
  const curViol = []; curSeq.forEach((cid, i) => { const v = curViab[i]; if (v.status === 'inviable') curViol.push(`Campaña ${i + 1} (${env.crops[cid].name}): ${Object.keys(v.reasons).slice(0, 2).join('; ')}`); });
  const strategies = [describe('current', 'Tu rotación actual (proyectada)', curSeq, curPer, curTotals, { violations: curViol, viability_note: curViab.some((v) => v.status === 'inviable') ? 'Tu rotación actual incluye campañas que los datos consideran inviables.' : null })];
  if (altA) strategies.push(describe('alt_a', 'Alternativa A · mejor puntaje entre las opciones viables', altA.seq, altA.per, altA.totals, { top_freq: acc.aTop / N, beats_current: acc.aBeatsCur / N }));
  if (altB) strategies.push(describe('alt_b', 'Alternativa B · opción distinta y más robusta', altB.seq, altB.per, altB.totals, { beats_current: acc.bBeatsCur / N }));

  const noViable = viable.length === 0 ? buildNoViable(env, V, order, supply, dropped, keep) : null;
  const limitations = [];
  if (!altA) limitations.push(noViable ? noViable.summary : 'No se encontró ninguna alternativa viable distinta de tu rotación actual con los datos disponibles.');
  else if (!altB) limitations.push('Solo hay una alternativa viable distinta de la actual: las condiciones limitan las opciones.');

  return {
    engine_version: ENGINE_VERSION, generated_at: new Date().toISOString(), engine: 'v2',
    candidates_total: all.length, candidates_viable: viable.length, candidates_dropped: dropped,
    viability: Object.fromEntries(env.cropList.map((c) => [c.id, Object.fromEntries(slotIds.map((sid) => { const v = V[c.id][sid]; return [sid, { status: v.status, p_fail: v.p_fail, p_alert: v.p_alert, reasons: v.reasons, local_evidence: v.local_evidence, duration_days: v.m.dur, etc_mm: Math.round(v.m.etc), rain_mm: Math.round(v.m.rain), net_water_need_mm: Math.round(v.m.need), net_water_need_range_mm: v.m.need_range.map(Math.round), heat_frac: +v.m.heat.toFixed(2), tmean_c: +v.m.tmean.toFixed(1) }]; }))])),
    eligibility, strategies, no_viable: noViable, limitations,
    water: { supply_basis: supply.basis, supply_mm_per_campaign: supply.mm === Infinity ? null : supply.mm, rice_percolation_mm_day: perc, rice_percolation_range: PARAMS.rice_perc_mm_day.range, rice_saturation_mm: sat },
    economics: econReport, keep_main: keep, source_weights: env.sourceWeights ? { ...env.sourceWeights, basis: 'confiabilidad de la lluvia: 1/RMSE² mensual frente a SENAMHI Morropón 2001-2014 (docs/VALIDACION_FUENTES_SENAMHI.md)' } : { basis: 'pesos iguales (sin calibración disponible)' },
    engine_params: Object.entries(PARAMS).map(([k, p]) => ({ id: k, value: p.value, range: p.range || null, status: p.status, source: p.source })),
    weights: Object.fromEntries(Object.entries(w0).map(([k, v]) => [k, +v.toFixed(3)])), weighting_model: 'v2: prioridades repartidas entre criterios sin duplicar', weights_status: 'PROVISIONALES: derivadas de las prioridades del agricultor; no calibradas con datos de campaña.',
    sensitivity: { draws: N, perturbation: 'pesos × exp(N(0,0.35²)); N ordinal ±0,5; percolación del arroz y saturación dentro del rango FAO (salvo que el agricultor declare la suya); fuente de lluvia al azar; semilla fija', comparisons, alt_a_is_top: acc.aTop / N, alt_a_beats_current: acc.aBeatsCur / N, alt_b_beats_current: acc.bBeatsCur / N,
      note: 'La estabilidad del ranking mide la sensibilidad a la incertidumbre declarada; NO es validación agronómica.' },
    robustness: { by_source: env.climates.map((c) => ({ source: c.id, label: c.label, role: c.role, totals: Object.fromEntries(strategies.map((s) => [s.id, s.totals_by_source[c.id]])), annual_precip_mm: c.climate.annual.precip_mm })), note: 'Los productos de lluvia discrepan; el análisis de viabilidad propaga ese desacuerdo en vez de elegir una fuente.' },
    context: { slope_pct: env.slope, soil: env.soil, irrigated: supply.mm !== 0, start_slot: input.start_slot || 'A', history },
  };
}

function describeStrategy(env, V, order, id, label, seq, per, totals, X, extra) {
  const P = per[env.primary];
  const heat = P.m.map((x) => x.heat);
  const timeline = seq.map((cid, i) => {
    const crop = env.crops[cid], slot = env.slotById[order[i]], v = V[cid][order[i]], m = P.m[i], start = slot.start;
    const yearOffset = Math.floor((i + (order[0] === 'B' ? 1 : 0)) / 2);
    return {
      campaign: i + 1, slot: slot.id, slot_label: slot.label, year_offset: yearOffset, crop: cid, crop_name: crop.name, family: crop.family, cycle_days: cycleLength(crop), cycle_days_effective: cycleLength(crop),
      duration_days: v.m.dur, sowing_md: `${String(start.m).padStart(2, '0')}-${String(start.d).padStart(2, '0')}`,
      etc_mm: Math.round(v.m.etc), rain_mm: Math.round(v.m.rain), water_need_mm: Math.round(v.m.need), water_need_range_mm: v.m.need_range.map(Math.round), water_deficit_mm: Math.round(m.s.deficit_mm || 0),
      water_coverage_pct: m.cov == null ? null : Math.round(m.cov * 100), drought_year_frac: 0, heat_stress_frac: +heat[i].toFixed(2), tmean_c: Number.isFinite(v.m.tmean) ? +v.m.tmean.toFixed(1) : null,
      thermal: { complete_frac: +v.m.complete.toFixed(2), complete_frac_cold: +v.m.complete.toFixed(2), status: v.status === 'inviable' ? 'no_viable' : v.status === 'favorable' ? 'viable' : 'marginal' },
      bare_soil_pct: Math.round(100 * m.gap / slot.window_days), eff_cover_pct: Math.round(100 * m.eff),
      viability: { status: v.status, p_fail: v.p_fail, alerts: v.p_alert, reasons: v.reasons, local_evidence: v.local_evidence },
    };
  });
  const criteria = {}; for (const k of Object.keys(P.sc)) criteria[k] = { label: CRIT_LABEL[k], score: +P.sc[k].toFixed(3), weight: +(P.w[k] || 0).toFixed(3) };
  const reasons = [], risks = [];
  timeline.forEach((t) => {
    const v = t.viability;
    if (v.status === 'condicionada') risks.push(`${t.crop_name} (campaña ${t.campaign}, ${t.slot === 'A' ? 'grande' : 'chica'}): viabilidad condicionada — ${Object.keys(v.reasons).slice(0, 2).join('; ') || 'depende de la incertidumbre de los datos'}.`);
    if (v.status === 'inviable') risks.push(`${t.crop_name} (campaña ${t.campaign}): inviable según los datos — ${Object.keys(v.reasons).slice(0, 2).join('; ')}.`);
    if (v.local_evidence === false) risks.push(`${t.crop_name} (campaña ${t.campaign}, ${t.slot === 'A' ? 'grande' : 'chica'}): sin evidencia local directa en esta campaña; evaluado por condiciones climáticas.`);
    if (t.heat_stress_frac >= 0.25) risks.push(`${t.crop_name} (campaña ${t.campaign}): ${Math.round(t.heat_stress_frac * 100)} % de los días de la etapa media superan el umbral de calor del cultivo.`);
  });
  seq.forEach((cid, i) => { const prev = i === 0 ? env.input.history.slice(-1)[0] : seq[i - 1]; if (prev && env.crops[prev] && env.crops[prev].id === cid) risks.push(`Repite ${env.crops[cid].name} en campañas consecutivas (${i === 0 ? 'historial → 1' : `${i} → ${i + 1}`}): acumulación de plagas y enfermedades del cultivo.`); });
  const rain = seq.filter((c) => c === 'arroz').length, leg = seq.filter((c) => env.crops[c].family === 'Fabaceae').length;
  const needs = timeline.map((t) => t.water_need_mm);
  reasons.push(`Demanda neta de riego por campaña (mm): ${timeline.map((t) => `${t.crop_name} ${t.water_need_mm}`).join(' · ')}.`);
  if (leg) reasons.push(`Incluye ${leg} campaña(s) con leguminosa (fijación de N: efecto cualitativo, sin cantidad estimada).`);
  if (rain && leg) reasons.push('Alterna arroz y leguminosa: beneficio de rotación y menor demanda de agua en la campaña con leguminosa.');
  return {
    id, label, sequence: seq, timeline, criteria, score: +totals[env.primary].toFixed(1), totals_by_source: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +v.toFixed(1)])), reasons, risks,
    economics: X.econ ? { complete: true, margin_s_ha_horizon: Math.round(seq.reduce((a, c) => a + X.econ[c].margin, 0)), note: 'Según datos declarados por el agricultor' } : { complete: false },
    ...extra,
    assumptions: ['Cada campaña se siembra al inicio de su ventana (grande ≈ 21-ene; chica ≈ 15-jul).', 'Viabilidad: sorteos de fuente de lluvia (IMERG/ERA5/POWER) × desplazamiento térmico ±δ.', `Arroz: demanda = ETc − lluvia + saturación (${X.sat} mm) + percolación (${X.perc} mm/d); referencias FAO, sin dato local.`, 'Escalas ordinales (N, cobertura, biomasa) = criterio del equipo, no medidas.'],
    unknowns: ['Fertilidad química real de la parcela.', 'Presión real de plagas y enfermedades.', 'Variedades, densidades y manejo.', 'Rendimiento, precios y costos (solo si los declaras).'],
    specialist_check: ['Contrastar fechas y variedades con DRAP/INIA.', 'Confirmar el pH y la materia orgánica con análisis de suelo.'],
  };
}

/** Explica por qué no hay recomendación y qué datos o decisiones permitirían evaluarla. */
function buildNoViable(env, V, order, supply, dropped, keep) {
  const perSlot = ['A', 'B'].filter((s) => env.slotById[s]).map((sid) => ({ slot: sid, label: env.slotById[sid].label, crops: env.cropList.map((c) => ({ crop: c.id, name: c.name, status: V[c.id][sid].status, reasons: Object.keys(V[c.id][sid].reasons).slice(0, 3) })) }));
  const blockedSlots = perSlot.filter((s) => s.crops.every((c) => c.status === 'inviable'));
  const what = [];
  if (supply.mm === 0) what.push('Declarar el volumen de riego disponible (m³/ha por campaña): sin agua, el arroz es inviable y la lluvia de la campaña chica no alcanza para ningún cultivo.');
  else if (supply.mm !== Infinity) what.push('Con la dotación declarada algunos cultivos no completan su ciclo: aumentar la dotación o evaluar menos campañas.');
  if (keep) what.push('Relajar la condición de conservar el cultivo principal en esas campañas.');
  what.push('Evaluar una sola campaña (la grande) en lugar de un horizonte de cuatro campañas.');
  return { summary: blockedSlots.length ? `No hay cultivo viable en ${blockedSlots.map((s) => s.slot === 'A' ? 'la campaña grande' : 'la campaña chica').join(' ni ')} con los datos y condiciones declarados, por lo que no se propone ninguna rotación.` : 'Ninguna combinación de cultivos cumple todas las condiciones en las cuatro campañas.', by_campaign: perSlot, blocked_campaigns: blockedSlots.map((s) => s.slot), dropped_reasons: dropped, what_would_help: what };
}

module.exports = { run, viability, PARAMS, ENGINE_VERSION, projectCurrent, buildEnv, supplyFor, netNeed, CRIT_LABEL };
