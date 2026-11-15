'use strict';
/**
 * Resúmenes COMPACTOS del análisis del motor para Cropi. Nunca se envía el resultado completo, ni series meteorológicas,
 * ni bases de datos: solo lo necesario para explicar. Todo viene del resultado real del motor (nada se calcula ni se inventa aquí).
 */
const MAX_CONTEXT_CHARS = 7000;

const cut = (s, n = 220) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const num = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);

/** Nombre legible de cada cultivo según la línea de tiempo de las estrategias. */
function cropNames(result) {
  const m = {};
  for (const s of result.strategies || []) for (const t of s.timeline || []) if (t.crop && t.crop_name) m[t.crop] = t.crop_name;
  return m;
}
const seqNames = (s, names) => (s.sequence || []).map((c) => names[c] || c);

function strategyBrief(s, names) {
  return {
    id: s.id, label: s.label, score_0_100: s.score, sequence: seqNames(s, names),
    campaigns: (s.timeline || []).map((t) => ({ n: t.campaign, slot: t.slot_label || t.slot, crop: t.crop_name || t.crop, viability: t.viability && t.viability.status, severity: t.viability && t.viability.severity || undefined })),
    top_reasons: (s.reasons || []).slice(0, 3).map((x) => cut(x)),
    top_risks: (s.risks || []).slice(0, 3).map((x) => cut(x)),
    viability_note: s.viability_note ? cut(Array.isArray(s.viability_note) ? s.viability_note.join(' ') : s.viability_note, 300) : undefined,
  };
}

function inputBrief(input) {
  if (!input) return null;
  return {
    lat: num(input.lat, 4), lon: num(input.lon, 4), area_ha: input.area_ha ?? null,
    irrigation: input.irrigation === true ? 'sí (declarado)' : input.irrigation === false ? 'no (declarado, secano)' : 'no declarado',
    start_slot: input.start_slot, history: input.history,
    declared_precisa: {
      supply_m3_ha: input.water && input.water.supply_m3_ha != null ? input.water.supply_m3_ha : undefined,
      percolation_mm_day: input.water && input.water.percolation_mm_day != null ? input.water.percolation_mm_day : undefined,
      soil: input.soil || undefined, first_sowing_date: input.first_sowing_date || undefined, cycle_days: input.cycle_days || undefined, keep_main: input.keep_main || undefined,
      economics_declared: !!input.economics,
    },
  };
}

/** Resumen principal (get_current_analysis y mensaje de contexto). */
function summarize(result, input) {
  if (!result) return { available: false };
  if (result.unsupported) return { available: true, unsupported: true, input: inputBrief(input), limitations: (result.limitations || []).map((x) => cut(x, 300)), note: 'El motor NO generó estrategias para esta ubicación.' };
  const names = cropNames(result), out = {
    available: true, engine: result.engine, engine_version: result.engine_version, generated_at: result.generated_at,
    input: inputBrief(input),
    support: result.support && { level: result.support.level, cautions: (result.support.cautions || []).map((x) => cut(x, 260)), blockers: result.support.blockers },
    strategies: (result.strategies || []).map((s) => strategyBrief(s, names)),
    sensitive_to_assumptions: !!result.sensitive_to_assumptions,
    sensitivity: result.sensitivity && result.sensitivity.comparisons && Object.fromEntries(Object.entries(result.sensitivity.comparisons).map(([k, v]) => [k, v && v.text])),
    no_viable: result.no_viable || null,
    provenance_counts: result.provenance && result.provenance.summary,
    economics: result.economics && { provided: result.economics.provided, complete: result.economics.complete, note: cut(result.economics.note, 220) },
    water: result.water && { supply_basis: result.water.supply_basis, supply_category: result.water.supply_category, rice_percolation_mm_day: result.water.rice_percolation_mm_day, rice_percolation_range: result.water.rice_percolation_range },
    limitations: (result.limitations || []).map((x) => cut(x, 260)),
    point: result.location_report && result.location_report.point,
    scores_note: 'Los puntajes (0–100) son relativos para comparar opciones; no son rendimientos ni ganancias.',
  };
  let json = JSON.stringify(out);
  if (json.length > MAX_CONTEXT_CHARS) { for (const s of out.strategies) { s.campaigns = undefined; s.top_reasons = (s.top_reasons || []).slice(0, 1); s.top_risks = (s.top_risks || []).slice(0, 1); } json = JSON.stringify(out); }
  return out;
}

const contextJson = (result, input) => { const j = JSON.stringify(summarize(result, input)); return j.length > MAX_CONTEXT_CHARS ? j.slice(0, MAX_CONTEXT_CHARS) + '…(recortado)' : j; };

/** Detalle de una estrategia (y opcionalmente de una campaña). */
function strategyDetail(result, id, campaign) {
  const names = cropNames(result), s = (result.strategies || []).find((x) => x.id === id);
  if (!s) return { found: false, available: (result.strategies || []).map((x) => x.id) };
  const tl = (s.timeline || []).filter((t) => !campaign || t.campaign === campaign).map((t) => ({
    campaign: t.campaign, slot: t.slot_label, crop: t.crop_name, family: t.family, sowing_md: t.sowing_md, sowing_declared: t.sowing_declared,
    cycle_days: t.cycle_days_effective, duration_days: t.duration_days, duration_range_days: t.duration_range_days,
    etc_mm: t.etc_mm, rain_mm: t.rain_mm, water_need_mm: t.water_need_mm, water_need_range_mm: t.water_need_range_mm, water_deficit_mm: t.water_deficit_mm, water_coverage_pct: t.water_coverage_pct,
    heat_stress_frac: t.heat_stress_frac, heat_range: t.heat_range, tmean_c: t.tmean_c,
    viability: t.viability && { status: t.viability.status, severity: t.viability.severity, reasons: t.viability.reasons, local_evidence: t.viability.local_evidence, uncertainty: t.viability.uncertainty },
  }));
  return {
    found: true, id: s.id, label: s.label, sequence: seqNames(s, names), score_0_100: s.score,
    criteria: Object.fromEntries(Object.entries(s.criteria || {}).map(([k, v]) => [k, { label: v.label, score_0_1: v.score, weight: v.weight }])),
    campaigns: tl, reasons: (s.reasons || []).slice(0, 6).map((x) => cut(x, 300)), risks: (s.risks || []).slice(0, 6).map((x) => cut(x, 300)),
    violations: s.violations, viability_note: s.viability_note, assumptions: s.assumptions, unknowns: s.unknowns, specialist_check: s.specialist_check,
    economics: s.economics,
  };
}

function compare(result) {
  const names = cropNames(result);
  return {
    strategies: (result.strategies || []).map((s) => ({ id: s.id, label: s.label, sequence: seqNames(s, names), score_0_100: s.score, criteria_0_1: Object.fromEntries(Object.entries(s.criteria || {}).map(([k, v]) => [v.label || k, num(v.score, 2)])), scores_by_source: s.totals_by_source })),
    weights: result.weights, weights_status: cut(result.weights_status, 300),
    sensitivity: result.sensitivity && { note: cut(result.sensitivity.note, 300), draws: result.sensitivity.draws, comparisons: result.sensitivity.comparisons },
    sensitive_to_assumptions: !!result.sensitive_to_assumptions,
  };
}

function water(result) {
  const names = cropNames(result);
  return {
    water: result.water, water_scenarios: result.water_scenarios || null,
    by_strategy: (result.strategies || []).map((s) => ({ id: s.id, campaigns: (s.timeline || []).map((t) => ({ campaign: t.campaign, crop: names[t.crop] || t.crop, water_need_mm: t.water_need_mm, water_need_range_mm: t.water_need_range_mm, water_deficit_mm: t.water_deficit_mm, water_coverage_pct: t.water_coverage_pct, etc_mm: t.etc_mm, rain_mm: t.rain_mm })) })),
    note: 'Demanda neta de riego = ETc − lluvia (+ saturación y percolación en el arroz). Cobertura solo existe si el agricultor declaró volumen de agua.',
  };
}

function climate(result) {
  const dq = result.data_quality || {};
  return {
    temperature: result.temperature,
    sources: (dq.climate_summary || []).map((c) => ({ id: c.id, label: c.label, role: c.role, annual_precip_mm: c.annual_precip_mm, annual_et0_mm: c.annual_et0_mm, years: c.years })),
    source_weights: result.source_weights, missing: dq.missing, problems: dq.problems,
    location: result.location_report && { point: result.location_report.point, uses_cells: result.location_report.uses_cells, note: cut(result.location_report.note, 300), fallbacks: result.location_report.fallbacks },
    support: result.support,
  };
}

module.exports = { summarize, contextJson, strategyDetail, compare, water, climate, cropNames, cut, MAX_CONTEXT_CHARS };
