'use strict';
/**
 * Importa la serie histórica de la estación SENAMHI MORROPÓN y genera los datos procesados y el informe de calidad.
 *   node scripts/senamhi_import.js "C:\ruta\qc00000235.txt"
 * No modifica el archivo original: lo COPIA a data/senamhi/raw/ (con su SHA-256) y trabaja sobre la copia.
 */
const fs = require('fs');
const path = require('path');
const S = require('../src/senamhi');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('Uso: node scripts/senamhi_import.js <ruta a qc00000235.txt>'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'senamhi', 'raw'), OUT_DIR = path.join(ROOT, 'data', 'senamhi');
fs.mkdirSync(RAW_DIR, { recursive: true });

const buf = fs.readFileSync(SRC);
const nonAscii = [...buf].some((b) => b > 127);
const rawCopy = path.join(RAW_DIR, path.basename(SRC));
fs.writeFileSync(rawCopy, buf);
const hash = S.sha256(buf);

const { rows, problems } = S.parseRaw(buf.toString(nonAscii ? 'latin1' : 'utf8'));
const { daily, suspect } = S.normalize(rows);
const cont = S.continuity(daily), cov = S.coverage(daily), monthly = S.monthlyStats(daily), annual = S.annualPrecip(monthly);
const clim = S.monthlyClimatology(monthly), clim8014 = S.monthlyClimatology(monthly, 1981, 2010), clim0114 = S.monthlyClimatology(monthly, 2001, 2014);
const runs = Object.fromEntries(['pr_mm', 'tmax_c', 'tmin_c'].map((k) => [k, S.missingRuns(daily, k, 15)]));
const exc = S.exceedances(daily), ext = S.extremes(daily), ev = S.rainEvents(daily);
const flagCount = {}; daily.forEach((r) => r.flags.forEach((f) => { flagCount[f] = (flagCount[f] || 0) + 1; }));

// sensibilidad de la regla mensual (¿cuántos meses válidos de precipitación bajo cada regla?)
const sens = {};
for (const [name, rule] of Object.entries({ estricta_5_3: { maxMissing: 5, maxConsecutive: 3 }, omm_10_5: S.DEFAULT_MONTH_RULE, laxa_15_10: { maxMissing: 15, maxConsecutive: 10 } })) {
  const m = S.monthlyStats(daily, rule); sens[name] = { regla: rule, meses_pr_validos: m.filter((x) => x.pr_mm.valid).length, anios_completos_pr: Object.keys(S.annualPrecip(m)).length };
}

const meta = {
  estacion: { nombre: 'MORROPON', departamento: 'PIURA', provincia: 'MORROPON', distrito: 'MORROPON', codigo_archivo: path.basename(SRC, '.txt'),
    coordenadas_y_altitud: 'NO figuran en el archivo; no se asumen (la gráfica del portal solo indica nombre y ubicación administrativa)' },
  procedencia: { origen: 'SENAMHI (Servicio Nacional de Meteorología e Hidrología del Perú), portal de datos históricos de estaciones; descarga manual del usuario', archivo_original: path.basename(SRC), tamano_bytes: buf.length, sha256: hash, copia_en_proyecto: path.relative(ROOT, rawCopy).replace(/\\/g, '/'), importado_el: new Date().toISOString() },
  formato: { codificacion: nonAscii ? 'latin1 (bytes >127 presentes)' : 'ASCII', encabezado: 'no', separador: 'espacios', columnas: S.COLUMNS, valor_ausente: S.MISSING,
    unidades: { pr_mm: 'mm/día (acumulado diario; hora de corte no indicada en el archivo)', tmax_c: '°C', tmin_c: '°C' }, asignacion_de_columnas: 'inferida (sin encabezado): ver cabecera de src/senamhi.js', indicadores_de_calidad_en_archivo: 'ninguno' },
  periodo: cont, lineas_con_problemas_de_formato: problems.length, problemas: problems.slice(0, 20),
  calidad: { banderas: flagCount, valores_sospechosos: suspect, rachas_ausentes_15d: runs, sensibilidad_regla_mensual: sens },
  cobertura: cov, climatologia_mensual_todo_el_periodo: clim, climatologia_mensual_1981_2010: clim8014, climatologia_mensual_2001_2014: clim0114,
  lluvia_anual_anios_completos: annual, umbrales_termicos: exc, extremos: ext, eventos_lluvia: ev,
  notas: ['La serie termina el 2014-06-30: NO solapa con la climatología 2015–2023 usada por el motor; sirve para validar fuentes en un periodo anterior (2000-06 → 2014-06 para IMERG; 1981+ para POWER; 1963+ para ERA5).',
    'La temperatura media se estima como (Tmax+Tmin)/2; no es la media de observaciones horarias.',
    'Un 0 de precipitación y un día sin reporte son distintos: solo -99.9 se trata como ausente; no se puede distinguir un 0 real de un 0 no reportado.']
};
fs.writeFileSync(path.join(OUT_DIR, 'morropon_daily.csv'), S.toCsv(daily));
fs.writeFileSync(path.join(OUT_DIR, 'morropon_resumen.json'), JSON.stringify(meta, null, 1));

// ---------- informe legible ----------
const f1 = (x) => (x == null ? '—' : (+x).toFixed(1));
const L = [];
L.push('# SENAMHI MORROPÓN — serie diaria histórica: importación y calidad', '');
L.push('> Generado por `node scripts/senamhi_import.js`. Los datos originales NO se modifican; se copian a `data/senamhi/raw/` con su SHA-256.', '');
L.push('## Procedencia', '', `- Estación: **MORROPON** (Dep. PIURA, Prov. MORROPON, Dist. MORROPON), según la gráfica del portal de SENAMHI.`, `- Archivo: \`${path.basename(SRC)}\` (${buf.length} bytes) · SHA-256 \`${hash}\``, '- Coordenadas y altitud: **no constan en el archivo**; no se asumen.', '- Origen: portal de datos históricos de SENAMHI (descarga manual).', '');
L.push('## Formato (verificado sobre el archivo)', '', '- Sin encabezado, 6 columnas separadas por espacios: `año mes día pr tmax tmin`. Valor ausente `-99.9`. Sin indicadores de calidad.', '- Asignación de columnas **inferida**: la 4.ª es 0 en el 83 % de los días y llega a 170.9 mm; la 5.ª supera a la 6.ª en el 100 % de los días con ambas; coincide con la gráfica del portal.', `- Líneas con problemas de formato: **${problems.length}**.`, '');
L.push('## Cobertura temporal', '', `- Primer día: **${cont.first}** · último día: **${cont.last}** · días esperados: ${cont.expected_days} · registros: ${cont.records} · saltos de calendario: ${cont.calendar_gaps.length}.`, '- **No incluye 2015–2023**: la serie termina antes del periodo de nuestras climatologías.', '');
L.push('| Variable | Días válidos | Cobertura |', '|---|---|---|');
for (const [k, n] of [['Precipitación', 'pr_mm'], ['Tmax', 'tmax_c'], ['Tmin', 'tmin_c'], ['Tmedia estimada', 'tmean_est_c']]) L.push(`| ${k} | ${Math.round(cov.total[n] * cov.total.n / 100)} | ${cov.total[n]} % |`);
L.push('', '### Rachas de ausentes ≥ 15 días', '');
for (const [k, r] of Object.entries(runs)) L.push(`- **${k}**: ` + (r.length ? r.map((x) => `${x.from}→${x.to} (${x.days} d)`).join('; ') : 'ninguna'));
L.push('', '### Años con ausentes (días con dato / días del año)', '', '| Año | Pr | Tmax | Tmin |', '|---|---|---|---|');
for (const [y, c] of Object.entries(cov.by_year)) if (c.pr_mm < 100 || c.tmax_c < 100 || c.tmin_c < 100) L.push(`| ${y} | ${c.pr_mm} % | ${c.tmax_c} % | ${c.tmin_c} % |`);
L.push('', '## Banderas de calidad', '', Object.entries(flagCount).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n'), '', `Valores sospechosos conservados (umbral de revisión pr ≥ ${S.SUSPECT.pr_mm} mm, Tmax ≥ ${S.SUSPECT.tmax_c} °C, Tmin ≤ ${S.SUSPECT.tmin_c} °C): ${suspect.length}` + (suspect.length ? ' → ' + suspect.slice(0, 12).map((s) => `${s.date} ${s.var}=${s.value}`).join('; ') : ''), '');
L.push('## Validez mensual y sensibilidad de la regla', '', '| Regla (ausentes máx. / consecutivos máx.) | Meses de precipitación válidos | Años completos |', '|---|---|---|');
for (const [n, s] of Object.entries(sens)) L.push(`| ${n} (${s.regla.maxMissing}/${s.regla.maxConsecutive}) | ${s.meses_pr_validos} | ${s.anios_completos_pr} |`);
L.push('', '## Climatología mensual (meses válidos, regla 10/5)', '', '| Mes | Lluvia 1963-2014 (mm) | Lluvia 2001-2014 (mm) | Tmax (°C) | Tmin (°C) | Tmedia est. (°C) |', '|---|---|---|---|---|---|');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
clim.forEach((c, i) => L.push(`| ${MES[i]} | ${f1(c.pr_total_mm.mean)} (${c.pr_total_mm.n_years}) | ${f1(clim0114[i].pr_total_mm.mean)} (${clim0114[i].pr_total_mm.n_years}) | ${f1(c.tmax_c.mean)} | ${f1(c.tmin_c.mean)} | ${f1(c.tmean_est_c.mean)} |`));
L.push('', '(entre paréntesis, años con mes válido). La media anual de lluvia de una climatología con años faltantes no equivale a un total anual observado.', '');
const ay = Object.entries(annual);
L.push('## Lluvia anual (solo años con 12 meses válidos)', '', ay.map(([y, v]) => `${y}: ${Math.round(v)} mm`).join(' · '), '', `Años completos: ${ay.length}. Mediana: ${f1([...ay.map((a) => a[1])].sort((a, b) => a - b)[Math.floor(ay.length / 2)])} mm; máximo: ${f1(Math.max(...ay.map((a) => a[1])))} mm (${ay.sort((a, b) => b[1] - a[1])[0][0]}). Distribución muy asimétrica (años Niño).`, '');
L.push('## Extremos y umbrales', '', `- Mayores lluvias diarias: ${ext.pr_mm_top.slice(0, 5).map((x) => `${x.date} ${x.value} mm`).join('; ')}`, `- Tmax más altas: ${ext.tmax_c_top.slice(0, 5).map((x) => `${x.date} ${x.value} °C`).join('; ')}`, `- Tmin más bajas: ${ext.tmin_c_lowest.slice(0, 5).map((x) => `${x.date} ${x.value} °C`).join('; ')}`);
for (const [k, o] of Object.entries(exc)) L.push(`- Días con ${k} ≥ umbral (sobre ${o.valid_days} días válidos): ` + Object.entries(o.thresholds).map(([t, v]) => `${t}: ${v.days} (${v.pct_of_valid} %)`).join(' · '));
L.push(`- Lluvia: ${ev.wet_days_ge_1mm} días ≥1 mm · ${ev.days_ge_20mm} días ≥20 mm · P95 de días húmedos ${ev.wet_day_p95_mm} mm · P99 ${ev.wet_day_p99_mm} mm.`, '');
L.push('## Limitaciones', '', ...meta.notas.map((n) => `- ${n}`), '');
fs.writeFileSync(path.join(ROOT, 'docs', 'SENAMHI_MORROPON_QC.md'), L.join('\n'));
console.log(`OK: ${daily.length} registros ${cont.first}→${cont.last}; problemas de formato ${problems.length}; sospechosos ${suspect.length}`);
console.log('Escrito: data/senamhi/morropon_daily.csv, data/senamhi/morropon_resumen.json, docs/SENAMHI_MORROPON_QC.md');
