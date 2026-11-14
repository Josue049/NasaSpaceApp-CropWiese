# Entregable para Josué — CROPWISE / Field Shift, Morropón
**Fecha:** 14-11-2026 · **Estado:** propuesta experimental para revisión; NO fusionar sin pruebas del repositorio completo.

## 1. Decisión metodológica
Respetar la estructura aprobada en `CRITERIOS_ARROZ.md`: C1 Agua (50 %), C2 Fenología y riesgo térmico (40 %), C7 Rotación y sostenibilidad (10 %). **No reintroducir** mercado, costo, suelo ni sanidad, excluidos por el equipo. M = confianza de datos, NO suma puntos. El motor genérico de nueve criterios se conserva sin modificaciones.

## 2. Matriz criterio → fuente → qué se puede puntuar
| Código | Indicador actual / disponibilidad | Decisión de diseño de esta propuesta | Validación pendiente |
|---|---|---|---|
| C1.1 | ETc con FAO-56 y NASA POWER | Mostrar mm; no convertir ETc en riego total | Verificar cálculo, radiación y unidades |
| C1.2 | Lámina total del arroz (sin percolación ni saturación local) | **No se puntúa sin dato** | Percolación, saturación, lámina y manejo |
| C1.3 | Dotación real de canal (no disponible) | **No se puntúa sin dato** | Junta de usuarios/ANA, fechas y unidades |
| C1.4 | ETa/ETc del motor | Indicador contextual separado, NO suficiencia real de riego | Validar balance para arroz inundado |
| C1.5 | Fracción histórica de déficit | Mostrar por separado; no duplicar automáticamente C1.4 | Validación con estaciones y riego |
| C1.6 | Lluvia IMERG/ERA5/POWER | Mostrar rango y desacuerdo, sin inferir error verdadero | Verificar periodos/estaciones locales |
| C2.1 | 114 DAS a maduración córnea SENAMHI | Punto de contraste, NO ciclo de cosecha observado ni verdad multianual | Verificar variedad Tinajones/Mallares y fechas |
| C2.2 | Fracción de años que completa ciclo | Indicador para C2 | Calendario real / cultivo local |
| C2.3 | Tmin nocturna en floración | Mostrar, sin umbral inventado | Literatura varietal |
| C2.4 | Tmax en floración/panoja | Indicador para C2 si `rice.js` entrega fracción **en floración** | Umbral local y corrección altitudinal |
| C2.5 | Ventanas 10 días | Mostrar estados con advertencia | Calendario validado |
| C2.6 | Incertidumbre térmica estimada | Mostrar rango, NO prueba de error real | Estación SENAMHI diaria |
| C7.1 | Bono de leguminosa +0,08 | NO interpretarlo como kg N o fertilidad medida | Agrónomo y manejo de residuos |
| C7.2 | Repetición de cultivo/familia | Puntuación ordinal de alternancia explícita | Patógenos, rotaciones apropiadas |
| C7.3 | Descanso/barbecho | Por ahora nota cualitativa | Manejo real de cada parcela |
| C7.4 | Arroz/frijol | Solo esas especies para demo; NO afirmar que frijol sirve en ambas campañas | Validación térmica y calendario local |

## 3. Diseño de puntuación propuesto para discusión
- Pesos principales de diseño: 0,50, 0,40, 0,10. Se normalizan si se expresan como 50/40/10.
- **C1 no tiene puntuación sin `irrigation_supply_mm` y `irrigation_requirement_mm` referidos a una misma campaña y área.** ETc o ETa/ETc no sustituyen esas entradas. Si llegan ambas, el módulo calcula *un cociente de cobertura de suministro ilustrativo*, no una lámina de riego verificada. Para convertirlo en criterio científico faltan eficiencia, pérdidas, requerimiento neto/bruto y método de manejo.
- C2 experimental = 0,6 × promedio de las fracciones de años que completa ciclo con T y T−δ + 0,4 × (1 − fracción de días con calor durante **floración**). Estos 0,6/0,4 NO vienen de FAO; son hipótesis explícitas para análisis de sensibilidad. **No utilizar el `heat_frac` de la etapa media de `climate.js` como si fuera la ventana de floración**.
- C7 experimental = 1 − [repeticiones de cultivo + 0,5 × repeticiones de familia] / [transiciones observadas], acotado a [0,1]. El 0,5 es un supuesto de diseño. No cuantifica plagas, nitrógeno ni sostenibilidad real.
- Sin una variable, se informa `null`, nunca cero. El `partial_diagnostic_score` se etiqueta como **diagnóstico parcial no comparable con puntuación completa**. `complete_score` solo se calcula cuando existen los tres componentes, pero permanece **NO RECOMENDACIÓN**.
- Si no hay datos suficientes de agua, NO ordenar estrategias como si estuviese resuelto C1. Se puede presentar solamente un explorador de fenología y alternancia.

## 4. Integración segura
1. Mantener intactos `src/engine.js`, `src/climate.js`, `src/rice.js` y `data/crops.json`. El archivo entregado es independiente: `src/rice_criteria_proposal.js`.
2. Josué debe construir un **adaptador** que lea salidas de `rice.js`, `climate.js`, la secuencia y datos documentados de suministro de riego. No se adjunta un adaptador automático porque **no recibimos `src/rice.js` ni la estructura de sus resultados**.
3. Ejecutar el ejemplo de abajo primero con valores sintéticos (etiquetados así). No integrar puntuación parcial en la clasificación de la demo.
4. En el UI mostrar una línea por C1/C2/C7: valor, fuentes, faltantes, advertencias y resultado de incertidumbre. La sección M determina el nivel de confianza y nunca puntúa.
5. Comparar resultados del esquema 50/40/10 contra el motor genérico en la misma parcela, serie de lluvia, fechas y reglas, **sin llamar equivalentes los puntajes**; son modelos distintos.
6. Pedir revisión agronómica para umbrales y calendario; pruebas de regresión e integración antes de una rama compartida.

## 5. Ejemplo de uso SINTÉTICO
```js
const {evaluateRiceCriteria}=require('./src/rice_criteria_proposal');
const result=evaluateRiceCriteria({
  etc_mm:650, // solo visual: NO es requerimiento total
  complete_fraction:0.95, complete_fraction_cold:0.85,
  flowering_heat_fraction:0.7, // procedería de rice.js si está calculada en floración
  sequence:['frijol','arroz','frijol','arroz'],
  prior_crop_id:'arroz', family_by_id:{arroz:'Poaceae',frijol:'Fabaceae'}
});
console.log(result.criteria.C1.score); // null: falta suministro / demanda total
console.log(result.complete_score); // null
console.log(result.status); // EXPLORATORIO_NO_RECOMENDACION
```

## 6. Pruebas requeridas en la implementación completa
- Fecha de siembra real 2026-01-21: permitir fecha libre en modo evaluación, separar clima histórico 2015–2023 de SENAMHI 2026.
- Confirmar si el dato SENAMHI es maduración córnea, NO cosecha, y aclarar ambigüedad de variedad.
- Forzar `flowering_heat_fraction=null` cuando no se disponga de ventana de floración y comprobar C2 ausente.
- Comprobar bajo altas tasas de calor que ninguna etiqueta del UI diga «viable» de forma concluyente sin respaldo local.
- Mantener fijo el conjunto de fuentes para comparar rankings; análisis de sensibilidad 50/40/10, 40/50/10, 40/40/20, entre otras.
- Corregir o advertir antes de recomendar: el riego declarado en el motor genérico no se incorpora como aporte físico diario de agua; no aplicar automáticamente sus puntuaciones de ETa/ETc a arroz inundado.
- Verificar escala, altitud y signo de corrección de POWER (demo reporta diferencia 933 m) y fuentes de lluvia (336–908 mm/año).

## 7. Fuentes y procedencia
- Documento base entregado por el equipo: `docs/CRITERIOS_ARROZ.md`, rama `bajo-piura-arroz`, 14/11/2026.
- Archivos revisados: `engine.js`, `climate.js`, `crops.json` suministrados por el equipo.
- Allen et al. (1998), FAO Irrigation and Drainage Paper 56: https://www.fao.org/4/x0490e/x0490e00.htm
- NASA POWER: https://power.larc.nasa.gov/
- SENAMHI, reporte usado en discusión anterior: https://www.senamhi.gob.pe/load/file/02972SENA-148.pdf (verificación final de tabla y variedad pendiente).
- **No se consultaron repositorios privados ni se efectuó calibración agronómica.**
