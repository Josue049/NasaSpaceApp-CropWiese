'use strict';
/**
 * Comparación reproducible ANTES / DESPUÉS y sensibilidades del motor v2.
 *   node scripts/comparar_motores.js          → docs/COMPARACION_MOTORES.md y data/validation/comparacion_motores.json
 * - Motor original (v1, temperatura heredada)  vs  v1 con temperatura calibrada  vs  v2 (dos etapas).
 * - Sensibilidad del v2 a: agua, temperatura, ciclo del Loctao, umbral de calor, percolación, fuente de lluvia y ubicación.
 * Solo usa datos reales de la instantánea/cachés; las ubicaciones distintas del centro consultan las fuentes en vivo (se cachean).
 */
process.env.FIELDSHIFT_DOMAIN = 'morropon';
const fs = require('fs'), path = require('path');
const P = require('../src/pipeline'), morropon = require('../src/morropon'), engine2 = require('../src/engine2');
const ROOT = path.join(__dirname, '..');
const short = (seq) => seq.map((c) => ({ arroz: 'A', loctao: 'L', frijol: 'F' }[c] || c)).join('');
const inp = (o = {}) => ({ lat: -5.19, lon: -79.99, area_ha: 1, irrigation: true, start_slot: 'A', history: ['arroz', 'arroz'], priorities: {}, excluded_crops: [], market_pref: {}, ...o });
const sum = (a) => a.reduce((x, y) => x + y, 0);

(async () => {
  const g = await P.gatherData(-5.19, -79.99), out = { generado: new Date().toISOString() }, L = [];
  const dom = P.activeDomain(), cal = P.calibration();
  const line = (...c) => L.push('| ' + c.join(' | ') + ' |');

  // ---------- A. antes / después ----------
  L.push('# Comparación de motores y sensibilidad', '', '> Generado por `node scripts/comparar_motores.js`. Punto: estación de referencia (-5.19, -79.99). Los puntajes de motores distintos NO son comparables entre sí; se comparan las secuencias ganadoras y sus condiciones.', '');
  L.push('## A. Antes y después (centro, riego declarado salvo indicación)', '', '| Escenario | v1 original (frijol común, temp. heredada) | v1 con temp. calibrada | v2 (arroz + Loctao) |', '|---|---|---|---|');
  const A = [];
  for (const [label, o] of [['inicio grande · hist. arroz–arroz', {}], ['inicio chica · hist. arroz–arroz', { start_slot: 'B' }], ['inicio grande · hist. arroz–{leg}', { history: ['arroz', '@leg'] }], ['inicio grande · sin riego', { irrigation: false }], ['inicio grande · 12 000 m³/ha', { water: { supply_m3_ha: 12000 } }], ['inicio grande · 6 000 m³/ha', { water: { supply_m3_ha: 6000 } }]]) {
    const mk = (leg) => ({ ...inp(o), history: (o.history || ['arroz', 'arroz']).map((h) => (h === '@leg' ? leg : h)) });
    const sv = (r) => (r.strategies.length > 1 ? r.strategies.slice(1).map((s) => `${short(s.sequence)} ${s.score}`).join(' / ') : 'sin alternativa' + (r.no_viable ? ' (no viable)' : '')) + ' · actual ' + (r.strategies[0] ? r.strategies[0].score : '—');
    const r1 = P.analyze({ ...mk('frijol'), engine: 'v1' }, g, { ...P.SCENARIOS.base, temp_method: 'legacy' });
    const r2 = P.analyze({ ...mk('frijol'), engine: 'v1' }, g, { ...P.SCENARIOS.base, temp_method: 'senamhi_monthly' });
    const r3 = P.analyze({ ...mk('loctao'), engine: 'v2' }, g);
    line(label, sv(r1), sv(r2), sv(r3)); A.push({ label, v1_legacy: r1.strategies.map((s) => [short(s.sequence), s.score]), v1_nueva_temp: r2.strategies.map((s) => [short(s.sequence), s.score]), v2: r3.strategies.map((s) => [short(s.sequence), s.score]), v2_no_viable: !!r3.no_viable });
  }
  out.antes_despues = A;
  L.push('', '(A = arroz, F = frijol común, L = frijol Loctao.) El motor v1 con la temperatura calibrada ya no encuentra alternativas con frijol común en la campaña grande: con la temperatura corregida el frijol común no completa su ciclo allí (coherente con que no sea el frijol local).', '');

  // ---------- B. sensibilidad del v2 ----------
  const base = P.buildClimates(g, P.SCENARIOS.base);
  const crops = (loctaoFn) => { const c = morropon.rotationCrops(P.CROPS.crops, null); return c.map((x) => (x.id === 'loctao' && loctaoFn ? loctaoFn(x) : x)); };
  const runV2 = ({ climates = base.climates, input = inp(), cropList = crops(), ov = null }) => engine2.run(input, { source_weights: cal.precipitacion.pesos_confiabilidad, crops: cropList, slots: dom.slots, climates, slope: g.slope.ok ? g.slope.data.slope_pct : null, soil: g.soil.ok ? g.soil.data : null }, ov);
  const best = (r) => (r.strategies[1] ? `${short(r.strategies[1].sequence)} (${r.strategies[1].score})` : r.no_viable ? 'sin alternativa' : '—');
  const viab = (r) => Object.entries(r.viability).map(([c, o]) => (c === 'arroz' ? 'Arroz' : 'Loctao') + ': ' + Object.entries(o).map(([s, x]) => (s === 'A' ? 'grande ' : 'chica ') + x.status).join(', ')).join(' · ');
  const S = {}; const table = (title, head, rows, key) => { L.push('', `### ${title}`, '', '| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows.forEach((r) => line(...r)); S[key] = rows; };

  L.push('## B. Sensibilidad del motor v2 (centro, inicio grande, historial arroz–arroz)');
  table('Agua disponible por campaña', ['Dotación', 'Viabilidad (A=arroz, L=Loctao; g=grande, c=chica)', 'Mejor alternativa', 'Necesidad de riego del arroz (chica)'], [0, 3000, 6000, 9000, 12000, 15000].map((m3) => { const r = runV2({ input: inp(m3 === 0 ? { irrigation: false } : { water: { supply_m3_ha: m3 } }) }); return [m3 === 0 ? 'secano' : m3 + ' m³/ha', viab(r).replace(/A /g, 'A ').replace(/\bA:/, 'Arroz:').replace(/\bL:/, 'Loctao:'), best(r), r.viability.arroz.B.net_water_need_mm + ' mm']; }), 'agua');
  table('Temperatura (escenarios y desplazamientos)', ['Escenario', 'Viabilidad', 'Mejor alternativa'], [['base', 0], ['+1 °C', 1], ['+2 °C', 2], ['+3 °C', 3], ['−1 °C', -1], ['−2 °C', -2]].map(([n, d]) => { const b = P.buildClimates(g, { ...P.SCENARIOS.base, temp_delta: d }); const r = runV2({ climates: b.climates }); return [n, viab(r), best(r)]; }), 'temperatura');
  table('Escenarios de lluvia', ['Escenario', 'Viabilidad', 'Mejor alternativa'], ['dry', 'wet'].map((k) => { const b = P.buildClimates(g, P.SCENARIOS[k]); const r = runV2({ climates: b.climates }); return [P.SCENARIOS[k].label, viab(r), best(r)]; }), 'lluvia');
  table('Ciclo del Loctao (incertidumbre abierta 54–90 d)', ['Ciclo (días)', 'Loctao: grande / chica', 'Mejor alternativa'], [59, 75, 90].map((d) => { const k = d / 59, st = [12, 23, 11, 13].map((x) => Math.round(x * k)); const r = runV2({ cropList: crops((c) => ({ ...c, cycle: { ini: st[0], dev: st[1], mid: st[2], late: st[3] } })) }); return [d, `${r.viability.loctao.A.status} (${r.viability.loctao.A.duration_days} d) / ${r.viability.loctao.B.status} (${r.viability.loctao.B.duration_days} d)`, best(r)]; }), 'ciclo_loctao');
  table('Umbral de calor del Loctao (hipótesis)', ['Umbral (°C)', 'Calor etapa media: grande / chica', 'Mejor alternativa'], [32, 35, 38, 40].map((t) => { const r = runV2({ cropList: crops((c) => ({ ...c, t_stress_max: t })) }); return [t, `${r.viability.loctao.A.heat_frac} / ${r.viability.loctao.B.heat_frac}`, best(r)]; }), 'umbral_calor');
  table('Percolación del arroz (FAO 2–8 mm/d; 5 central)', ['Percolación', 'Demanda del arroz grande / chica (mm)', 'Mejor alternativa con 9 000 m³/ha'], [2, 5, 8].map((p) => { const r = runV2({ input: inp({ water: { percolation_mm_day: p, supply_m3_ha: 9000 } }) }); return [p + ' mm/d', `${r.viability.arroz.A.net_water_need_mm} / ${r.viability.arroz.B.net_water_need_mm}`, best(r)]; }), 'percolacion');
  table('Fuente de lluvia usada sola (el motor las combina con pesos de validación)', ['Fuente', 'Demanda del arroz grande (mm)', 'Mejor alternativa con 9 000 m³/ha', 'Mejor alternativa con 12 000 m³/ha'], [['todas (pesos)', base.climates], ...base.climates.map((c) => [c.id, [{ ...c, role: 'primary' }]])].map(([n, cl]) => { const r9 = runV2({ climates: cl, input: inp({ water: { supply_m3_ha: 9000 } }) }), r12 = runV2({ climates: cl, input: inp({ water: { supply_m3_ha: 12000 } }) }); return [n, r9.viability.arroz.A.net_water_need_mm, best(r9), best(r12)]; }), 'fuente_lluvia');
  table('Historial y prioridades', ['Variante', 'Mejor alternativa'], [['hist. arroz–arroz', inp()], ['hist. arroz–Loctao', inp({ history: ['arroz', 'loctao'] })], ['hist. Loctao–arroz', inp({ history: ['loctao', 'arroz'] })], ['prioridad agua = 5', inp({ priorities: { water: 5 } })], ['prioridad suelo = 5', inp({ priorities: { protect_soil: 5 } })], ['prioridad plagas = 5', inp({ priorities: { pests: 5 } })], ['prioridad calor = 5', inp({ priorities: { resilience: 5 } })], ['conservar arroz en la grande', inp({ keep_main: { crop: 'arroz', campaigns: ['A'] } })]].map(([n, i]) => [n, best(runV2({ input: i }))]), 'historial_prioridades');

  // ---------- C. ubicación ----------
  L.push('', '## C. Ubicación: qué cambia realmente entre parcelas de Morropón', '', '| Punto | Altitud | Pendiente | pH | Fuente de lluvia principal | Soporte | Arroz grande/chica: necesidad de riego | Mejor alternativa |', '|---|---|---|---|---|---|---|---|');
  const pts = [['Centro (estación)', -5.19, -79.99], ['Zona llana (noroeste)', -5.11, -80.08], ['Pendiente moderada (suroeste)', -5.28, -80.08], ['Piedemonte (este)', -5.20, -79.89], ['Zona de mayor altitud (noreste)', -5.11, -79.90]];
  const C = [];
  for (const [n, lat, lon] of pts) {
    try {
      const gp = await P.gatherData(lat, lon), bc = P.buildClimates(gp, P.SCENARIOS.base), input = inp({ lat, lon });
      const r = P.analyze(input, gp), lr = r.location_report, pt = lr.point;
      const prim = bc.climates.find((c) => c.role === 'primary');
      const row = [n, pt.elevation_m != null ? pt.elevation_m + ' m' : 's/d', pt.slope_pct != null ? pt.slope_pct + ' %' : 's/d', pt.soil_ph ?? 's/d', prim ? prim.id : '—', r.support.level + (r.support.blockers.length ? ' (' + r.support.blockers[0].slice(0, 60) + '…)' : ''),
        r.viability ? `${r.viability.arroz.A.net_water_need_mm} / ${r.viability.arroz.B.net_water_need_mm} mm` : '—', r.strategies[1] ? `${short(r.strategies[1].sequence)} (${r.strategies[1].score})` : r.unsupported ? 'no se recomienda' : '—'];
      line(...row); C.push({ punto: n, lat, lon, ...pt, fuente_principal: prim && prim.id, soporte: r.support.level, bloqueos: r.support.blockers, necesidad_arroz_mm: r.viability ? [r.viability.arroz.A.net_water_need_mm, r.viability.arroz.B.net_water_need_mm] : null, fallbacks: lr.fallbacks.map((f) => f.id) });
    } catch (e) { line(n, '—', '—', '—', '—', 'error: ' + e.message.slice(0, 60), '—', '—'); }
  }
  out.ubicacion = C;
  L.push('', 'Las ubicaciones con pendiente > 50 % se marcan «no recomendable» antes de correr el motor; fuera del centro no hay serie IMERG descargada (se usa ERA5 con aviso hasta completar la descarga).', '');
  out.sensibilidad = S;
  fs.writeFileSync(path.join(ROOT, 'docs', 'COMPARACION_MOTORES.md'), L.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'data', 'validation', 'comparacion_motores.json'), JSON.stringify(out, null, 1));
  console.log('OK docs/COMPARACION_MOTORES.md');
})().catch((e) => { console.error(e); process.exit(1); });
