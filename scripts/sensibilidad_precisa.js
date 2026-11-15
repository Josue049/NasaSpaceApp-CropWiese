'use strict';
/**
 * ¿Precisa es realmente más preciso? Cada campo se modifica de forma AISLADA respecto de la base (Instantánea: nada declarado) y se mide
 * qué cambia: viabilidad, puntaje, ganador, incertidumbre, demanda de agua, calor y procedencia.
 *   node scripts/sensibilidad_precisa.js  → docs/PRECISA_SENSIBILIDAD.md y data/validation/sensibilidad_precisa.json
 * Un campo que no cambia nada en NINGUNA variante debe eliminarse de la interfaz o justificarse como informativo.
 */
process.env.FIELDSHIFT_DOMAIN = 'morropon';
const fs = require('fs'), path = require('path');
const P = require('../src/pipeline');
const ROOT = path.join(__dirname, '..');
const short = (seq) => seq.map((c) => ({ arroz: 'A', loctao: 'L' }[c] || c)).join('');
const base = (o = {}) => ({ lat: -5.19, lon: -79.99, area_ha: 0, irrigation: null, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {}, engine: 'v2', ...o });

function signature(r) {
  const v = r.viability, flat = {};
  for (const [c, o] of Object.entries(v)) for (const [s, x] of Object.entries(o)) flat[`${c}.${s}`] = { st: x.status + (x.severity ? ':' + x.severity : ''), need: x.net_water_need_mm, heat: x.heat_frac, dur: x.duration_days };
  const a = r.strategies[1] || null, cur = r.strategies[0];
  return { viab: flat, top: a ? short(a.sequence) : '—', top_score: a ? a.score : null, cur_score: cur ? cur.score : null, n_rec: r.candidates_recommendable, top_freq: a ? +(a.top_freq ?? 0).toFixed(2) : null,
    sens: !!r.sensitive_to_assumptions, verdict: r.sensitivity.comparisons.a_vs_current ? r.sensitivity.comparisons.a_vs_current.level : '—', no_viable: !!r.no_viable,
    prov: Object.fromEntries(r.provenance.items.map((i) => [i.id, i.cat + ':' + i.value])), used: r.inputs_used.map((u) => u.field), weights: JSON.stringify(a ? a.criteria : {}) };
}
function diff(b, s) {
  const out = [];
  const vch = Object.keys(b.viab).filter((k) => b.viab[k].st !== s.viab[k].st); if (vch.length) out.push('viabilidad: ' + vch.map((k) => `${k} ${b.viab[k].st}→${s.viab[k].st}`).join(', '));
  const nch = Object.keys(b.viab).filter((k) => Math.abs(b.viab[k].need - s.viab[k].need) >= 30); if (nch.length) out.push('demanda de agua: ' + nch.map((k) => `${k} ${b.viab[k].need}→${s.viab[k].need} mm`).join(', '));
  const hch = Object.keys(b.viab).filter((k) => Math.abs(b.viab[k].heat - s.viab[k].heat) >= 0.05); if (hch.length) out.push('calor: ' + hch.map((k) => `${k} ${Math.round(100 * b.viab[k].heat)}→${Math.round(100 * s.viab[k].heat)} %`).join(', '));
  const dch = Object.keys(b.viab).filter((k) => Math.abs(b.viab[k].dur - s.viab[k].dur) >= 3); if (dch.length) out.push('duración: ' + dch.map((k) => `${k} ${b.viab[k].dur}→${s.viab[k].dur} d`).join(', '));
  if (b.top !== s.top) out.push(`ganador: ${b.top}→${s.top}`);
  else if (b.top_score !== s.top_score) out.push(`puntaje de la alternativa: ${b.top_score}→${s.top_score}`);
  if (b.cur_score !== s.cur_score) out.push(`puntaje de la actual: ${b.cur_score}→${s.cur_score}`);
  if (b.sens !== s.sens) out.push(`sensibilidad a supuestos: ${b.sens ? 'sí' : 'no'}→${s.sens ? 'sí' : 'no'}`);
  if (b.verdict !== s.verdict) out.push(`veredicto: ${b.verdict}→${s.verdict}`);
  if (b.top_freq !== s.top_freq && b.top === s.top) out.push(`estabilidad del ganador: ${b.top_freq}→${s.top_freq}`);
  if (b.no_viable !== s.no_viable) out.push(`${s.no_viable ? 'pasa a «sin alternativa recomendable»' : 'aparecen alternativas'}`);
  const pch = Object.keys(b.prov).filter((k) => b.prov[k].split(':')[0] !== s.prov[k].split(':')[0]); if (pch.length) out.push('procedencia: ' + pch.map((k) => `${k} ${b.prov[k].split(':')[0]}→${s.prov[k].split(':')[0]}`).join(', '));
  if (b.weights !== s.weights && b.top === s.top) out.push('criterios del puntaje');
  return out;
}

(async () => {
  const g = await P.gatherData(-5.19, -79.99);
  const run = (o) => P.analyze(base(o), g);
  const B = signature(run({}));
  const V = [
    ['Riego', 'sí (sin volumen)', { irrigation: true }], ['Riego', 'no (secano)', { irrigation: false }],
    ['Agua por campaña', '15 000 m³/ha', { irrigation: true, water: { supply_m3_ha: 15000 } }], ['Agua por campaña', '9 000 m³/ha', { irrigation: true, water: { supply_m3_ha: 9000 } }], ['Agua por campaña', '4 000 m³/ha', { irrigation: true, water: { supply_m3_ha: 4000 } }],
    ['Percolación del arroz', '2 mm/d', { irrigation: true, water: { percolation_mm_day: 2 } }], ['Percolación del arroz', '8 mm/d', { irrigation: true, water: { percolation_mm_day: 8 } }],
    ['Textura del suelo', 'arenosa', { irrigation: true, soil: { texture: 'arenosa' } }], ['Textura del suelo', 'arcillosa', { irrigation: true, soil: { texture: 'arcillosa' } }],
    ['pH medido', '5,0', { soil: { ph: 5.0 } }], ['pH medido', '7,0', { soil: { ph: 7.0 } }], ['pH medido', '8,8 (sobre el absoluto del Loctao)', { soil: { ph: 8.8 } }],
    ['Fecha prevista de siembra', '1 mar', { first_sowing_date: '2027-03-01' }], ['Fecha prevista de siembra', '1 jun', { first_sowing_date: '2027-06-01' }], ['Fecha prevista de siembra', '15 oct', { first_sowing_date: '2027-10-15' }],
    ['Ciclo del Loctao', '54 d', { cycle_days: { loctao: 54 } }], ['Ciclo del Loctao', '90 d', { cycle_days: { loctao: 90 } }], ['Ciclo del arroz', '100 d', { cycle_days: { arroz: 100 } }], ['Ciclo del arroz', '130 d', { cycle_days: { arroz: 130 } }],
    ['Cultivo principal', 'arroz en las grandes', { keep_main: { crop: 'arroz', campaigns: ['A'] } }], ['Cultivo principal', 'Loctao en ≥ 3 campañas', { keep_main: { crop: 'loctao', min_campaigns: 3 } }],
    ['Economía', 'completa', { economics: { arroz: { yield_t_ha: 9, price_s_per_kg: 1.2, cost_establishment_s_ha: 5000 }, loctao: { yield_t_ha: 2.4, price_s_per_kg: 5, cost_establishment_s_ha: 2500 } } }],
    ['Economía', 'incompleta (solo arroz)', { economics: { arroz: { yield_t_ha: 9, price_s_per_kg: 1.2, cost_establishment_s_ha: 5000 } } }],
    ['Historial', 'campaña anterior desconocida', { history: ['arroz'] }], ['Historial', 'Loctao antes', { history: ['loctao', 'arroz'] }],
    ['Prioridad de agua', '5', { priorities: { water: 5 } }], ['Prioridad de plagas', '5', { priorities: { pests: 5 } }],
  ];
  const rows = [], per = {};
  for (const [campo, valor, o] of V) {
    const s = signature(run(o)), d = diff(B, s);
    rows.push({ campo, valor, cambios: d, usado: s.used }); (per[campo] = per[campo] || []).push(d.length);
  }
  const sinEfecto = Object.entries(per).filter(([, a]) => a.every((x) => x === 0)).map(([k]) => k);
  const L = ['# ¿Precisa es realmente más preciso? Sensibilidad de cada campo', '', '> Generado por `node scripts/sensibilidad_precisa.js`. Base = modo Instantánea en el centro (nada declarado: riego «no lo sé», campaña grande, historial arroz–arroz).', '',
    `**Base:** ganador ${B.top} (${B.top_score}), «${B.verdict}», sensible a supuestos: ${B.sens ? 'sí' : 'no'}; estabilidad del ganador ${B.top_freq}. Viabilidad: ` + Object.entries(B.viab).map(([k, v]) => `${k} ${v.st}`).join(' · '), '',
    '| Campo | Valor | Qué cambia respecto de la base |', '|---|---|---|', ...rows.map((r) => `| ${r.campo} | ${r.valor} | ${r.cambios.length ? r.cambios.join('; ') : '**sin cambios**'} |`), '',
    '## Resumen', '', '- Campos que cambian algún componente: ' + Object.keys(per).filter((k) => !sinEfecto.includes(k)).join(', ') + '.', '- Campos sin efecto en ninguna variante: ' + (sinEfecto.length ? sinEfecto.join(', ') + ' (informativos o a eliminar)' : 'ninguno') + '.',
    '- Que un campo no cambie siempre al ganador es aceptable: lo importante es que intervenga en viabilidad, agua, calor, puntaje o incertidumbre cuando es relevante.', ''];
  fs.writeFileSync(path.join(ROOT, 'docs', 'PRECISA_SENSIBILIDAD.md'), L.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'data', 'validation', 'sensibilidad_precisa.json'), JSON.stringify({ base: B, variantes: rows, sin_efecto: sinEfecto }, null, 1));
  console.log('OK docs/PRECISA_SENSIBILIDAD.md · sin efecto:', JSON.stringify(sinEfecto));
  rows.forEach((r) => console.log(r.campo.padEnd(26), String(r.valor).padEnd(34), r.cambios.length ? r.cambios.join(' | ').slice(0, 230) : 'SIN CAMBIOS'));
})().catch((e) => { console.error(e); process.exit(1); });
