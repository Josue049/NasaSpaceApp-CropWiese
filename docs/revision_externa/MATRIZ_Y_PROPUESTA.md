# CROPWISE — Revisión metodológica de criterios y ponderaciones

**Fecha:** 14 de noviembre de 2026. **Estado:** propuesta experimental sin validación agronómica. **Base examinada:** `engine.js` 0.2.0, `crops.json` 0.1 y documento *Metodología* proporcionados por el equipo.

## A. Matriz trazable: estado actual → riesgo → modificación

| Criterio en engine.js | Cálculo actual identificado | Riesgo de interpretación | Cambio propuesto para `grouped_v1` |
|---|---|---|---|
| `erosion` | `1 - media(riesgo)/0.5`, riesgo en función de pendiente, lluvia intensa y cobertura | Aumentar el peso por pendiente **y** aumentar riesgo por pendiente duplica parcialmente esa influencia | 50 % del grupo suelo; pendiente solo en el indicador, no en el peso |
| `organic_n` | 0.6 × N ordinal + 0.4 × biomasa ordinal + bono de precultivo | No equivale a contenido medido de materia orgánica ni de N; bonificación no calibrada | 50 % del grupo suelo; etiqueta explícita «proxy ordinal» |
| `water` | Media de `sat` (ratio de satisfacción hídrica, con corrección para riego) | La fórmula `1 - 0.3(1-sat)` carece de volumen de riego medido | 100 % del grupo agua; **sin corregir aquí la física**, que queda pendiente de `climate.js` |
| `resilience` | `1 - 0.65*drought - 0.35*heat` | Riesgo de duplicar sequía junto con `water` | Indicador informativo, peso 0 temporalmente hasta independencia/validación |
| `pest` | Penalizaciones 0.45 por especie repetida, 0.30 por familia; prima diversidad | No mide plagas observadas ni garantiza presión fitosanitaria | 100 % del grupo rotación; renombrar en UI como *diversidad/secuencia* |
| `market` | Preferencia 1–5 ingresada; defecto 3 | No es precio observado ni demanda medida | Participación relativa dentro del grupo economía |
| `low_cost` | Costo ordinal 1–3, sin moneda | No es presupuesto real | Participación relativa dentro del grupo economía |
| `soil_fit` | pH estimado, penalización por arcilla >40 % y sensibilidad de encharcamiento | Arcilla no equivale a drenaje; SoilGrids no es análisis de parcela | Mostrar como diagnóstico, peso 0 en el puntaje experimental; no declarar automáticamente viable |
| `thermal` | Promedio de fracción de años que completa ciclo, nominal y T−δ | Ya interviene en exclusión por ciclo; EcoCrop no calibrado por variedad | Mostrar como diagnóstico, peso 0 en el puntaje experimental |

## B. Fórmula experimental de cuatro grupos

Sea `g = (suelo, agua, rotación, economía)`, cada prioridad no negativa. Se normaliza con `G = Σg`, con `G > 0`.

```
raw_erosion    = suelo/2
raw_organic_n  = suelo/2
raw_water      = agua
raw_pest       = rotación
raw_market     = economía × ingreso/(ingreso+bajo_costo)
raw_low_cost   = economía × bajo_costo/(ingreso+bajo_costo)
raw_resilience = 0
raw_soil_fit   = 0
raw_thermal    = 0
peso_k = raw_k / Σ raw_k
puntaje = 100 × Σ (peso_k × indicador_k)
```

Si ingreso+bajo_costo=0, economía se reparte 50/50. Los grupos por defecto se derivan de los controles ya existentes (`protect_soil`, `water`, `pests`, promedio de `income` y `low_cost`); es mejor crear controles explícitos en la UI.

**Advertencia de diseño:** la redistribución 50/50 y el peso cero de diagnósticos son elecciones de prototipado, no coeficientes establecidos por FAO. **La puntuación experimental no es necesariamente comparable en nivel a la puntuación original.** La condición de *capacidad* del motor original se mantiene y **no es todavía una prueba completa de viabilidad agronómica**.

## C. Restricciones: no cambiar sin revisión de agronomía

- **Mantener como exclusión actualmente programada:** cultivo excluido explícitamente por usuario; cultivo de riego/inundación requerido sin disponibilidad de riego para el **sistema irrigado modelado**. El sistema de arroz de secano requeriría otro perfil.
- **Revisar antes de convertir en veto agronómico:** ETa/ETc <0.5, pendiente >25 % con cobertura <0.5, 3 campañas consecutivas, solanáceas consecutivas, más de una campaña de abono verde, altitud EcoCrop y ciclo que no cabe. Son filtros de diseño o simplificaciones en su implementación.
- **Datos ausentes:** no asignar aptitud confirmada a pH, drenaje, salinidad o humedad cuando no se midan; marcar indeterminación explícita. Por ahora el código deja `soil_fit` nulo si no hay suelo y continúa: una limitación.
- **Arroz en Morropón:** comparar el ciclo con SENAMHI pero no equiparar fases botánicas con etapas Kc; el balance FAO-56 radicular aún no representa lámina inundada y percolación.

## D. Hallazgos de auditoría pendientes — requieren climate.js, datos y pruebas end-to-end

1. `seasonCache` usa `clima|cultivo|slot|dT`. Monte Carlo perturba atributos de `crops`, pero comparte el mapa de caché. **Verificar** si `evaluateSeason` depende de parámetros perturbados; si depende, la caché no se invalida. No se afirma un bug demostrado sin `climate.js`.
2. Monte Carlo selecciona primero `TOPK=60` candidatos bajo el puntaje nominal. La frecuencia `alt_a_is_top` es relativa a ese subconjunto, no necesariamente al universo completo.
3. `ctx.irrigated` transforma `sat` y reduce riesgo por constantes sin información explícita de mm aplicados; no debe interpretarse como programación de riego.
4. `soil_fit` usa arcilla >40 % como indicador indirecto de encharcamiento; se requiere drenaje/observación local.
5. El motor usa 2015–2023 y ventanas A/B fijas: no valida directamente la campaña SENAMHI 2026.
6. La etiqueta *probablemente preferible* refleja la fracción de sorteos de supuestos del algoritmo, **no** una probabilidad de éxito del agricultor.
7. `crops.json` se identifica aún como Alto Mayo/San Martín y los ordinales no están validados para Morropón. No modificar parámetros de arroz para favorecer un resultado.

## E. Protocolo de comparación original vs experimental

**Precondición:** conseguir `src/climate.js` y un fixture local reproducible. Hasta entonces, las pruebas disponibles solo cubren pesos y puntuación aislada.

1. Ejecutar mismo input con `weighting_model` ausente (legacy) y con `weighting_model: 'grouped_v1'`.
2. Registrar ranking nominal, `weights`, `criteria`, reglas de exclusión y `sensitivity.comparisons` de ambas ejecuciones.
3. Probar: solo agua (100); solo suelo (100); solo rotación (100); solo economía (100); mezcla 30/35/20/15; ausencia de SoilGrids; diferencias entre fuentes de lluvia.
4. Probar especialmente arroz (irrigación declarada/sin irrigación); no inferir que la ETc incluye todo el consumo de agua del arrozal.
5. Repetir sensibilidad y comparar estabilidad del ranking. Describir por separado robustez interna y validación con campo.
6. Revisar pruebas de interfaz, perfiles de usuarios y escenarios agroecológicos antes de adoptar el nuevo modo.

## F. Referencias documentales

- Código original `engine.js`: `priorityWeights`, `campaignMetrics`, `scoreSequence`, `cropSlotBlockers`, `sequenceBlockers`, `run` (aportado por Josué).
- `crops.json`: metadatos y `param_status` de arroz (aportado por Josué).
- *Metodología* (PDF compartido): páginas 1–3, apartados 2–6.
- FAO-56 (referencia citada por el propio dataset): https://www.fao.org/4/x0490e/x0490e00.htm. **No se han verificado externamente las cifras agronómicas en este paquete**.

**Propuesta sin validación agronómica ni pruebas de funcionamiento del motor completo.**
