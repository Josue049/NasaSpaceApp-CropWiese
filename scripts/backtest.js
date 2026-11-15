'use strict';
/**
 * Retroprueba del modelo con las referencias que ya tenemos (SENAMHI 2026, Sentinel-2, POWER 2026).
 * Genera docs/VALIDACION_MODELO.md y data/validation/results.json.
 * Requiere data/validation/power2026_*.json (se descargan con scripts/_fetch_power2026.js la primera vez).
 *
 * PRINCIPIO: separar lo CIRCULAR (datos usados para calibrar) de lo INDEPENDIENTE, y declarar qué NO se puede evaluar.
 */
process.env.FIELDSHIFT_DOMAIN = 'morropon';
const fs = require('fs');
const path = require('path');
const { buildClimate } = require('../src/climate');
const { simulate, PROFILE, DOMAIN, analyzeRice } = require('../src/rice');
const { gatherData, buildClimates, SCENARIOS } = require('../src/pipeline');
const { classify } = require('../src/satellite');

const ROOT = path.join(__dirname, '..');
const VAL = path.join(ROOT, 'data', 'validation');
const ymd = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const f1 = (x) => (x == null || Number.isNaN(x) ? '—' : (+x).toFixed(1));
const f2 = (x) => (x == null || Number.isNaN(x) ? '—' : (+x).toFixed(2));
const sgn = (x) => (x == null ? '—' : (x > 0 ? '+' : '') + (+x).toFixed(1));
const metrics = (errs) => ({ n: errs.length, bias: mean(errs), mae: mean(errs.map(Math.abs)), rmse: errs.length ? Math.sqrt(mean(errs.map((e) => e * e))) : null });

const STATIONS = {
  morropon: { name: 'Morropón (Piura)', elev: 141 }, partidor: { name: 'Partidor (Piura)', elev: 236 }, lambayeque: { name: 'Lambayeque', elev: 38 },
  talla: { name: 'Talla (La Libertad)', elev: 117 }, oyotun: { name: 'Oyotún (Lambayeque)', elev: 221 },
};
function climateFor(key, offsets) {
  const f = path.join(VAL, `power2026_${key}.json`);
  if (!fs.existsSync(f)) throw new Error(`falta ${f}: ejecute scripts/_fetch_power2026.js`);
  const raw = JSON.parse(fs.readFileSync(f, 'utf8')).raw;
  return buildClimate(raw, { elevation: STATIONS[key].elev, yearRange: [2025, 2026], scenario: { precip_factor: 1, temp_delta: 0, temp_offsets: offsets || undefined } });
}
function rawFor(key) { return JSON.parse(fs.readFileSync(path.join(VAL, `power2026_${key}.json`), 'utf8')).raw; }

// ---------- referencia: SENAMHI Morropón 2026 ----------
function readObs() {
  const lines = fs.readFileSync(path.join(ROOT, 'docs', 'evidence', 'rice_morropon_2026_senamhi.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const h = lines[0].split(','), ix = (n) => h.indexOf(n);
  return lines.slice(1).map((l) => l.split(',')).map((c) => ({ code: c[ix('event_code')], name: c[ix('event_name_es')], date: c[ix('event_date')], das: Number(c[ix('days_after_sowing')]), tmax: Number(c[ix('reported_tmax_c')]), tmin: Number(c[ix('reported_tmin_c')]), tmean: Number(c[ix('reported_tmean_c')]), pp: Number(c[ix('reported_pp_mm')]) }));
}

// ---------- A. Temperatura (validación cruzada dejando una fuera) ----------
function testTemperature(obs) {
  const clim = climateFor('morropon');
  const rawNoLapse = buildClimate(rawFor('morropon'), { yearRange: [2025, 2026], scenario: {} }); // sin corrección de altitud
  const win = (c, date, k) => { const v = []; for (let d = -3; d <= 3; d++) { const x = c.byKey.get(ymd(Date.parse(date) + d * 86400000)); if (x) v.push(x[k]); } return mean(v); };
  const rows = obs.map((o) => ({ ...o, mT: win(clim, o.date, 'T'), mTx: win(clim, o.date, 'Tx'), mTn: win(clim, o.date, 'Tn'), nT: win(rawNoLapse, o.date, 'T'), nTx: win(rawNoLapse, o.date, 'Tx'), nTn: win(rawNoLapse, o.date, 'Tn') }));
  const vars = [['Tmedia', 'tmean', 'mT', 'nT'], ['Tmáx', 'tmax', 'mTx', 'nTx'], ['Tmín', 'tmin', 'mTn', 'nTn']];
  const out = {};
  for (const [label, rep, mod, nolapse] of vars) {
    const raw = rows.map((r) => r[mod] - r[rep]);
    const noL = rows.map((r) => r[nolapse] - r[rep]);
    const loo = rows.map((r, i) => { const others = rows.filter((_, j) => j !== i); const b = mean(others.map((x) => x[mod] - x[rep])); return r[mod] - b - r[rep]; });
    const naive = rows.map((r, i) => mean(rows.filter((_, j) => j !== i).map((x) => x[rep])) - r[rep]); // línea base: «la temperatura es la media de las demás observaciones»
    const offsets = rows.map((_, i) => mean(rows.filter((_, j) => j !== i).map((x) => x[mod] - x[rep])));
    out[label] = { sin_altitud: metrics(noL), sin_correccion: metrics(raw), validacion_cruzada: metrics(loo), linea_base_constante: metrics(naive), offset_rango: [Math.min(...offsets), Math.max(...offsets)] };
  }
  return { n: rows.length, out, rows };
}

// ---------- B. Fenología ----------
const STAGE_KEYS = Object.keys(PROFILE.phenology_das);
function predictedDas(clim, sowIso, stage) {
  const [y, m, d] = sowIso.split('-').map(Number);
  const r = simulate(clim, y, m, d, 0, PROFILE);
  return r ? { das: r.stageDay[stage] ?? null, done: r.done, dur: r.days } : null;
}
function testPhenology(obs, offsetsMorropon) {
  const sow = PROFILE.observed_campaign.sowing_date;
  const climM = climateFor('morropon', offsetsMorropon);
  const inSample = obs.filter((o) => STAGE_KEYS.includes(o.code === 'tillering' ? 'tillering' : o.code)).map((o) => {
    const p = predictedDas(climM, sow, o.code); return { phase: o.name, observed: o.das, predicted: p ? p.das : null, err: p && p.das != null ? p.das - o.das : null };
  });
  // fuera de muestra: otras estaciones (variedad y sitio distintos). Solo fases EQUIVALENTES.
  const oos = [
    { st: 'partidor', variety: 'Ferón', sow: '2025-12-20', date: '2026-03-04', obsName: 'Inicio de panoja', stage: 'panicle' },
    { st: 'lambayeque', variety: 'El Valor', sow: '2025-11-27', date: '2026-03-01', obsName: 'Inicio de panoja', stage: 'panicle' },
    { st: 'talla', variety: 'El Valor', sow: '2025-11-22', date: '2026-03-09', obsName: 'Desarrollo de panoja', stage: 'panicle_development' },
  ].map((s) => {
    const clim = climateFor(s.st); const p = predictedDas(clim, s.sow, s.stage); const observed = daysBetween(s.sow, s.date);
    return { ...s, station: STATIONS[s.st].name, observed, predicted: p ? p.das : null, err: p && p.das != null ? p.das - observed : null };
  });
  return { inSample, oos };
}

// ---------- C. NDVI Sentinel-2 vs fenología ----------
function testNdvi() {
  const f = path.join(ROOT, 'data', 'demo_morropon', 's2ndvi_-5.1944_-79.9867_2025-11-01_2026-07-15.json');
  if (!fs.existsSync(f)) return null;
  const series = JSON.parse(fs.readFileSync(f, 'utf8')).series, cls = classify(series);
  const valid = series.filter((s) => s.valid && s.scl !== 6 && s.ndvi != null);
  const sow = PROFILE.observed_campaign.sowing_date, d = PROFILE.phenology_das;
  const win = [addDays(sow, d.panicle), addDays(sow, d.flowering)];
  const trough = valid.filter((s) => s.date >= '2025-12-01' && s.date <= '2026-03-15').reduce((m, s) => (s.ndvi < m.ndvi ? s : m));
  return { cls, win, peak_off_days: daysBetween(win[1], cls.peak_date), trough, trough_vs_sowing: daysBetween(sow, trough.date), n_valid: valid.length };
}

// ---------- D. Lluvia ----------
function testRain(obs) {
  const raw = rawFor('morropon').properties.parameter.PRECTOTCORR;
  return obs.map((o) => ({ event: o.name, date: o.date, senamhi: o.pp, power: raw[o.date.replace(/-/g, '')] ?? null }));
}

(async () => {
  const obs = readObs();
  const g = await gatherData(DOMAIN.center.lat, DOMAIN.center.lon);
  const built = buildClimates(g, SCENARIOS.base);
  const prim = built.climates.find((c) => c.role === 'primary') || built.climates[0];
  const T = testTemperature(obs);
  const full = analyzeRice({ ...DOMAIN.center, area_ha: 1 }, g);
  const offsets = full.temperature_check.offsets_c;
  const P = testPhenology(obs, offsets);
  const N = testNdvi();
  const R = testRain(obs);
  const annual = built.climates.map((c) => ({ id: c.id, mm: Math.round(c.climate.annual.precip_mm) }));
  const notDiscriminating = { viable: full.windows.filter((w) => w.status === 'viable').length, total: full.windows.length, spread: full.c2_spread };
  const results = { generated_at: new Date().toISOString(), temperature: T.out, phenology: P, ndvi: N, rain: R, annual_rain: annual, ranking: notDiscriminating };
  fs.writeFileSync(path.join(VAL, 'results.json'), JSON.stringify(results, null, 1));

  // ---------- informe ----------
  const L = [];
  L.push('# Validación del modelo con las referencias disponibles', '');
  L.push(`Generado por \`node scripts/backtest.js\` (${results.generated_at.slice(0, 10)}). Reproducible; los datos de 2026 están en \`data/validation/\`.`, '');
  L.push('## 0. Qué se evalúa y qué no', '');
  L.push('| Salida del modelo | Referencia | ¿Evaluable? |', '|---|---|---|');
  L.push('| Temperatura | 11 valores SENAMHI Morropón 2026 | Sí (validación cruzada) |', '| Fenología, Morropón | SENAMHI 2026 (la usada para calibrar) | Solo **circular** |', '| Fenología, otras estaciones | SENAMHI costa norte 2026 | Sí, fuera de muestra (n pequeño) |', '| Ciclo del cultivo | NDVI Sentinel‑2 en la estación | Orientativo (un píxel) |', '| Lluvia | 11 fechas SENAMHI (casi todo 0 mm) | Muy débil |', '| Orden de fechas / rotación | — | **No**: sin rendimientos ni verdad de campo |', '');

  L.push('## 1. Temperatura (Morropón, 11 valores SENAMHI, clima real de 2026)', '');
  L.push('Error = modelo − SENAMHI (°C). Se compara la media de ±3 días de NASA POWER 2026, con corrección de altitud estándar. *Validación cruzada*: el sesgo se estima con 10 valores y se prueba en el que queda fuera (no circular). *Línea base*: predecir con la media de los otros valores.', '');
  L.push('| Variable | Sin corrección de altitud (sesgo / RMSE) | Con altitud, sin corregir (sesgo / RMSE) | **Con corrección local, validación cruzada** (sesgo / RMSE) | Línea base constante (RMSE) |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(T.out)) L.push(`| ${k} | ${sgn(v.sin_altitud.bias)} / ${f1(v.sin_altitud.rmse)} | ${sgn(v.sin_correccion.bias)} / ${f1(v.sin_correccion.rmse)} | **${sgn(v.validacion_cruzada.bias)} / ${f1(v.validacion_cruzada.rmse)}** | ${f1(v.linea_base_constante.rmse)} |`);
  L.push('', `Rango del desplazamiento estimado entre pliegues (estabilidad): Tmedia ${f1(T.out.Tmedia.offset_rango[0])} a ${f1(T.out.Tmedia.offset_rango[1])} °C · Tmáx ${f1(T.out.Tmáx.offset_rango[0])} a ${f1(T.out.Tmáx.offset_rango[1])} °C · Tmín ${f1(T.out.Tmín.offset_rango[0])} a ${f1(T.out.Tmín.offset_rango[1])} °C.`, '');
  const tx = T.out.Tmáx, tn = T.out.Tmín, tm = T.out.Tmedia;
  L.push(`**Lectura.** Sin corregir, la temperatura modelada queda sesgada (Tmáx ${sgn(tx.sin_correccion.bias)} °C). Tras la corrección local el error en la validación cruzada es RMSE ${f1(tm.validacion_cruzada.rmse)} °C (Tmedia), ${f1(tx.validacion_cruzada.rmse)} °C (Tmáx) y ${f1(tn.validacion_cruzada.rmse)} °C (Tmín). ${tm.validacion_cruzada.rmse < tm.linea_base_constante.rmse ? 'Supera' : 'NO supera'} a la línea base constante en Tmedia (${f1(tm.linea_base_constante.rmse)} °C), ${tx.validacion_cruzada.rmse < tx.linea_base_constante.rmse ? 'supera' : 'no supera'} en Tmáx (${f1(tx.linea_base_constante.rmse)} °C) y ${tn.validacion_cruzada.rmse < tn.linea_base_constante.rmse ? 'supera' : 'no supera'} en Tmín (${f1(tn.linea_base_constante.rmse)} °C). Con 11 valores de una temporada y agregación desconocida de SENAMHI (¿día, década?), esto es **orientativo**.`, '');

  L.push('## 2. Fenología', '');
  L.push('### 2a. Morropón (en muestra: **circular**)', '');
  L.push('Siembra 21‑ene‑2026, ciclo de Tinajones calibrado con estas mismas fechas, clima real de 2026 con corrección térmica local. Solo comprueba que el tiempo térmico no desordena las fases:', '');
  L.push('| Fase | Observada (días) | Modelo (días) | Error |', '|---|---:|---:|---:|');
  for (const r of P.inSample) L.push(`| ${r.phase} | ${r.observed} | ${r.predicted ?? '—'} | ${sgn(r.err)} |`);
  const mIn = metrics(P.inSample.map((r) => r.err).filter((x) => x != null));
  L.push('', `MAE ${f1(mIn.mae)} días (n = ${mIn.n}). **No es validación**: el ciclo se ajustó a estos datos.`, '');
  L.push('### 2b. Otras estaciones (fuera de muestra)', '');
  L.push('Se aplica el ciclo de Tinajones (calibrado en Morropón) a otros sitios con su clima de 2026. Solo se comparan fases **equivalentes** (inicio/desarrollo de panoja). Variedades distintas: el desacuerdo es esperable.', '');
  L.push('| Estación | Variedad | Siembra | Fase observada | Observado (días) | Modelo (días) | Error |', '|---|---|---|---|---:|---:|---:|');
  for (const r of P.oos) L.push(`| ${r.station} | ${r.variety} | ${r.sow} | ${r.obsName} | ${r.observed} | ${r.predicted ?? '—'} | ${sgn(r.err)} |`);
  const mO = metrics(P.oos.map((r) => r.err).filter((x) => x != null));
  L.push('', `**Fuera de muestra: MAE ${f1(mO.mae)} días, sesgo ${sgn(mO.bias)} días (n = ${mO.n}).** Con n = 3 y variedades distintas no se puede concluir el error «real»; sí muestra que **un ciclo único de Tinajones no sirve para otras variedades** (en el modo Precisa se recalibra con las fechas del agricultor).`, '');

  L.push('## 3. NDVI Sentinel‑2 frente a la fenología modelada (Morropón, un píxel)', '');
  if (N) {
    L.push(`- Observaciones válidas: ${N.n_valid}. Patrón: **${N.cls.pattern}** (NDVI p10–p90: ${N.cls.ndvi_p10}–${N.cls.ndvi_p90}).`);
    L.push(`- Pico de NDVI: **${N.cls.peak_date}** (${N.cls.peak_ndvi}). Ventana esperada de pico (panoja–floración): ${N.win[0]} a ${N.win[1]} → el pico quedó **${N.peak_off_days > 0 ? N.peak_off_days + ' días después' : Math.abs(N.peak_off_days) + ' días antes'}** del final de la ventana.`);
    L.push(`- Mínimo de NDVI previo al cultivo: ${N.trough.date} (${N.trough.ndvi}), a ${N.trough_vs_sowing} días de la siembra observada (21‑ene).`);
    L.push('- **Límites:** un píxel de 10 m en la coordenada de la estación puede no ser el campo observado; en Piura casi toda la vegetación sigue las lluvias; el pico de NDVI no coincide exactamente con la floración. Es consistencia cualitativa, no medida de error.', '');
  } else L.push('No hay instantánea Sentinel‑2 guardada.', '');

  L.push('## 4. Lluvia', '');
  L.push(`Lluvia anual media por fuente en Morropón (2015–2023): ${annual.map((a) => `${a.id.toUpperCase()} ${a.mm} mm`).join(' · ')}. Las fuentes discrepan mucho entre sí, y **no hay pluviómetro local** para saber cuál acierta.`, '');
  L.push('Contraste débil con los valores de lluvia diaria que SENAMHI reporta en las fechas de cada fase (NASA POWER 2026):', '');
  L.push('| Fase | Fecha | SENAMHI (mm) | POWER (mm) |', '|---|---|---:|---:|');
  for (const r of R) L.push(`| ${r.event} | ${r.date} | ${f1(r.senamhi)} | ${f1(r.power)} |`);
  const wet = R.filter((r) => r.senamhi > 0);
  const wetTxt = wet.map((r) => `${r.event} (${f1(r.senamhi)} vs ${f1(r.power)} mm)`).join('; ');
  L.push('', `Solo ${wet.length} de ${R.length} fechas tienen lluvia reportada, así que **no permite estimar el error de lluvia**. En esas fechas, SENAMHI vs POWER: ${wetTxt}.`, '');

  L.push('## 5. Orden de fechas de siembra y rotación', '');
  L.push(`- **No evaluables**: no hay rendimientos, resultados de campaña ni fechas «óptimas» verificadas.`);
  L.push(`- **Poder de discriminación:** de las ${notDiscriminating.total} fechas de siembra evaluadas, ${notDiscriminating.viable} quedan «sin impedimento térmico» y el índice varía solo entre ${notDiscriminating.spread.min} y ${notDiscriminating.spread.max} de 100. Acertar la fecha real de siembra de los 5 puntos de SENAMHI (22‑nov a 25‑ene) **no demuestra nada**: casi cualquier fecha pasa.`);
  L.push('- La rotación se decide sobre todo por reglas de alternancia (con dos cultivos) y escalas ordinales provisionales.', '');

  L.push('## 6. Conclusión honesta', '');
  L.push('| Componente | Resultado | Confianza |', '|---|---|---|');
  L.push(`| Temperatura corregida localmente | RMSE ${f1(tm.validacion_cruzada.rmse)} °C (Tmedia) en validación cruzada | Baja‑media (11 valores, una temporada) |`);
  L.push(`| Fenología en la campaña de calibración | Circular | No cuenta como validación |`);
  L.push(`| Fenología en otras estaciones | MAE ${f1(mO.mae)} días (n = ${mO.n}) | Baja: variedades distintas |`);
  L.push('| Ciclo vs NDVI | Consistente en forma, pico algo tardío | Cualitativa |', '| Lluvia | No evaluable | — |', '| Orden de fechas y rotación | No evaluable | — |', '');
  L.push('**Qué haría falta para medir de verdad:** (1) varias campañas observadas por parcela (fechas de fases y cosecha) de agricultores de Morropón; (2) pluviómetro y temperatura locales (SENAMHI diaria); (3) rendimientos y dotación real de riego; (4) revisión de un agrónomo local. El modo Precisa del proyecto está pensado para recoger justamente esos datos.', '');
  // Lectura rápida CALCULADA a partir de los resultados (no escrita a mano)
  const beats = [tm, tx, tn].filter((v) => v.validacion_cruzada.rmse < v.linea_base_constante.rmse).length;
  const quick = '> **Lectura rápida.** ' + [
    `**Temperatura:** el modelo trae un sesgo grande (Tmáx ${sgn(tx.sin_correccion.bias)} °C). Tras corregirlo con datos locales y probarlo con validación cruzada, el error es RMSE ${f1(tm.validacion_cruzada.rmse)} °C (Tmedia); supera a una línea base constante en ${beats} de 3 variables, es decir, **${beats === 3 ? 'sí mejora' : beats === 0 ? 'no mejora' : 'solo mejora parcialmente'} la predicción de la variación de la temperatura** respecto a un valor fijo (referencia de solo 11 valores).`,
    `**Fenología:** en la campaña con que se calibró coincide, pero es circular. Fuera de muestra el error medio es de ${f1(mO.mae)} días (n = ${mO.n}, variedades distintas).`,
    '**Orden de fechas y rotación:** no pueden evaluarse (no hay rendimientos ni resultados de campaña) y el índice casi no discrimina entre fechas.',
  ].join(' ');
  L.splice(3, 0, quick, '');
  fs.writeFileSync(path.join(ROOT, 'docs', 'VALIDACION_MODELO.md'), L.join('\n'));
  console.log(L.slice(0, 3).join('\n')); console.log('Informe escrito en docs/VALIDACION_MODELO.md');
  console.log(JSON.stringify({ tmean_cv: T.out.Tmedia.validacion_cruzada, oos_mae: mO.mae, in_mae: mIn.mae, ndvi_off: N && N.peak_off_days }));
})().catch((e) => { console.error(e); process.exit(1); });
