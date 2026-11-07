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
const { evaluateSeason, SLOTS, cycleLength, awcFromSoil, tempUncertainty, coverOf } = require('./climate');

const ENGINE_VERSION = '0.2.0';
const CRITERIA = ['erosion', 'organic_n', 'water', 'resilience', 'pest', 'market', 'low_cost', 'soil_fit', 'thermal'];
const CRITERIA_LABEL = {
  erosion: 'Protección contra erosión', organic_n: 'Materia orgánica y nitrógeno', water: 'Suficiencia de agua',
  resilience: 'Resiliencia (sequía / calor)', pest: 'Ruptura de ciclos de plagas', market: 'Interés de mercado (declarado)',
  low_cost: 'Bajo costo de insumos', soil_fit: 'Ajuste al suelo (pH / drenaje)', thermal: 'Ajuste térmico (ciclo completable con la temperatura estimada)',
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
    elev: (data.climates.find((c) => c.role === 'primary') || data.climates[0]).climate.elevation_m,
    dT: tempUncertainty((data.climates.find((c) => c.role === 'primary') || data.climates[0]).climate),
  };
}

function season(ctx, climId, cropId, slotId, dT = 0) {
  const k = `${climId}|${cropId}|${slotId}|${dT.toFixed(2)}`;
  if (!ctx.seasonCache.has(k)) {
    const clim = ctx.climates.find((c) => c.id === climId).climate;
    ctx.seasonCache.set(k, evaluateSeason(clim, ctx.crops[cropId], ctx.slotById[slotId], ctx.irrigated, ctx.awc, { dT }));
  }
  return ctx.seasonCache.get(k);
}

// ---------- reglas eliminatorias por cultivo/campaña ----------
function cropSlotBlockers(ctx, cropId, slotId, primaryId) {
  const crop = ctx.crops[cropId], slot = ctx.slotById[slotId], out = [];
  const s = season(ctx, primaryId, cropId, slotId);
  if (!s) { out.push('sin datos climáticos suficientes'); return out; }
  // Exclusión (no solo penalización): el ciclo no se completa en la mitad o más de los años con la temperatura estimada.
  if (s.complete_frac < 0.5) out.push(`no completa su ciclo (${cycleLength(crop)} días efectivos) en la campaña: con la temperatura estimada solo lo logra en ${Math.round(s.complete_frac * 100)} % de los años dentro de ${s.max_days} días (límite = menor entre la ventana de ${slot.window_days} d y EcoCrop GMAX ${crop.eco?.gmax ?? '—'} d)`);
  if (crop.eco?.altmx != null && ctx.elev > crop.eco.altmx) out.push(`altitud ${Math.round(ctx.elev)} m por encima del máximo de EcoCrop para el cultivo (${crop.eco.altmx} m)`);
  if (crop.regime === 'irrigated_required' && !ctx.irrigated) out.push('requiere riego/inundación y la parcela no dispone de riego');
  if (!ctx.irrigated && crop.regime !== 'irrigated_required' && s.sat < 0.5) out.push(`déficit hídrico severo en secano (ETa/ETc mediana ${(s.sat * 100).toFixed(0)} %)`);
  if (ctx.slope != null && ctx.slope > 25 && coverOf(crop) < 0.5) out.push(`pendiente ${ctx.slope.toFixed(0)} % demasiado alta para un cultivo de baja cobertura`);
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
    thermal: 1.5, // peso FIJO de diseño (no es una prioridad del agricultor): ~7 % si todos los criterios valen 3
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
  const crop = ctx.crops[cropId], shift = ctx.dTdraw ?? 0, s = season(ctx, climId, cropId, slotId, shift);
  const sCold = ctx.dTdraw !== undefined ? s : season(ctx, climId, cropId, slotId, -ctx.dT);
  const win = ctx.slotById[slotId].window_days, cycle = s.dur_days ?? s.max_days, gap = Math.max(0, win - cycle);
  const effCover = (coverOf(crop) * cycle + 0.25 * crop.biomass * gap) / win;
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
    cropId, slotId, tmean: s.tmean, dur_days: s.dur_days, cf_base: s.complete_frac, cf_cold: sCold.complete_frac, sat: ctx.irrigated ? 1 - 0.3 * (1 - s.sat) : s.sat, /* SUPUESTO: el riego reduce (no elimina) el déficit, igual que el riesgo (x0,3) */ drought_frac: s.drought_frac, heat_frac: s.heat_frac, etc_mm: s.etc_mm, rain_mm: s.rain_mm,
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
    thermal: mean(ms.map((m) => 0.5 * m.cf_base + 0.5 * m.cf_cold)), // 1 = completa el ciclo aun con T−δ
  };
  return { sc, ms, feasible: ms.every((m) => m.cf_base >= 0.5) };
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
  return { erosion: 'baja-media', organic_n: 'baja', pest: 'media', market: 'declarada por el agricultor', low_cost: 'baja', soil_fit: 'baja (SoilGrids modelado)', thermal: 'media-baja (T estimada, EcoCrop general)' }[key];
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
  pool.sort((a, b) => b.primary - a.primary);
  const altA = pool[0] || null;
  const rest = altA ? pool.filter((c) => hamming(c.seq, altA.seq) >= 2).sort((a, b) => b.worst - a.worst || b.primary - a.primary) : [];
  const altB = altA ? (rest[0] || pool[1] || null) : null;

  // Incertidumbre combinada (Monte Carlo, semilla fija -> reproducible). En cada sorteo varían a la vez:
  // pesos (log-normal σ=0,35), escalas ORDINALES de los cultivos (± medio paso), fuente de lluvia y desplazamiento de temperatura (−δ, 0, +δ).
  const curEval = evalAll(curSeq);
  const rnd = mulberry32(20260);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const U = (h) => (2 * rnd() - 1) * h;
  const N = 400, TOPK = 60;
  const topK = [...scored].sort((a, b) => b.primary - a.primary).slice(0, TOPK);
  if (altA && !topK.includes(altA)) topK.push(altA);
  if (altB && !topK.includes(altB)) topK.push(altB);
  const D = ctx.dT;
  const acc = { aTop: 0, aBeatsCur: 0, bBeatsCur: 0, aBeatsB: 0, dAC: [], dAB: [], dBC: [], feas: { cur: 0, a: 0, b: 0 } };
  for (let n = 0; n < N; n++) {
    const w = {}; let ws = 0;
    for (const k of CRITERIA) { w[k] = weights[k] * Math.exp(0.35 * gauss()); ws += w[k]; }
    for (const k of CRITERIA) w[k] /= ws;
    const crops2 = Object.fromEntries(Object.entries(ctx.crops).map(([id, c]) => [id, { ...c,
      cover: clamp(c.cover + U(0.15)), biomass: clamp(c.biomass + U(0.15)), n_balance: clamp(c.n_balance + U(0.5), -2, 2),
      cost: clamp(c.cost + U(0.5), 1, 3), waterlog_sens: clamp(c.waterlog_sens + U(0.15)) }]));
    const u = rnd(), dTd = u < 0.25 ? -D : u > 0.75 ? D : 0;
    const climId = ctx.climates[Math.floor(rnd() * ctx.climates.length)].id;
    const c2 = { ...ctx, crops: crops2, dTdraw: dTd };
    const tot = (seq) => { const r = scoreSequence(c2, seq, climId, prev); return { t: r.feasible ? total(r.sc, w) : 0, ok: r.feasible }; };
    let best = null, bestT = -1;
    for (const c of topK) { const t = tot(c.seq).t; if (t > bestT) { bestT = t; best = c; } }
    if (best === altA) acc.aTop++;
    const tc = tot(curSeq), ta = altA ? tot(altA.seq) : { t: 0, ok: false }, tb = altB ? tot(altB.seq) : { t: 0, ok: false };
    if (tc.ok) acc.feas.cur++; if (ta.ok) acc.feas.a++; if (tb.ok) acc.feas.b++;
    if (ta.t > tc.t) acc.aBeatsCur++; if (tb.t > tc.t) acc.bBeatsCur++; if (ta.t > tb.t) acc.aBeatsB++;
    acc.dAC.push(ta.t - tc.t); acc.dAB.push(ta.t - tb.t); acc.dBC.push(tb.t - tc.t);
  }
  const q = (a, p) => { const x = [...a].sort((m, n2) => m - n2); return x[Math.min(x.length - 1, Math.floor(p * x.length))]; };
  const verdict = (pFirst, deltas, nameA, nameB) => {
    const med = q(deltas, 0.5);
    if (Math.abs(med) < 2) return { text: `${nameA} y ${nameB} son prácticamente equivalentes (diferencia mediana ${med.toFixed(1)} puntos).`, level: 'equivalentes' };
    const win = med > 0 ? nameA : nameB, p = med > 0 ? pFirst : 1 - pFirst;
    if (p >= 0.9) return { text: `${win} es claramente preferible (gana en ${Math.round(p * 100)} % de los sorteos; diferencia mediana ${Math.abs(med).toFixed(1)} puntos).`, level: 'claramente_preferible' };
    if (p >= 0.7) return { text: `${win} es probablemente preferible (gana en ${Math.round(p * 100)} % de los sorteos).`, level: 'probablemente_preferible' };
    return { text: `No hay una preferencia clara entre ${nameA} y ${nameB} con la incertidumbre actual (${nameA} gana en ${Math.round(pFirst * 100)} % de los sorteos).`, level: 'indistinguibles' };
  };
  const cmp = (p, d, a, b) => ({ ...verdict(p, d, a, b), p_first: +p.toFixed(2), delta_p05_p50_p95: [q(d, 0.05), q(d, 0.5), q(d, 0.95)].map((x) => +x.toFixed(1)) });
  const comparisons = {};
  if (altA) comparisons.a_vs_current = cmp(acc.aBeatsCur / N, acc.dAC, 'La alternativa A', 'su rotación actual');
  if (altB) { comparisons.b_vs_current = cmp(acc.bBeatsCur / N, acc.dBC, 'La alternativa B', 'su rotación actual'); comparisons.a_vs_b = cmp(acc.aBeatsB / N, acc.dAB, 'La alternativa A', 'la alternativa B'); }
  const aTop = acc.aTop, aBeatsCur = acc.aBeatsCur, bBeatsCur = acc.bBeatsCur;

  const describe = (id, label, seqIds, per, tot, extra = {}) => describeStrategy(ctx, id, label, seqIds, per, tot, weights, primary, extra);
  const curBlockers = [];
  for (let i = 0; i < 4; i++) { const b = cropSlotBlockers(ctx, curSeq[i], ctx.slotOrder[i], primary.id); b.forEach((x) => curBlockers.push(`Campaña ${i + 1} (${ctx.crops[curSeq[i]].name}): ${x}`)); }
  sequenceBlockers(curSeq, history.slice(-2), ctx.crops).forEach((x) => curBlockers.push(x));
  const curViolations = [...new Set(curBlockers)];

  const strategies = [
    describe('current', 'Su rotación actual (proyectada)', curSeq, curEval, Object.fromEntries(ctx.climates.map((c) => [c.id, total(curEval[c.id].sc, weights)])), { violations: curViolations }),
    ...(altA ? [describe('alt_a', 'Alternativa A · mejor ajuste a sus prioridades', altA.seq, altA.per, altA.totals, { top_freq: aTop / N, beats_current: aBeatsCur / N })] : []),
    ...(altB ? [describe('alt_b', 'Alternativa B · más robusta ante la incertidumbre de lluvia', altB.seq, altB.per, altB.totals, { beats_current: bBeatsCur / N })] : []),
  ];
  const limitations = [];
  if (!altA) limitations.push('Con el clima, la altitud y las restricciones de esta ubicación no se encontró ninguna alternativa viable distinta de su rotación actual. No es responsable recomendar un cambio con estos datos.');
  else if (!altB) limitations.push('Solo se encontró una alternativa viable: las condiciones de la ubicación limitan fuertemente las opciones.');
  const viableCrops = [...new Set(elig.flatMap((e) => e.ok))];
  if (viableCrops.length <= 4) limitations.push(`Solo ${viableCrops.length} de los ${ctx.cropList.length} cultivos de la base son viables aquí (${viableCrops.map((id) => ctx.crops[id].name).join(', ') || 'ninguno'}); la base no incluye cultivos propios de este piso altitudinal.`);

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
    strategies, limitations,
    robustness: {
      by_source: robustness,
      best_per_source: bestPerSource,
      all_sources_prefer_an_alternative_to_current: curBeatenEverywhere,
      note: 'Los productos de lluvia disponibles discrepan; la conclusión se considera robusta sólo si se mantiene en todas las fuentes.',
    },
    sensitivity: {
      draws: N, topk: topK.length,
      perturbation: `pesos × exp(N(0, 0.35²)); escalas ordinales ± medio paso (cobertura/biomasa/encharcamiento ±0,15; N ±0,5; costo ±0,5); fuente de lluvia al azar; temperatura −δ/0/+δ con δ=${D.toFixed(1)} °C; semilla fija`,
      temperature_uncertainty_c: +D.toFixed(2),
      alt_a_is_top: aTop / N, alt_a_beats_current: aBeatsCur / N, alt_b_beats_current: bBeatsCur / N,
      viable_fraction: { current: acc.feas.cur / N, alt_a: acc.feas.a / N, alt_b: acc.feas.b / N },
      comparisons,
      note: 'La estabilidad del ranking mide sensibilidad a la incertidumbre declarada; NO es validación agronómica.',
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
      cycle_days_effective: cycleLength(crop), duration_days: m.dur_days, tmean_c: Number.isFinite(m.tmean) ? +m.tmean.toFixed(1) : null,
      thermal: { complete_frac: +m.cf_base.toFixed(2), complete_frac_cold: +m.cf_cold.toFixed(2), status: m.cf_base < 0.5 ? 'no_viable' : m.cf_cold >= 0.9 ? 'viable' : 'marginal' },
      bare_soil_pct: Math.round(m.bare_frac * 100), eff_cover_pct: Math.round(m.eff_cover * 100),
    };
  });
  const risks = [], reasons = [];
  timeline.forEach((t) => {
    if (t.drought_year_frac >= 0.3 && !ctx.irrigated) risks.push(`${t.crop_name} (campaña ${t.campaign}): en ${Math.round(t.drought_year_frac * 100)} % de los años analizados el cultivo habría tenido déficit hídrico (ETa/ETc < 80 %).`);
    if (t.heat_stress_frac >= 0.15) risks.push(`${t.crop_name} (campaña ${t.campaign}): ${Math.round(t.heat_stress_frac * 100)} % de los días de la etapa media superaron el umbral de calor del cultivo.`);
    if (t.thermal.status === 'marginal') risks.push(`${t.crop_name} (campaña ${t.campaign}): depende de la temperatura. Con la estimada el ciclo dura ~${t.duration_days} días (base ${t.cycle_days_effective}); si la temperatura real fuera ${ctx.dT.toFixed(1)} °C menor, solo se completaría en ${Math.round(t.thermal.complete_frac_cold * 100)} % de los años.`);
    else if (t.thermal.status === 'viable' && t.duration_days > 1.15 * t.cycle_days_effective) risks.push(`${t.crop_name} (campaña ${t.campaign}): el ciclo se alarga por temperatura (~${t.duration_days} días frente a ${t.cycle_days_effective} base).`);
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
      `Temperatura: NASA POWER corregida por altitud (−6,5 °C/km; estimativa) con incertidumbre ±${ctx.dT.toFixed(1)} °C. La duración del ciclo se calcula por tiempo térmico (rangos EcoCrop por especie, no por variedad); suponer que el ciclo base corresponde a temperatura óptima es un supuesto.`,
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
