# Motor v2 (dos etapas) y rama `feat/fieldshift-morropon-validation`

Estado: rama de desarrollo; **nada de esto se ha publicado**. Base: `ui-rediseno-fieldshift` (ef72aaa) + rediseño visual v2 (cd3f702). Investigación de respaldo: `../fieldshift-lab/INFORME.md` (scripts y resultados reproducibles).

## Qué cambió

| Área | Cambio | Dónde |
|---|---|---|
| Ubicación | El punto elegido alimenta al motor: clima por celda nativa (POWER 0,5°×0,625°, ERA5 ≈0,1°, IMERG 0,1°) con alias a la estación de referencia; elevación, pendiente y suelo del punto; respaldo explícito si una fuente falla; fuera del ámbito no se consultan datos | `src/location.js`, `src/pipeline.js`, `server.js` |
| SENAMHI Morropón | Importación de `qc00000235.txt` (1963-10-01 → 2014-06-30), control de calidad, cobertura, climatología, informe | `src/senamhi.js`, `scripts/senamhi_import.js`, `docs/SENAMHI_MORROPON_QC.md` |
| Validación de fuentes | POWER, ERA5 e IMERG frente a la estación, 2001–2014, partición temporal A/B, línea base, bootstrap por años | `scripts/validate_sources_senamhi.js`, `docs/VALIDACION_FUENTES_SENAMHI.md` |
| Temperatura | ERA5-Land (modelo fijado: con `best_match` la API cambia de producto en 2017) + offsets mensuales calibrados con la estación; estrés por calor con la frecuencia observada en la estación | `src/climate.js`, `src/pipeline.js`, `data/validation/calibration_senamhi.json` |
| Cultivo | Frijol Loctao (*Vigna radiata*) con procedencia por parámetro; el frijol común sigue en la base | `data/crops.json`, `src/morropon.js` |
| Motor | v2 en dos etapas (`src/engine2.js`); v1 intacto (`engine: 'v1'`) | `src/engine2.js`, `src/pipeline.js` |
| Clima reciente | NASA POWER diario (7 días con dato válido común), contraste con ERA5, estados explícitos; solo informativo | `src/recent.js`, `/api/climate/recent` |
| Interfaz | Modos y campañas en el bloque 2, línea de tiempo, interpretación y confiabilidad reorganizadas, pie sobrio | `public/` |

## Cómo decide el v2

**Etapa 1 — viabilidad** por cultivo × campaña × parcela. Cada celda se evalúa con 3 fuentes de lluvia × 3 desplazamientos térmicos (±δ), ponderando las fuentes por su error frente a SENAMHI. Resultado: `favorable`, `condicionada` o `inviable`.
- Fallo duro: ciclo incompleto, riego requerido sin agua, ETa/ETc < 0,5 con la dotación disponible, altitud sobre EcoCrop, pH fuera del rango absoluto, pendiente > 25 % con cobertura baja.
- Alertas (no excluyen): ciclo completo en < 90 % de años, calor sobre el umbral en la etapa media, cobertura hídrica < 80 %, pH fuera del óptimo.
- Sin dotación declarada se informa la **demanda** de agua y no se evalúa limitación; con dotación (modo Precisa) o sin riego sí.
- Arroz: demanda = ETc − lluvia + saturación (200 mm) + percolación × días (2–8 mm/d, 5 central; FAO). Se sustituye por la percolación que declare el agricultor.

**Etapa 2 — comparación** entre secuencias sin campañas inviables: primero menos campañas condicionadas, luego puntaje. Criterios (sin doble conteo): demanda de agua, cobertura hídrica (solo con dotación), calor, erosión, nitrógeno (ordinal), aptitud de suelo, rotación, y economía/mercado solo si el agricultor los declara. El costo ordinal sin fuente ya no puntúa.

Entradas opcionales del agricultor (modo Precisa, no se guardan): dotación de agua, percolación, cultivo principal a conservar (campañas concretas o mínimo de campañas), rendimiento, precio y costos por cultivo. La comparación económica se activa **solo si está completa para ambos cultivos**.

Sin alternativa viable: el motor no rellena tarjetas; devuelve `no_viable` con el motivo por campaña y qué dato o decisión permitiría evaluarlo.

## Parámetros y su estado (también en la respuesta, `engine_params`)

| Parámetro | Valor | Estado |
|---|---|---|
| Percolación del arroz | 5 mm/d (rango 2–8) | LITERATURA (FAO), sin dato local |
| Saturación / preparación del arroz | 200 mm (0–200) | LITERATURA (FAO) |
| Fracción de sorteos para declarar inviable / condicionada | 0,8 / 0,1 | PROVISIONAL (probado 0,7–0,9 sin efecto) |
| Umbral de alerta de calor | 25 % de días en la etapa media | PROVISIONAL |
| ETa/ETc mínimo (0,5) y déficit (0,8) | — | HEREDADO del motor original |
| Pendiente máxima del arroz inundado | — | **DESACTIVADO**: sin valor citable |
| Penalización por repetir cultivo / familia | 0,45 / 0,3 | PROVISIONAL (supuesto del equipo) |
| Umbral de calor del Loctao | 35 °C | HIPÓTESIS (se prueba 32–40 °C) |
| Ciclo del Loctao | 59 d (intervalo abierto 54–90) | OBSERVADO + ESTIMACIÓN |

## Resultados de sensibilidad (resumen; detalle en `docs/COMPARACION_MOTORES.md`)

- El **agua** cambia las decisiones: con riego sin límite declarado, 12 000 m³/ha o 15 000 m³/ha la mejor alternativa conserva más arroz; con 9 000 m³/ha el arroz de la campaña chica es inviable; con ≤ 6 000 m³/ha el arroz es inviable en ambas.
- Los **parámetros que más mueven el resultado** no son del Loctao: la **percolación del arroz** (con 9 000 m³/ha, 2 mm/d → `ALAL`, 5 → `LLAL`, 8 → `LLLL`) y el **umbral de calor** del Loctao (32 °C → 49 puntos, 35 → 61, 38 → 70). El **ciclo** del Loctao (59–90 d) cambia poco.
- Las **prioridades** ahora sí cambian el ganador (calor → `ALAL`; plagas → `LALA`).
- Sin cultivo principal ni economía, la comparación tiende al cultivo de menor demanda de agua; la interfaz lo dice y ofrece declararlos.
- **Ubicación**: cambian altitud, pendiente, pH, fuente de lluvia disponible y la demanda de riego del arroz (1 067 → 1 242 mm en la campaña grande entre el centro y el suroeste); con pendiente > 50 % el punto se declara no recomendable.

## Qué NO debe activarse todavía en producción

1. **Cualquier recomendación como si estuviera validada con datos agronómicos**: el modelo se validó solo en variables meteorológicas (SENAMHI 2001–2014); no hay validación de campo ni de rendimientos.
2. **La calibración de temperatura aplicada a 2015–2023** asume sesgo estable entre 2001–2014 y 2015–2023 (hipótesis) y representatividad de una sola estación para todo el recuadro.
3. **Pendiente máxima del arroz inundado** y cualquier umbral adicional de topografía (sin fuente).
4. **El umbral de calor 35 °C del Loctao** y los límites de percolación como si fueran medidos.
5. **Maíz** y cualquier tercer cultivo (ver el informe del laboratorio).
6. **Clima reciente alimentando el puntaje** (hoy es solo informativo).
7. **Corrección de sesgo de la lluvia de IMERG** (no mejoró de forma estable fuera de muestra).

## Pendiente para cerrar incertidumbres
- Ficha de la variedad de Loctao (INIA/DRAP): ciclo siembra→cosecha y tolerancia al calor.
- Lluvia observada de SENAMHI después de 2014 y, si es posible, temperatura 2015–2023 de la estación, para validar el periodo que usa el motor.
- Coordenadas y altitud oficiales de la estación (no constan en el TXT).
- Serie IMERG de las demás celdas del recuadro (hoy solo el centro está descargado).
- Percolación real del arroz en Morropón y dotación habitual de los canales.
