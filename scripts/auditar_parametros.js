'use strict';
/**
 * Genera docs/AUDITORIA_PARAMETROS.md y data/parametros_auditoria.json a partir de src/parametros.js (inventario) y del motor.
 *   node scripts/auditar_parametros.js
 */
const fs = require('fs'), path = require('path');
const { inventory, CATS } = require('../src/parametros');
const ROOT = path.join(__dirname, '..');
const inv = inventory();
const L = [];
const cell = (x) => String(x ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ');

L.push('# Auditoría de parámetros del recomendador (motor v2.1)', '', '> Generado por `node scripts/auditar_parametros.js` desde `src/parametros.js`. Principio: **ningún dato inventado o insuficientemente justificado se usa en silencio**. Las aproximaciones se aceptan si tienen procedencia, incertidumbre expresada y uso correcto.', '');
L.push('## Categorías', '', '| Cat. | Significado |', '|---|---|', ...Object.entries(CATS).map(([k, v]) => `| **${k}** | ${v}: ` + ({ A: 'registro de una fuente real, con ubicación, fecha y unidades', B: 'valor publicado en FAO, SENAMHI, INIA, MIDAGRI u otra fuente identificable', C: 'proporcionado por el agricultor (nunca se completa por él)', D: 'resultado de un modelo o cálculo documentado, con incertidumbre', E: 'valor o criterio sin respaldo suficiente: se propaga como rango, se marca, y no se presenta como hecho ni como prohibición' }[k]) + ' |'), '');
const count = {}; inv.forEach((x) => { count[x.cat] = (count[x.cat] || 0) + 1; });
L.push(`Total de parámetros inventariados: **${inv.length}** · ` + Object.entries(CATS).map(([k, v]) => `${k} ${v}: ${count[k] || 0}`).join(' · '), '');

const groups = [...new Set(inv.map((x) => x.grupo))];
for (const g of groups) {
  L.push(`## ${g}`, '', '| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |', '|---|---|---|---|---|---|---|---|---|---|');
  inv.filter((x) => x.grupo === g).forEach((x) => L.push(`| ${cell(x.nombre)}${x.decisivo ? ' ⚑' : ''} | \`${cell(x.donde)}\` | ${cell(x.valor)} | ${cell(x.unidad)} | **${x.cat}** | ${cell(x.fuente)} | ${cell(x.metodo)} | ${cell(x.incert)} | ${cell(x.efecto)} | ${cell(x.agricultor)} |`));
  L.push('');
}
L.push('⚑ = parámetro que puede cambiar la recomendación según las pruebas de sensibilidad (`docs/COMPARACION_MOTORES.md`, `docs/PRECISA_SENSIBILIDAD.md`).', '');

const hyp = inv.filter((x) => x.cat === 'E');
L.push('## Valores hipotéticos encontrados (categoría E) y decisión', '', '| Parámetro | Valor | ¿Decisivo? | Decisión |', '|---|---|---|---|');
const decision = (x) => (x.decisivo ? 'Se conserva como RANGO propagado y se marca el resultado como sensible a supuestos; no se presenta como hecho' : x.agricultor.startsWith('Sí') ? 'Se conserva y el agricultor puede sustituirlo' : /DESACTIVADO|desactivada|no investigados|ninguno/i.test(`${x.valor} ${x.metodo}`) ? 'No se usa (omitido, no inventado)' : 'Se conserva como criterio metodológico declarado; no excluye por sí solo');
hyp.forEach((x) => L.push(`| ${cell(x.nombre)} | ${cell(x.valor)} | ${x.decisivo ? 'sí' : 'no'} | ${decision(x)} |`));
L.push('');

const opc = inv.filter((x) => x.agricultor.startsWith('Sí, opcional'));
L.push('## Parámetros trasladados al modo Precisa (opcionales)', '', ...opc.map((x) => `- **${x.nombre}** (${x.id}): ${x.efecto}.`), '');
const no = inv.filter((x) => x.agricultor.startsWith('No (conocimiento'));
L.push('## Parámetros científicos que NO se piden al agricultor', '', 'Se mantienen como valores bibliográficos, estimaciones explícitas o rangos propagados:', '', ...no.map((x) => `- ${x.nombre} — cat. ${x.cat}${x.decisivo ? ' ⚑' : ''}`), '');
fs.writeFileSync(path.join(ROOT, 'docs', 'AUDITORIA_PARAMETROS.md'), L.join('\n'));
fs.writeFileSync(path.join(ROOT, 'data', 'parametros_auditoria.json'), JSON.stringify({ generado: new Date().toISOString(), categorias: CATS, conteo: count, parametros: inv }, null, 1));
console.log(`OK: ${inv.length} parámetros · ` + JSON.stringify(count) + ' · docs/AUDITORIA_PARAMETROS.md');
