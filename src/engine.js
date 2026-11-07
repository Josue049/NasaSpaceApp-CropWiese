'use strict';
/**
 * Motor de evaluación de rotaciones. Explicable y auditable: sin aprendizaje automático.
 *
 *  1) Reglas ELIMINATORIAS (descalifican): ciclo que no cabe, temperatura media fuera de rango,
 *     cultivo con riego obligatorio sin riego, déficit hídrico severo en secano, cobertura baja en
 *     pendiente fuerte, exclusión del agricultor, solanáceas consecutivas, >2 repeticiones seguidas.
 *  2) Criterios que MODIFICAN la puntuación (0-1): erosión/cobertura, materia orgánica y N (ordinal),
 *     agua, resiliencia, ruptura de ciclos de plagas, mercado, bajo costo, ajuste edáfico.
 *  3) Pesos PROVISIONALES derivados de las prioridades del agricultor (no calibrados).
 *  4) Robustez: se repite la evaluación con cada fuente de lluvia disponible (los productos
 *     satelitales/reanálisis discrepan mucho) y con perturbaciones aleatorias de pesos.
 *
 * Nada aquí predice rendimientos ni cantidades de N: son índices relativos para comparar.
 */
const { evaluateSeason, SLOTS, cycleLength, awcFromSoil } = require('./climate');

const ENGINE_VERSION = '0.1.0';
const CRITERIA = ['erosion', 'organic_n', 'water', 'resilience', 'pest', 'market', 'low_cost', 'soil_fit'];
const CRITERIA_LABEL = {
  erosion: 'Protección contra erosión', organic_n: 'Materia orgánica y nitrógeno', water: 'Suficiencia de agua',
  resilience: 'Resiliencia (sequía / calor)', pest: 'Ruptura de ciclos de plagas', market: 'Interés de mercado (declarado)',
  low_cost: 'Bajo costo de insumos', soil_fit: 'Ajuste al suelo (pH / drenaje)',
};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- contexto ----------
function buildContext(input, data) {
  const crops = Object.fromEntries(data.crops.map((c) => [c.id, c]));
  const slotOrder = input.start_slot === 'B' ? ['B', 'A', 'B', 'A'] : ['A', 'B', 'A', 'B'];
  return {
    input, crops, cropList: data.crops, climates: data.climates, slope: data.slope ?? null, soil: data.soil ?? null,
    slotOrder, slotById: Object.fromEntries(SLOTS.map((s) => [s.id, s])), seasonCache: new Map(),
    irrigated: !!input.irrigation, awc: awcFromSoil(data.soil),
  };
}

function season(ctx, climId, cropId, slotId) {
  const k = `${climId}|${cropId}|${slotId}`;
  if (!ctx.seasonCache.has(k)) {
    const clim = ctx.climates.find((c) => c.id === climId).climate;
    ctx.seasonCache.set(k, evaluateSeason(clim, ctx.crops[cropId], ctx.slotById[slotId], ctx.irrigated, ctx.awc));
  }
  return ctx.seasonCache.get(k);
}

// ---------- reglas eliminatorias por cultivo/campaña ----------
function cropSlotBlockers(ctx, cropId, slotId, primaryId) {
  const crop = ctx.crops[cropId], slot = ctx.slotById[slotId], out = [];
  const s = season(ctx, primaryId, cropId, slotId);
  if (cycleLength(crop) > slot.window_days) out.push(`el ciclo (${cycleLength(crop)} d) no cabe en la ventana de la campaña (${slot.window_days} d)`);
  if (!s) { out.push('sin datos climáticos suficientes'); return out; }
  if (s.tmean < crop.t_abs[0] || s.tmean > crop.t_abs[1]) out.push(`temperatura media del ciclo (${s.tmean.toFixed(1)} °C) fuera de ${crop.t_abs[0]}–${crop.t_abs[1]} °C`);
  if (crop.regime === 'irrigated_required' && !ctx.irrigated) out.push('requiere riego/inundación y la parcela no dispone de riego');
  if (!ctx.irrigated && crop.regime !== 'irrigated_required' && s.sat < 0.5) out.push(`déficit hídrico severo en secano (ETa/ETc mediana ${(s.sat * 100).toFixed(0)} %)`);
  if (ctx.slope != null && ctx.slope > 25 && crop.cover < 0.5) out.push(`pendiente ${ctx.slope.toFixed(0)} % demasiado alta para un cultivo de baja cobertura`);
  if ((ctx.input.excluded_crops || []).includes(cropId)) out.push('excluido por el agricultor');
  return out;
}

// reglas eliminatorias de secuencia (se aplican incluyendo el último cultivo del historial)
function sequenceBlockers(seqIds, prevIds, crops) {
  const all = [...prevIds, ...seqIds];
  const out = [];
  for (let i = Math.max(1, prevIds.length); i < all.length; i++) {
    const a = crops[all[i - 1]], b = crops[all[i]];
    if (a.family === 'Solanaceae' && b.family === 'Solanaceae') out.push(`solanáceas consecutivas (${a.name} → ${b.name})`);
    if (i >= 2 && all[i] === all[i - 1] && all[i] === all[i - 2]) out.push(`${b.name} sembrado 3 campañas seguidas`);
  }
  // Restricción de viabilidad económica (PROVISIONAL): el abono verde no genera ingreso directo -> máx. 1 de 4 campañas
  if (seqIds.filter((id) => crops[id].type === 'cover').length > 1) out.push('más de una campaña de abono verde sin ingreso directo en 4 campañas');
  return out;
}

// ---------- puntuación ----------
function priorityWeights(ctx) {
  const p = Object.assign({ protect_soil: 3, water: 3, resilience: 3, pests: 3, income: 3, low_cost: 3 }, ctx.input.priorities || {});
  const slopeF = ctx.slope == null ? 0.4 : Math.min(1, ctx.slope / 30);
  const raw = {
    erosion: Math.max(0.25, p.protect_soil) * (1 + slopeF), // regla de contexto PROVISIONAL: más pendiente, más peso a la erosión
    organic_n: Math.max(0.25, p.protect_soil),
    water: Math.max(0.25, p.water), resilience: Math.max(0.25, p.resilience), pest: Math.max(0.25, p.pests),
    market: Math.max(0.25, p.income), low_cost: Math.max(0.25, p.low_cost),
    soil_fit: ctx.soil ? 2 : 0,
  };
  const tot = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / tot]));
}

function phFit(ph, range) {
  if (ph >= range[0] && ph <= range[1]) return 1;
  const d = ph < range[0] ? range[0] - ph : ph - range[1];
  return clamp(1 - d / 1.0);
}

function campaignMetrics(ctx, climId, cropId, slotId) {
  const crop = ctx.crops[cropId], s = season(ctx, climId, cropId, slotId);
  const win = ctx.slotById[slotId].window_days, cycle = s.cycle_days, gap = Math.max(0, win - cycle);
  const effCover = (crop.cover * cycle + 0.25 * crop.biomass * gap) / win;
  const slopeF = ctx.slope == null ? 0.4 : Math.min(1, ctx.slope / 30);
  const earlyF = Math.min(1, s.heavy_early_mm / 120);
  const erosionRisk = (0.3 + 0.7 * slopeF) * (0.3 + 0.7 * earlyF) * (1 - effCover);
  let soilFit = null;
  if (ctx.soil) {
    const ph = phFit(ctx.soil.phh2o.mean, crop.ph);
    const wl = ctx.soil.clay.mean > 40 ? 1 - 0.3 * crop.waterlog_sens : 1;
    soilFit = ph * wl;
  }
  return {
    cropId, slotId, sat: s.sat, drought_frac: s.drought_frac, heat_frac: s.heat_frac, etc_mm: s.etc_mm, rain_mm: s.rain_mm,
    deficit_mm: s.deficit_mm, eff_cover: effCover, bare_frac: gap / win, erosion_risk: erosionRisk, soil_fit: soilFit,
    heavy_early_mm: s.heavy_early_mm,
  };
}

function pestScore(seqIds, prevIds, crops) {
  const all = [...prevIds.slice(-1), ...seqIds];
  let pen = 0;
  for (let i = 1; i < all.length; i++) {
    const a = crops[all[i - 1]], b = crops[all[i]];
    if (a.id === b.id) pen += 0.45; else if (a.family === b.family) pen += 0.3;
  }
  const fam = new Set(seqIds.map((id) => crops[id].family)).size;
  return clamp(0.7 - pen + 0.1 * (fam - 1));
}

function scoreSequence(ctx, seqIds, climId, prevIds) {
  const ms = seqIds.map((id, i) => campaignMetrics(ctx, climId, id, ctx.slotOrder[i]));
  const crops = ctx.crops;
  let bonus = 0;
  const chain = [...prevIds.slice(-1), ...seqIds];
  for (let i = 1; i < chain.length; i++) if (crops[chain[i - 1]].n_balance >= 1 && crops[chain[i]].n_balance <= -1) bonus += 0.08; // efecto precultivo leguminosa
  const market = ctx.input.market_pref || {};
  const sc = {
    erosion: clamp(1 - mean(ms.map((m) => m.erosion_risk)) / 0.5),
    organic_n: clamp(0.6 * ((mean(seqIds.map((id) => crops[id].n_balance)) + 2) / 4) + 0.4 * mean(seqIds.map((id) => crops[id].biomass)) + Math.min(bonus, 0.16)),
    water: clamp(mean(ms.map((m) => m.sat))),
    resilience: clamp(1 - (0.65 * mean(ms.map((m) => m.drought_frac)) + 0.35 * Math.min(1, mean(ms.map((m) => m.heat_frac)) / 0.25))),
    pest: pestScore(seqIds, prevIds, crops),
    market: mean(seqIds.map((id) => ((market[id] ?? (crops[id].type === 'cover' ? 1 : 3)) - 1) / 4)),
    low_cost: mean(seqIds.map((id) => 1 - (crops[id].cost - 1) / 2)),
    soil_fit: ctx.soil ? mean(ms.map((m) => m.soil_fit)) : null,
  };
  return { sc, ms };
}

function total(sc, w) {
  let t = 0, ws = 0;
  for (const k of CRITERIA) if (sc[k] != null && w[k] > 0) { t += sc[k] * w[k]; ws += w[k]; }
  return ws ? (100 * t) / ws : 0;
}

// ---------- estrategia actual (proyección del patrón declarado) ----------
function projectCurrent(history, n = 4) {
  const h = history.length;
  let p = h;
  for (let q = 1; q < h; q++) { let ok = true; for (let i = q; i < h; i++) if (history[i] !== history[i - q]) { ok = false; break; } if (ok) { p = q; break; } }
  // history[j] == history[j mod p] por definición de periodo mínimo p; se continúa el patrón
  return Array.from({ length: n }, (_, i) => history[(h + i) % p]);
}

function hamming(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }

function confidenceFor(key, spread) {
  if (key === 'water' || key === 'resilience') return spread > 0.25 ? 'baja' : spread > 0.12 ? 'media' : 'media-alta';
  return { erosion: 'baja-media', organic_n: 'baja', pest: 'media', market: 'declarada por el agricultor', low_cost: 'baja', soil_fit: 'baja (SoilGrids modelado)' }[key];
}

// ---------- ejecución principal ----------
function run(input, data) {
  const ctx = buildContext(input, data);
  const primary = ctx.climates.find((c) => c.role === 'primary') || ctx.climates[0];
  const history = (input.history || []).filter(Boolean);
  if (!history.length) throw new Error('Se requiere al menos un cultivo en el historial.');
  for (const h of history) if (!ctx.crops[h]) throw new Error(`Cultivo desconocido en historial: ${h}`);
  const weights = priorityWeights(ctx);

  // elegibilidad por posición
  const elig = ctx.slotOrder.map((slotId) => {
    const ok = [], blocked = {};
    for (const c of ctx.cropList) {
      const b = cropSlotBlockers(ctx, c.id, slotId, primary.id);
      if (b.length) blocked[c.id] = b; else ok.push(c.id);
    }
    return { slotId, ok, blocked };
  });

  // enumeración con poda
  const candidates = [];
  const seq = [];
  (function rec(i) {
    if (i === 4) { if (!sequenceBlockers(seq, history.slice(-2), ctx.crops).length) candidates.push([...seq]); return; }
    for (const id of elig[i].ok) {
      seq.push(id);
      if (!sequenceBlockers(seq, history.slice(-2), ctx.crops).length) rec(i + 1);
      seq.pop();
    }
  })(0);

  const curSeq = projectCurrent(history);
  const prev = history;
  const evalAll = (s) => {
    const per = {};
    for (const c of ctx.climates) per[c.id] = scoreSequence(ctx, s, c.id, prev);
    return per;
  };
  const scored = candidates.map((s) => {
    const per = evalAll(s);
    const totals = Object.fromEntries(ctx.climates.map((c) => [c.id, total(per[c.id].sc, weights)]));
    return { seq: s, per, totals, primary: totals[primary.id], worst: Math.min(...Object.values(totals)) };
  });
  const curKey = curSeq.join('|');
  const pool = scored.filter((c) => c.seq.join('|') !== curKey);
  if (pool.length < 2) throw new Error('No se encontraron al menos dos alternativas agronómicamente viables con los datos y restricciones actuales.');
  pool.sort((a, b) => b.primary - a.primary);
  const altA = pool[0];
  const rest = pool.filter((c) => hamming(c.seq, altA.seq) >= 2).sort((a, b) => b.worst - a.worst || b.primary - a.primary);
  const altB = rest[0] || pool[1];

  // sensibilidad a pesos (MC, semilla fija -> reproducible)
  const rnd = mulberry32(20260);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const N = 300;
  let aTop = 0, aBeatsCur = 0, bBeatsCur = 0;
  const curEval = evalAll(curSeq);
  for (let n = 0; n < N; n++) {
    const w = {}; let s = 0;
    for (const k of CRITERIA) { w[k] = weights[k] * Math.exp(0.35 * gauss()); s += w[k]; }
    for (const k of CRITERIA) w[k] /= s;
    let best = null, bestT = -1;
    for (const c of scored) { const t = total(c.per[primary.id].sc, w); if (t > bestT) { bestT = t; best = c; } }
    if (best === altA) aTop++;
    const tc = total(curEval[primary.id].sc, w);
    if (total(altA.per[primary.id].sc, w) > tc) aBeatsCur++;
    if (total(altB.per[primary.id].sc, w) > tc) bBeatsCur++;
  }

  const describe = (id, label, seqIds, per, tot, extra = {}) => describeStrategy(ctx, id, label, seqIds, per, tot, weights, primary, extra);
  const curBlockers = [];
  for (let i = 0; i < 4; i++) { const b = cropSlotBlockers(ctx, curSeq[i], ctx.slotOrder[i], primary.id); b.forEach((x) => curBlockers.push(`Campaña ${i + 1} (${ctx.crops[curSeq[i]].name}): ${x}`)); }
  sequenceBlockers(curSeq, history.slice(-2), ctx.crops).forEach((x) => curBlockers.push(x));
  const curViolations = [...new Set(curBlockers)];

  const strategies = [
    describe('current', 'Su rotación actual (proyectada)', curSeq, curEval, Object.fromEntries(ctx.climates.map((c) => [c.id, total(curEval[c.id].sc, weights)])), { violations: curViolations }),
    describe('alt_a', 'Alternativa A · mejor ajuste a sus prioridades', altA.seq, altA.per, altA.totals, { top_freq: aTop / N, beats_current: aBeatsCur / N }),
    describe('alt_b', 'Alternativa B · más robusta ante la incertidumbre de lluvia', altB.seq, altB.per, altB.totals, { beats_current: bBeatsCur / N }),
  ];

  // robustez entre fuentes de lluvia
  const robustness = ctx.climates.map((c) => {
    const t = Object.fromEntries(strategies.map((s) => [s.id, s.totals_by_source[c.id]]));
    const ranking = Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { source: c.id, label: c.label, role: c.role, totals: t, ranking, annual_precip_mm: c.climate.annual.precip_mm, annual_et0_mm: c.climate.annual.et0_mm };
  });
  const bestPerSource = robustness.map((r) => r.ranking[0]);
  const curBeatenEverywhere = robustness.every((r) => r.ranking.indexOf('current') === 2 || r.totals.current < Math.max(r.totals.alt_a, r.totals.alt_b));

  return {
    engine_version: ENGINE_VERSION,
    generated_at: new Date().toISOString(),
    weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, +v.toFixed(3)])),
    weights_status: 'PROVISIONALES: derivadas de las prioridades del agricultor; no calibradas con datos de campo.',
    candidates_evaluated: candidates.length,
    eligibility: elig.map((e) => ({ slot: e.slotId, ok: e.ok, blocked: e.blocked })),
    strategies,
    robustness: {
      by_source: robustness,
      best_per_source: bestPerSource,
      all_sources_prefer_an_alternative_to_current: curBeatenEverywhere,
      note: 'Los productos de lluvia disponibles discrepan; la conclusión se considera robusta sólo si se mantiene en todas las fuentes.',
    },
    sensitivity: {
      draws: N, perturbation: 'pesos × exp(N(0, 0.35²)), semilla fija',
      alt_a_is_top: aTop / N, alt_a_beats_current: aBeatsCur / N, alt_b_beats_current: bBeatsCur / N,
    },
    context: {
      slope_pct: ctx.slope, soil: ctx.soil, irrigated: ctx.irrigated, start_slot: input.start_slot || 'A', history,
    },
  };
}

// ---------- explicación ----------
function describeStrategy(ctx, id, label, seqIds, per, totals, weights, primary, extra) {
  const crops = ctx.crops;
  const P = per[primary.id];
  const spread = {};
  for (const k of CRITERIA) {
    const vals = ctx.climates.map((c) => per[c.id].sc[k]).filter((v) => v != null);
    spread[k] = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  }
  const criteria = {};
  for (const k of CRITERIA) {
    if (P.sc[k] == null) { criteria[k] = { label: CRITERIA_LABEL[k], score: null, weight: 0, note: 'Sin datos: criterio omitido y pesos renormalizados.', confidence: '—' }; continue; }
    criteria[k] = { label: CRITERIA_LABEL[k], score: +P.sc[k].toFixed(3), weight: +weights[k].toFixed(3), confidence: confidenceFor(k, spread[k]), spread_across_sources: +spread[k].toFixed(3) };
  }
  const timeline = seqIds.map((cid, i) => {
    const m = P.ms[i], crop = crops[cid], slot = ctx.slotById[ctx.slotOrder[i]];
    return {
      campaign: i + 1, slot: slot.id, slot_label: slot.label, year_offset: Math.floor((i + (ctx.slotOrder[0] === 'B' ? 1 : 0)) / 2),
      crop: cid, crop_name: crop.name, family: crop.family, cycle_days: cycleLength(crop),
      etc_mm: Math.round(m.etc_mm), rain_mm: Math.round(m.rain_mm), water_deficit_mm: Math.round(m.deficit_mm),
      water_coverage_pct: Math.round(m.sat * 100), drought_year_frac: +m.drought_frac.toFixed(2), heat_stress_frac: +m.heat_frac.toFixed(2),
      bare_soil_pct: Math.round(m.bare_frac * 100), eff_cover_pct: Math.round(m.eff_cover * 100),
    };
  });
  const risks = [], reasons = [];
  timeline.forEach((t) => {
    if (t.drought_year_frac >= 0.3 && !ctx.irrigated) risks.push(`${t.crop_name} (campaña ${t.campaign}): en ${Math.round(t.drought_year_frac * 100)} % de los años analizados el cultivo habría tenido déficit hídrico (ETa/ETc < 80 %).`);
    if (t.heat_stress_frac >= 0.15) risks.push(`${t.crop_name} (campaña ${t.campaign}): ${Math.round(t.heat_stress_frac * 100)} % de los días de la etapa media superaron el umbral de calor del cultivo.`);
    if (t.bare_soil_pct >= 25) risks.push(`${t.crop_name} (campaña ${t.campaign}): ~${t.bare_soil_pct} % de la ventana queda sin cultivo (suelo expuesto o con residuos).`);
  });
  seqIds.forEach((cid, i) => {
    const prev = i === 0 ? ctx.input.history.slice(-1)[0] : seqIds[i - 1];
    if (prev && crops[prev].family === crops[cid].family) risks.push(`Repite familia botánica (${crops[cid].family}) entre campañas ${i === 0 ? '(historial → 1)' : `${i} → ${i + 1}`}: favorece acumulación de plagas/enfermedades comunes.`);
    if (ctx.soil && phFit(ctx.soil.phh2o.mean, crops[cid].ph) < 0.7) risks.push(`${crops[cid].name}: pH estimado del suelo (${ctx.soil.phh2o.mean.toFixed(1)}) fuera del rango óptimo ${crops[cid].ph[0]}–${crops[cid].ph[1]}.`);
  });
  const legumes = seqIds.filter((c) => crops[c].family === 'Fabaceae').length;
  if (legumes) reasons.push(`Incluye ${legumes} campaña(s) con leguminosas (fijación biológica de N: efecto cualitativo, sin cantidad estimada).`);
  const fams = new Set(seqIds.map((c) => crops[c].family)).size;
  reasons.push(`Diversidad: ${fams} familia(s) botánica(s) en 4 campañas.`);
  return {
    id, label, sequence: seqIds, timeline, criteria,
    score: +totals[primary.id].toFixed(1), totals_by_source: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +v.toFixed(1)])),
    reasons, risks, ...extra,
    assumptions: [
      'Cada campaña se siembra al inicio de su ventana (A: 1-nov; B: 15-abr).',
      'Estrés hídrico: balance diario del agua en la zona radicular (FAO-56 cap. 8) con ET0 Penman-Monteith calculada con datos NASA POWER (viento acotado a ≥0,5 m/s) y la lluvia de la fuente indicada.',
      'Los índices de cobertura, N y costo son ordinales de criterio experto, no medidas.',
      ctx.irrigated ? 'Se asume riego disponible: reduce, pero no elimina, el riesgo de sequía (factor 0,3).' : 'Secano: sin riego complementario.',
    ],
    unknowns: [
      'Fertilidad química real de la parcela (requiere análisis de laboratorio).',
      'Presión real de plagas y enfermedades en su zona.',
      'Variedades, densidades de siembra y manejo.',
      'Precios, costos y disponibilidad de mercado en el momento de la decisión.',
    ],
    specialist_check: [
      'Validar con un técnico agrícola local la ventana de siembra y las variedades.',
      'Confirmar el pH y la materia orgánica con análisis de suelo antes de incluir leguminosas sensibles a acidez.',
      'Contrastar la lluvia de la zona con datos de estación (SENAMHI) si están disponibles.',
    ],
  };
}

module.exports = { run, projectCurrent, scoreSequence, priorityWeights, total, CRITERIA, CRITERIA_LABEL, ENGINE_VERSION, buildContext, mulberry32 };
