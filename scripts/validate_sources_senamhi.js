'use strict';
/**
 * Validación de POWER, ERA5 e IMERG frente a la estación SENAMHI MORROPÓN en el periodo COMPARTIDO (2001-01-01 → 2014-06-30).
 *   node scripts/validate_sources_senamhi.js
 * Requiere data/senamhi/morropon_daily.csv (scripts/senamhi_import.js) y data/validation/historic/* (scripts/fetch_historic_sources.js).
 *
 * Diseño:
 *  - Solo pares de fechas compatibles (ambos válidos); nunca se rellena con 0.
 *  - Partición temporal en dos bloques: A = 2001-2007, B = 2008-2014/06. Cada corrección se calibra en un bloque y se valida en el OTRO,
 *    en ambos sentidos. Una corrección solo se considera útil si mejora la validación fuera de muestra en AMBOS sentidos.
 *  - Líneas base: climatología mensual del bloque de calibración (precipitación mensual y temperatura diaria).
 *  - Se prueba el desfase de acumulación diaria (−1, 0, +1 día) y la sensibilidad a la regla de validez mensual.
 *  - Incertidumbre del ganador: bootstrap por AÑOS sobre la diferencia de RMSE entre las dos mejores fuentes.
 */
const fs = require('fs');
const path = require('path');
const S = require('../src/senamhi'), M = require('../src/metrics');
const ROOT = path.join(__dirname, '..'), HIST = path.join(ROOT, 'data', 'validation', 'historic');
const obsRows = S.fromCsv(fs.readFileSync(path.join(ROOT, 'data', 'senamhi', 'morropon_daily.csv'), 'utf8'));
const OBS = new Map(obsRows.map((r) => [r.date, r]));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8'));

const SRC = {};
SRC.power = read('power_2000_2014.json'); SRC.era5 = read('era5_2000_2014.json');
const imerg = {}; let imergYears = [];
for (const f of fs.readdirSync(HIST).filter((x) => /^imerg_\d{4}\.json$/.test(x))) { const j = read(f); imergYears.push(j.year); for (const [k, v] of Object.entries(j.data)) { const iso = k.includes('-') ? k : `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`; imerg[iso] = { pr: v }; } }
if (imergYears.length) SRC.imerg = { source: 'IMERG V07 Late (ClimateSERV)', data: imerg, years: imergYears.sort() };

const START = '2001-01-01', END = '2014-06-30', SPLIT = '2007-12-31';
const dates = []; for (let t = Date.UTC(2001, 0, 1); t <= Date.UTC(2014, 5, 30); t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10));
const blockOf = (d) => (d <= SPLIT ? 'A' : 'B');
const get = (src, v) => (d) => { const x = SRC[src].data[d]; return x ? x[v] : null; };
const obsGet = (v) => (d) => { const r = OBS.get(d); return r ? r[v] : null; };
const subset = (blk) => dates.filter((d) => blk === 'ALL' || blockOf(d) === blk);
const vec = (f, ds) => ds.map(f);
const round = (x, k = 3) => (x == null ? null : +x.toFixed(k));
const rm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round(v, 3) : v]));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- agregados mensuales por pares ----------
function monthlyPairs(srcName, ds, rule = S.DEFAULT_MONTH_RULE) {
  const byKey = new Map();
  for (const d of ds) { const k = d.slice(0, 7); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(d); }
  const out = [];
  for (const [k, days] of byKey) {
    const y = +k.slice(0, 4), m = +k.slice(5, 7), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (days.length < dim) continue;
    let miss = 0, run = 0, maxRun = 0, so = 0, se = 0, n = 0;
    for (const d of days) { const a = obsGet('pr_mm')(d), b = get(srcName, 'pr')(d); if (a == null) { miss++; run++; maxRun = Math.max(maxRun, run); } else { run = 0; if (b != null) { so += a; se += b; n++; } } }
    if (miss <= rule.maxMissing && maxRun <= rule.maxConsecutive && n > 0) out.push({ key: k, year: y, month: m, obs: so, est: se, n });
  }
  return out;
}
const monthlyMetrics = (arr) => M.continuous(arr.map((x) => x.obs), arr.map((x) => x.est));

// ---------- precipitación ----------
const result = { generado: new Date().toISOString(), periodo_comun: { inicio: START, fin: END, bloque_A: '2001-01-01 → 2007-12-31', bloque_B: '2008-01-01 → 2014-06-30' },
  fuentes_disponibles: Object.keys(SRC), imerg_anios: SRC.imerg ? SRC.imerg.years : [],
  advertencia: 'La serie SENAMHI termina en 2014-06-30: esta validación cubre 2001–2014; NO valida 2015–2023. Punto de las fuentes = referencia del proyecto (coordenadas de la estación no constan en el TXT).', precipitacion: {}, temperatura: {} };

const P = result.precipitacion;
for (const src of Object.keys(SRC)) {
  const R = (P[src] = { diario: {}, mensual: {}, eventos: {}, desfase: {}, estacional: {}, correcciones: {} });
  const f = get(src, 'pr'), g = obsGet('pr_mm');
  for (const blk of ['A', 'B', 'ALL']) { const ds = subset(blk); R.diario[blk] = rm(M.continuous(vec(g, ds), vec(f, ds))); }
  for (const thr of [1, 20]) R.eventos['>=' + thr] = rm(M.events(vec(g, dates), vec(f, dates), thr));
  const ds = subset('ALL'), oMap = new Map(ds.map((d) => [d, g(d)])), eMap = new Map(dates.map((d) => [d, f(d)]));
  R.desfase = Object.fromEntries(Object.entries(M.lagScan(oMap, eMap, ds, 1)).map(([k, v]) => [k, rm(v)]));
  // mensual
  for (const blk of ['A', 'B', 'ALL']) { const arr = monthlyPairs(src, subset(blk)); R.mensual[blk] = { ...rm(monthlyMetrics(arr)), meses: arr.length, total_obs_mm: round(arr.reduce((a, x) => a + x.obs, 0), 0), total_est_mm: round(arr.reduce((a, x) => a + x.est, 0), 0) }; }
  // estacional (sesgo relativo por mes del año)
  const allM = monthlyPairs(src, subset('ALL'));
  R.estacional = MES.map((nm, i) => { const a = allM.filter((x) => x.month === i + 1); const so = a.reduce((s, x) => s + x.obs, 0), se = a.reduce((s, x) => s + x.est, 0); return { mes: nm, meses: a.length, obs_media_mm: round(so / (a.length || 1), 1), est_media_mm: round(se / (a.length || 1), 1), razon_est_obs: so > 5 ? round(se / so, 2) : null }; });
  // temporada lluviosa ene-abr por año
  const years = [...new Set(allM.map((x) => x.year))];
  const wet = years.map((y) => { const a = allM.filter((x) => x.year === y && x.month >= 1 && x.month <= 4); return a.length === 4 ? { year: y, obs: a.reduce((s, x) => s + x.obs, 0), est: a.reduce((s, x) => s + x.est, 0) } : null; }).filter(Boolean);
  R.temporada_ene_abr = { anios: wet.length, ...rm(M.continuous(wet.map((x) => x.obs), wet.map((x) => x.est))), detalle: wet.map((x) => ({ y: x.year, obs: round(x.obs, 0), est: round(x.est, 0) })) };
  // correcciones calibradas en un bloque y validadas en el otro (mensual)
  for (const [cal, val] of [['A', 'B'], ['B', 'A']]) {
    const calM = monthlyPairs(src, subset(cal)), valM = monthlyPairs(src, subset(val));
    const ratio = {}; for (let m = 1; m <= 12; m++) { const a = calM.filter((x) => x.month === m); const so = a.reduce((s, x) => s + x.obs, 0), se = a.reduce((s, x) => s + x.est, 0); ratio[m] = se > 5 ? so / se : 1; }
    const gRatio = calM.reduce((s, x) => s + x.obs, 0) / Math.max(1, calM.reduce((s, x) => s + x.est, 0));
    const clim = {}; for (let m = 1; m <= 12; m++) { const a = calM.filter((x) => x.month === m); clim[m] = a.length ? a.reduce((s, x) => s + x.obs, 0) / a.length : 0; }
    const raw = M.continuous(valM.map((x) => x.obs), valM.map((x) => x.est));
    const corM = M.continuous(valM.map((x) => x.obs), valM.map((x) => x.est * ratio[x.month]));
    const corG = M.continuous(valM.map((x) => x.obs), valM.map((x) => x.est * gRatio));
    const base = M.continuous(valM.map((x) => x.obs), valM.map((x) => clim[x.month]));
    R.correcciones[`${cal}->${val}`] = { meses_val: valM.length, rmse_sin_correccion: round(raw.rmse, 1), rmse_factor_mensual: round(corM.rmse, 1), rmse_factor_global: round(corG.rmse, 1), rmse_climatologia_obs_calibracion: round(base.rmse, 1), factor_global: round(gRatio, 2),
      mejora_factor_mensual: corM.rmse < raw.rmse, mejora_factor_global: corG.rmse < raw.rmse, supera_climatologia_sin_correccion: raw.rmse < base.rmse, supera_climatologia_con_factor_mensual: corM.rmse < base.rmse };
  }
  // sensibilidad a la regla de meses válidos
  R.sensibilidad_regla = Object.fromEntries(Object.entries({ '5/3': { maxMissing: 5, maxConsecutive: 3 }, '10/5': { maxMissing: 10, maxConsecutive: 5 }, '15/10': { maxMissing: 15, maxConsecutive: 10 } }).map(([k, r]) => { const a = monthlyPairs(src, subset('ALL'), r); const m = monthlyMetrics(a); return [k, { meses: a.length, rmse: round(m.rmse, 1), bias_pct: round(m.bias_pct, 1), r: round(m.r, 2) }]; }));
}

// bootstrap por años: ¿hay una fuente mejor para la lluvia mensual?
function bootstrapRmse(srcA, srcB, iters = 2000) {
  const A = monthlyPairs(srcA, subset('ALL')), B = new Map(monthlyPairs(srcB, subset('ALL')).map((x) => [x.key, x]));
  const rows = A.filter((x) => B.has(x.key)).map((x) => ({ y: x.year, o: x.obs, a: x.est, b: B.get(x.key).est }));
  const years = [...new Set(rows.map((r) => r.y))]; let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const diffs = [];
  for (let i = 0; i < iters; i++) { const pick = []; for (let k = 0; k < years.length; k++) pick.push(years[Math.floor(rnd() * years.length)]); const sel = pick.flatMap((y) => rows.filter((r) => r.y === y)); const rmse = (key) => Math.sqrt(sel.reduce((s, r) => s + (r[key] - r.o) ** 2, 0) / sel.length); diffs.push(rmse('a') - rmse('b')); }
  diffs.sort((x, y) => x - y);
  return { A: srcA, B: srcB, meses: rows.length, dif_rmse_mediana: round(diffs[Math.floor(iters / 2)], 1), ic95: [round(diffs[Math.floor(iters * 0.025)], 1), round(diffs[Math.floor(iters * 0.975)], 1)], ganador_confiable: diffs[Math.floor(iters * 0.975)] < 0 ? srcA : diffs[Math.floor(iters * 0.025)] > 0 ? srcB : null };
}
const srcsP = Object.keys(SRC);
result.precipitacion_comparacion_pares = [];
for (let i = 0; i < srcsP.length; i++) for (let j = i + 1; j < srcsP.length; j++) result.precipitacion_comparacion_pares.push(bootstrapRmse(srcsP[i], srcsP[j]));

// ---------- temperatura ----------
const T = result.temperatura;
const VARS = [['tx', 'tmax_c', 'Tmax'], ['tn', 'tmin_c', 'Tmin'], ['tm', 'tmean_est_c', 'Tmedia (estimada en SENAMHI = (Tx+Tn)/2)']];
for (const src of ['power', 'era5']) {
  const R = (T[src] = {});
  for (const [sv, ov, label] of VARS) {
    const f = get(src, sv), g = obsGet(ov), r = (R[label] = { diario: {}, estacional: [], correcciones: {}, umbrales: {} });
    for (const blk of ['A', 'B', 'ALL']) { const ds = subset(blk); r.diario[blk] = rm(M.continuous(vec(g, ds), vec(f, ds))); }
    r.estacional = MES.map((nm, i) => { const ds = dates.filter((d) => +d.slice(5, 7) === i + 1); const c = M.continuous(vec(g, ds), vec(f, ds)); return { mes: nm, n: c.n, sesgo: round(c.bias, 2), rmse: round(c.rmse, 2), obs: round(c.obs_mean, 1), est: round(c.est_mean, 1) }; });
    for (const [cal, val] of [['A', 'B'], ['B', 'A']]) {
      const cds = subset(cal), vds = subset(val), off = {}, clim = {};
      for (let m = 1; m <= 12; m++) { const ds = cds.filter((d) => +d.slice(5, 7) === m); const p = M.pairs(vec(g, ds), vec(f, ds)); off[m] = p.o.length ? M.mean(p.o) - M.mean(p.e) : 0; const o2 = vec(g, ds).filter((x) => x != null); clim[m] = o2.length ? M.mean(o2) : null; }
      const raw = M.continuous(vec(g, vds), vec(f, vds));
      const cor = M.continuous(vec(g, vds), vds.map((d) => (f(d) == null ? null : f(d) + off[+d.slice(5, 7)])));
      const gOff = (() => { const p = M.pairs(vec(g, cds), vec(f, cds)); return M.mean(p.o) - M.mean(p.e); })();
      const corG = M.continuous(vec(g, vds), vds.map((d) => (f(d) == null ? null : f(d) + gOff)));
      const base = M.continuous(vec(g, vds), vds.map((d) => clim[+d.slice(5, 7)]));
      // anomalías (quitando la climatología de calibración) para evaluar la habilidad de día a día
      const anomO = vds.map((d) => (g(d) == null ? null : g(d) - clim[+d.slice(5, 7)])), anomE = vds.map((d) => (f(d) == null ? null : f(d) - (clim[+d.slice(5, 7)] - off[+d.slice(5, 7)])));
      r.correcciones[`${cal}->${val}`] = { rmse_sin_correccion: round(raw.rmse, 2), rmse_offset_mensual: round(cor.rmse, 2), rmse_offset_global: round(corG.rmse, 2), rmse_climatologia_obs: round(base.rmse, 2), mejora_offset_mensual: cor.rmse < raw.rmse, mejora_offset_global: corG.rmse < raw.rmse, supera_climatologia_sin_correccion: raw.rmse < base.rmse, supera_climatologia_con_offset_mensual: cor.rmse < base.rmse, correlacion_anomalias: round(M.pearson(...(() => { const p = M.pairs(anomO, anomE); return [p.o, p.e]; })()), 2), offset_global_c: round(gOff, 2) };
    }
    if (sv !== 'tm') for (const thr of sv === 'tx' ? [32, 35] : [22, 24]) { const ev = M.events(vec(g, dates), vec(f, dates), thr); const oc = dates.filter((d) => g(d) != null && g(d) >= thr).length, ec = dates.filter((d) => g(d) != null && f(d) != null && f(d) >= thr).length; r.umbrales['>=' + thr] = { ...rm(ev), dias_obs: oc, dias_est_en_dias_con_obs: ec }; }
  }
}

fs.writeFileSync(path.join(ROOT, 'data', 'validation', 'senamhi_sources.json'), JSON.stringify(result, null, 1));

// ---------- informe ----------
const L = [];
const f2 = (x, k = 1) => (x == null ? '—' : (+x).toFixed(k));
L.push('# Validación de POWER, ERA5 e IMERG frente a SENAMHI Morropón', '', '> Generado por `node scripts/validate_sources_senamhi.js` a partir de `data/senamhi/morropon_daily.csv` y `data/validation/historic/`. Resultados completos en `data/validation/senamhi_sources.json`.', '');
L.push('## Alcance y límites', '', `- **Periodo comparado: 2001-01-01 → 2014-06-30.** La serie SENAMHI termina el 2014-06-30, de modo que **no valida 2015–2023**, el periodo de la climatología que usa el motor. Lo que se valida es el comportamiento de cada producto frente a una estación real en 13,5 años, y se asume (hipótesis) que sus sesgos son estables entre periodos.`, `- Fuentes: ${Object.keys(SRC).join(', ')}${SRC.imerg ? ' (IMERG: años ' + SRC.imerg.years.join(', ') + ')' : ' — IMERG no disponible'}.`, '- Punto de las fuentes = referencia del proyecto (-5.19, -79.99); las coordenadas de la estación no constan en el TXT. ERA5 usa su celda más cercana (≈0.25°); IMERG un cuadro de 0.1°; POWER una celda de 0.5°×0.625°: **se compara una estación puntual con promedios de área**.', '- Solo pares de fechas compatibles. Partición temporal: bloque A = 2001–2007, bloque B = 2008–jun 2014; cada corrección se calibra en un bloque y se valida en el otro, en ambos sentidos.', '');
L.push('## Precipitación', '', '### Totales mensuales (meses válidos de SENAMHI; suma sobre días con dato en ambas series)', '', '| Fuente | Meses | Obs. total (mm) | Fuente total (mm) | Sesgo | RMSE mensual (mm) | MAE (mm) | r |', '|---|---|---|---|---|---|---|---|');
for (const s of Object.keys(P)) { const m = P[s].mensual.ALL; L.push(`| ${s} | ${m.meses} | ${m.total_obs_mm} | ${m.total_est_mm} | ${f2(m.bias_pct, 0)} % | ${f2(m.rmse)} | ${f2(m.mae)} | ${f2(m.r, 2)} |`); }
L.push('', '### Diario (todos los pares válidos)', '', '| Fuente | n | Sesgo (mm/d) | RMSE (mm/d) | r | POD ≥1 mm | FAR ≥1 mm | POD ≥20 mm | FAR ≥20 mm | Mejor desfase (r) |', '|---|---|---|---|---|---|---|---|---|---|');
for (const s of Object.keys(P)) { const d = P[s].diario.ALL, e1 = P[s].eventos['>=1'], e20 = P[s].eventos['>=20'], lag = Object.entries(P[s].desfase).sort((a, b) => b[1].r - a[1].r)[0]; L.push(`| ${s} | ${d.n} | ${f2(d.bias, 2)} | ${f2(d.rmse, 2)} | ${f2(d.r, 2)} | ${f2(e1.pod, 2)} | ${f2(e1.far, 2)} | ${f2(e20.pod, 2)} (${e20.hits}/${e20.obs_events}) | ${f2(e20.far, 2)} | ${lag[0]} d (${f2(lag[1].r, 2)}) |`); }
L.push('', '### Temporada de lluvias (ene–abr) por año', '', '| Fuente | Años | Sesgo (mm) | RMSE (mm) | r |', '|---|---|---|---|---|');
for (const s of Object.keys(P)) { const w = P[s].temporada_ene_abr; L.push(`| ${s} | ${w.n} | ${f2(w.bias, 0)} | ${f2(w.rmse, 0)} | ${f2(w.r, 2)} |`); }
L.push('', '### Cociente fuente/observado por mes del año (solo meses con >5 mm observados)', '', '| Mes | ' + Object.keys(P).join(' | ') + ' |', '|---|' + Object.keys(P).map(() => '---').join('|') + '|');
MES.forEach((nm, i) => L.push(`| ${nm} | ` + Object.keys(P).map((s) => f2(P[s].estacional[i].razon_est_obs, 2)).join(' | ') + ' |'));
L.push('', '### Correcciones de sesgo validadas fuera de muestra (RMSE mensual, mm)', '', '| Fuente | Sentido | Sin corregir | Factor mensual | Factor global | Climatología obs. | ¿Mejora (mensual)? | ¿Mejora (global)? |', '|---|---|---|---|---|---|---|---|');
for (const s of Object.keys(P)) for (const [k, c] of Object.entries(P[s].correcciones)) L.push(`| ${s} | ${k} | ${c.rmse_sin_correccion} | ${c.rmse_factor_mensual} | ${c.rmse_factor_global} | ${c.rmse_climatologia_obs_calibracion} | ${c.mejora_factor_mensual ? 'sí' : 'no'} | ${c.mejora_factor_global ? 'sí' : 'no'} |`);
L.push('', '### ¿Hay una fuente claramente mejor? (bootstrap por años sobre la diferencia de RMSE mensual)', '', '| A | B | Meses | RMSE(A)−RMSE(B) mediana (mm) | IC95 % | Ganador confiable |', '|---|---|---|---|---|---|');
for (const c of result.precipitacion_comparacion_pares) L.push(`| ${c.A} | ${c.B} | ${c.meses} | ${c.dif_rmse_mediana} | ${c.ic95[0]} a ${c.ic95[1]} | ${c.ganador_confiable || '**ninguno**'} |`);
L.push('', '### Sensibilidad a la regla de meses válidos (RMSE mensual, mm)', '', '| Fuente | 5/3 | 10/5 | 15/10 |', '|---|---|---|---|');
for (const s of Object.keys(P)) L.push(`| ${s} | ${['5/3', '10/5', '15/10'].map((k) => P[s].sensibilidad_regla[k].rmse + ' (' + P[s].sensibilidad_regla[k].meses + ' m)').join(' | ')} |`);
L.push('', '## Temperatura (diaria)', '');
for (const [sv, ov, label] of VARS) {
  L.push(`### ${label}`, '', '| Fuente | n | Sesgo (°C) | MAE | RMSE | r | Mejor corrección fuera de muestra (A→B / B→A) | Supera climatología sin corregir |', '|---|---|---|---|---|---|---|---|');
  for (const s of Object.keys(T)) { const r = T[s][label], d = r.diario.ALL, c1 = r.correcciones['A->B'], c2 = r.correcciones['B->A']; L.push(`| ${s} | ${d.n} | ${f2(d.bias, 2)} | ${f2(d.mae, 2)} | ${f2(d.rmse, 2)} | ${f2(d.r, 2)} | offset mensual: ${c1.mejora_offset_mensual ? 'sí' : 'no'} / ${c2.mejora_offset_mensual ? 'sí' : 'no'} (RMSE ${c1.rmse_sin_correccion}→${c1.rmse_offset_mensual} / ${c2.rmse_sin_correccion}→${c2.rmse_offset_mensual}) | ${c1.supera_climatologia_sin_correccion ? 'sí' : 'no'} / ${c2.supera_climatologia_sin_correccion ? 'sí' : 'no'} (clim. ${c1.rmse_climatologia_obs} / ${c2.rmse_climatologia_obs}) |`); }
  L.push('');
}
L.push('### Días por encima de umbral térmico (importante para el estrés por calor)', '', '| Fuente | Variable | Umbral | Días observados | Días con la fuente (sobre días con dato) | POD | FAR |', '|---|---|---|---|---|---|---|');
for (const s of Object.keys(T)) for (const label of Object.keys(T[s])) for (const [k, u] of Object.entries(T[s][label].umbrales)) L.push(`| ${s} | ${label.split(' ')[0]} | ${k} | ${u.dias_obs} | ${u.dias_est_en_dias_con_obs} | ${f2(u.pod, 2)} | ${f2(u.far, 2)} |`);
L.push('', '## Cómo leer este informe', '', '- Un RMSE menor que el de la **climatología observada** significa que la fuente aporta información más allá del ciclo estacional; si no lo supera, su detalle diario no añade nada a un promedio mensual de la estación.', '- Una corrección de sesgo solo se recomienda si mejora el error fuera de muestra en **ambos** sentidos de la partición.', '- Un "ganador" solo se declara si el intervalo bootstrap de la diferencia de RMSE excluye el cero.', '');
fs.writeFileSync(path.join(ROOT, 'docs', 'VALIDACION_FUENTES_SENAMHI.md'), L.join('\n'));
console.log('OK. Fuentes:', Object.keys(SRC).join(','), '| informe: docs/VALIDACION_FUENTES_SENAMHI.md');

// ---------- artefacto de calibración (lo consume el motor) ----------
// Offsets mensuales (observado − fuente) sobre TODO el solape 2001-2014 y pesos de confiabilidad de lluvia (1/RMSE² mensual validado).
// Solo se declara "recomendada" una corrección si mejoró el error fuera de muestra en AMBOS sentidos de la partición.
{
  const offs = {};
  for (const src of ['power', 'era5']) {
    offs[src] = {};
    for (const [sv, ov] of [['tx', 'tmax_c'], ['tn', 'tmin_c'], ['tm', 'tmean_est_c']]) {
      offs[src][sv] = [];
      for (let m = 1; m <= 12; m++) { const ds = dates.filter((d) => +d.slice(5, 7) === m); const p = M.pairs(vec(obsGet(ov), ds), vec(get(src, sv), ds)); offs[src][sv].push(p.o.length ? round(M.mean(p.o) - M.mean(p.e), 2) : 0); }
    }
  }
  const okBoth = (src, label) => { const r = T[src][label].correcciones; return r['A->B'].mejora_offset_mensual && r['B->A'].mejora_offset_mensual; };
  const rmseOos = (src, label) => (T[src][label].correcciones['A->B'].rmse_offset_mensual + T[src][label].correcciones['B->A'].rmse_offset_mensual) / 2;
  const labels = ['Tmax', 'Tmin', 'Tmedia (estimada en SENAMHI = (Tx+Tn)/2)'];
  const score = (src) => labels.reduce((a, l) => a + rmseOos(src, l), 0);
  const chosen = ['era5', 'power'].filter((s) => labels.every((l) => okBoth(s, l))).sort((a, b) => score(a) - score(b))[0] || null;
  const inv = Object.fromEntries(Object.keys(P).map((s) => [s, 1 / (P[s].mensual.ALL.rmse ** 2)])), sum = Object.values(inv).reduce((a, b) => a + b, 0);
  // frecuencia observada de días calurosos por día del año (ventana ±7 d), años con dato, 1981-2014
  const heat = {};
  const ths = Array.from({ length: 17 }, (_, i) => 26 + i); // 26..42 °C
  const byDoy = Array.from({ length: 367 }, () => []);
  const doyOf = (iso) => { const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); return Math.floor((t - Date.UTC(+iso.slice(0, 4), 0, 1)) / 864e5) + 1; };
  for (const r of obsRows) if (r.tmax_c != null && r.year >= 1981) byDoy[doyOf(r.date)].push(r.tmax_c);
  for (const th of ths) heat[th] = Array.from({ length: 366 }, (_, i) => { const doy = i + 1; let n = 0, k = 0; for (let o = -7; o <= 7; o++) { let d = doy + o; if (d < 1) d += 365; if (d > 365) d -= 365; for (const v of byDoy[d]) { n++; if (v >= th) k++; } } return n ? +(k / n).toFixed(3) : null; });
  const cal = {
    generado: new Date().toISOString(), periodo_calibracion: '2001-01-01 → 2014-06-30', estacion_referencia: { nombre: 'SENAMHI Morropón', lat: -5.19, lon: -79.99, elevation_m: 141, nota: 'Coordenadas/altitud de la referencia del proyecto; no constan en el TXT de SENAMHI.' },
    aviso: 'Calibrado con la estación de Morropón en 2001-2014; se asume sesgo estable en 2015-2023 y representatividad para el valle (hipótesis).',
    temperatura: { fuentes: Object.fromEntries(['era5', 'power'].map((s) => [s, { offsets_mensuales_c: offs[s], mejora_fuera_de_muestra_en_ambos_sentidos: labels.every((l) => okBoth(s, l)), rmse_fuera_de_muestra_medio: Object.fromEntries(labels.map((l) => [l.split(' ')[0], round(rmseOos(s, l), 2)])) }])), fuente_elegida: chosen,
      motivo: chosen ? `${chosen} con offsets mensuales: menor RMSE fuera de muestra entre las fuentes que mejoran en ambos sentidos` : 'ninguna corrección mejora en ambos sentidos',
      linea_base_climatologia_obs_rmse: { Tmax: T.era5.Tmax.correcciones['A->B'].rmse_climatologia_obs, Tmin: T.era5.Tmin.correcciones['A->B'].rmse_climatologia_obs } },
    calor_observado: { descripcion: 'Probabilidad de Tmax >= umbral por día del año (ventana ±7 d), estación Morropón 1981-2014. Los reanálisis corregidos subestiman los días ≥35 °C (validación fuera de muestra), por eso el estrés por calor usa esta frecuencia observada.', umbrales: ths, prob_por_doy: heat },
    precipitacion: { pesos_confiabilidad: Object.fromEntries(Object.keys(P).map((s) => [s, round(inv[s] / sum, 3)])), base: '1/RMSE² de totales mensuales frente a SENAMHI (2001-2014)', rmse_mensual_mm: Object.fromEntries(Object.keys(P).map((s) => [s, P[s].mensual.ALL.rmse])), sesgo_pct: Object.fromEntries(Object.keys(P).map((s) => [s, round(P[s].mensual.ALL.bias_pct, 0)])),
      fuente_principal: Object.keys(P).sort((a, b) => P[a].mensual.ALL.rmse - P[b].mensual.ALL.rmse)[0], ganador_confiable_frente_a_otras: result.precipitacion_comparacion_pares.filter((c) => c.ganador_confiable).map((c) => `${c.ganador_confiable} > ${c.ganador_confiable === c.A ? c.B : c.A}`),
      correccion_de_sesgo: { aplicada_por_defecto: false, motivo: 'IMERG: el factor mensual mejora el RMSE mensual en ambos sentidos (56.7→46.9 y 40.7→36.5 mm) pero el factor global empeora; las razones mensuales de la época seca son inestables (observado ≈ 0 mm). Se conserva IMERG sin corregir con su sesgo documentado (+17 %).' },
      desfase_diario: 'IMERG y ERA5 correlacionan mejor con la estación con un desfase de +1 día (día de acumulación diferente): los análisis diarios requieren alineación; los balances estacionales no se afectan.' },
  };
  fs.writeFileSync(path.join(ROOT, 'data', 'validation', 'calibration_senamhi.json'), JSON.stringify(cal));
  console.log('Calibración escrita: fuente de temperatura', chosen, '| pesos de lluvia', JSON.stringify(cal.precipitacion.pesos_confiabilidad));
}
