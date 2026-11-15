# Auditoría de parámetros del recomendador (motor v2.1)

> Generado por `node scripts/auditar_parametros.js` desde `src/parametros.js`. Principio: **ningún dato inventado o insuficientemente justificado se usa en silencio**. Las aproximaciones se aceptan si tienen procedencia, incertidumbre expresada y uso correcto.

## Categorías

| Cat. | Significado |
|---|---|
| **A** | Observado: registro de una fuente real, con ubicación, fecha y unidades |
| **B** | Bibliográfico: valor publicado en FAO, SENAMHI, INIA, MIDAGRI u otra fuente identificable |
| **C** | Declarado: proporcionado por el agricultor (nunca se completa por él) |
| **D** | Estimado: resultado de un modelo o cálculo documentado, con incertidumbre |
| **E** | Hipótesis: valor o criterio sin respaldo suficiente: se propaga como rango, se marca, y no se presenta como hecho ni como prohibición |

Total de parámetros inventariados: **59** · A Observado: 4 · B Bibliográfico: 12 · C Declarado: 13 · D Estimado: 6 · E Hipótesis: 24

## Entradas del agricultor

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| ¿Dispone de riego? ⚑ | `server.js irrigation3 · engine2.supplyFor` | sí / no / no lo sé (null) | — | **C** | Declaración del agricultor | Tres estados. «No lo sé» NO se convierte en «sí»: se evalúa el escenario con riego y se marca como condicionado lo que depende de él | Alta si no se declara | Decide si el arroz es viable; define el escenario de agua | Sí (entrada del formulario) |
| Agua por campaña ⚑ | `engine2.supplyFor` | vacío = no declarado | m³/ha | **C** | Declaración del agricultor | m³/ha ÷ 10 = mm; cobertura = 1 − (demanda − dotación)/ETc | La que tenga el dato declarado | Cobertura hídrica; riesgo hídrico alto si no cubre | Sí, opcional en modo Precisa |
| Pérdida por filtración del arroz ⚑ | `engine2.percInfo` | vacío = usa FAO | mm/día | **C** | Declaración (medición local, si existe) | Sustituye al rango FAO | Alta (no verificada) | Demanda de riego del arroz | Sí, opcional en modo Precisa |
| Textura del suelo | `engine2.applySoil / TEXTURE` | arenosa · franca · arcillosa · no sé | — | **C** | Declaración del agricultor | Fija capacidad de agua útil, encharcamiento y la percolación FAO de esa textura | Media (clasificación visual) | Percolación del arroz, agua útil, aptitud de suelo | Sí, opcional en modo Precisa |
| pH medido | `engine2.applySoil` | vacío = SoilGrids | pH | **C** | Análisis de suelo del agricultor | Sustituye al pH de SoilGrids | Baja si hay análisis | Aptitud de suelo y límite absoluto de la especie | Sí, opcional en modo Precisa |
| Fecha prevista de siembra (1.ª campaña) ⚑ | `engine2.buildEnv slot «F»` | vacío = fecha de referencia | fecha | **C** | Declaración del agricultor | La primera campaña se evalúa con su día/mes; las demás conservan las fechas de referencia | Baja | Clima, agua y calor de esa ventana | Sí, opcional en modo Precisa |
| Ciclo observado (arroz / Loctao) ⚑ | `pipeline.analyze + engine2.variantsFor` | vacío = valor observado/rango | días | **C** | Declaración del agricultor | Escala las etapas del ciclo; fija el valor y deja de propagarse el rango | Baja | Duración, agua, calor, suelo desnudo | Sí, opcional en modo Precisa |
| Cultivo principal a conservar | `engine2.keepOk` | sin restricción | — | **C** | Declaración del agricultor | Filtra las secuencias comparadas (campañas concretas o mínimo) | No aplica | Restringe el conjunto de secuencias | Sí, opcional en modo Precisa |
| Rendimiento, precio y costos | `engine2.economicsFor` | sin datos | S/ y t/ha | **C** | Declaración del agricultor | Margen = rendimiento × precio − costos; solo entra al puntaje si está completo para ambos cultivos | Alta (no verificada) | Criterio económico del puntaje | Sí, opcional en modo Precisa |
| Cultivo actual y campaña anterior | `engine2.run history` | «no lo sé» permitido en la campaña anterior | — | **C** | Declaración del agricultor | Proyección de la rotación actual y penalización por repetir | Baja | Rotación actual de comparación y penalización de repetición | Sí (entrada del formulario) |
| Prioridades (suelo, agua, calor, plagas, ingreso, costo) | `engine2.groupWeights` | neutras (3) si no se declaran | 0–5 | **C** | Declaración del agricultor | Peso de cada grupo de criterios; neutro = igual peso (no es una declaración) | No aplica | Pesos del puntaje | Sí, opcional en modo Precisa |
| Primera campaña a evaluar | `server.js / engine2 ORDER` | próxima campaña según la fecha de hoy | grande/chica | **C** | Selección del agricultor (valor inicial = próxima campaña de referencia) | Orden de las cuatro campañas | No aplica | Calendario de la rotación | Sí (entrada del formulario) |

## Agua y riego

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Percolación del arroz (referencia) ⚑ | `engine2.PARAMS.rice_perc_mm_day` | 5 (rango 2–8) | mm/día | **B** | FAO, Irrigation Water Management: 2 (arcilla pesada) a 8 (arenoso); 5 media sin dato local | Se propaga el rango (3 valores) salvo dato declarado o textura declarada | Alta: sin medición local | Demanda de riego del arroz (≈ ±350 mm); con agua limitada cambia el ganador | Sí, opcional en modo Precisa |
| Saturación inicial / preparación de suelo (arroz) | `engine2.PARAMS.rice_sat_mm` | 200 (rango 0–200) | mm | **B** | FAO (misma obra): ≈ 200 mm; el batido la reduce | Rango 0–200 en la sensibilidad | Media | Demanda de riego del arroz (+200 mm) | No (conocimiento científico especializado) |
| ETc por etapas (Kc) | `climate.kcAt · crops.json` | ver cultivos | — | **B** | FAO-56 Tabla 12 | ETc = Kc × ET0 (Penman-Monteith FAO-56) | Media | Demanda de agua y balance hídrico | No (conocimiento científico especializado) |
| Profundidad radicular y agotamiento permisible | `crops.json (root_m, p_depletion)` | arroz 0.5 m / p 0.2; Loctao 0.6 m / p 0.45 | m y fracción | **B** | FAO-56 Tabla 22 (extremo conservador del rango) | TAW = AWC × raíz; RAW = p × TAW | Media | Estrés hídrico en secano | No (conocimiento científico especializado) |
| Capacidad de agua útil del suelo | `climate.awcFromSoil` | 110 (franco); 70 si arena ≥ 60 %; 120 si arcilla ≥ 40 % | mm/m | **D** | Heurística del motor original sobre SoilGrids (o textura declarada) | Por clase de textura | Alta: SoilGrids es modelado | Balance hídrico del cultivo | Sí, opcional en modo Precisa |
| ETa/ETc mínimo (riesgo hídrico alto) ⚑ | `engine2.PARAMS.cover_hard` | 0.5 | fracción | **E** | Umbral metodológico heredado del motor original | Por debajo: «condicionada» de riesgo alto, no inviable | No cuantificada | Excluye la secuencia de las alternativas si hay otra opción | No (conocimiento científico especializado) |
| ETa/ETc de alerta | `engine2.PARAMS.cover_soft` | 0.8 | fracción | **E** | Criterio heredado (déficit hídrico) | Genera una alerta | No cuantificada | Solo alerta | No (conocimiento científico especializado) |
| Factor de riego en el motor original (×0,3 sobre el riesgo de sequía) | `engine.js (v1) / climate.evaluateSeason` | 0,3 | — | **E** | Supuesto del equipo (motor original) | Solo en v1 (regresión); el v2 no lo usa | — | Ninguno en v2 | No (conocimiento científico especializado) |

## Clima y temperatura

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Fuentes de lluvia y sus pesos ⚑ | `data/validation/calibration_senamhi.json` | IMERG 0,65 · POWER 0,22 · ERA5 0,13 | fracción | **D** | Validación frente a SENAMHI Morropón 2001–2014 (1/RMSE² mensual) | Pesos de confiabilidad; la clasificación se comprueba también con pesos iguales | Media: NO validadas para 2015–2023 | Clasificación de viabilidad y demanda de agua | No (conocimiento científico especializado) |
| Climatología usada | `datasources.Y0/Y1` | 2015–2023 | años | **A** | IMERG/ERA5/POWER 2015–2023 | Años observados por producto | Incluye años Niño (2017): muestra corta | Lluvia y balance hídrico | No (dato geográfico/satelital) |
| Temperatura corregida ⚑ | `pipeline.tempMethod · climate.buildClimate` | ERA5-Land + offsets mensuales | °C | **D** | Calibrada con SENAMHI 2001–2014 (mejora fuera de muestra en ambos sentidos) | Offsets mensuales Tmax, Tmin, Tmedia | Hipótesis: sesgo estable en 2015–2023 | Tiempo térmico, ET0, ciclo | No (conocimiento científico especializado) |
| Incertidumbre térmica (±δ) | `climate.tempUncertainty` | √(1,9² + (1,5·Δz/1000)²) ≈ 1,9–2,4 | °C | **D** | RMS entre productos (docs/AUDITORIA) y gradiente 1,5 °C/km | Se propaga como −δ, 0, +δ | Media | Ancho de la incertidumbre de viabilidad | No (conocimiento científico especializado) |
| Gradiente térmico | `climate.buildClimate` | −6,5 | °C/km | **B** | Gradiente estándar | Entre la estación de referencia (141 m) y el punto (SRTM) | Media (±1,5 °C/km) | Temperatura en puntos de distinta altitud | No (dato geográfico/satelital) |
| ET0 Penman-Monteith y piso de viento | `climate.et0Day · U2_MIN` | 0,5 m/s | m/s | **B** | FAO-56 (piso recomendado de viento) | Fórmula FAO-56 con datos POWER | Baja a media | Demanda atmosférica | No (conocimiento científico especializado) |
| Inicialización del balance hídrico | `climate.SPINUP_DAYS` | 45 | días | **E** | Supuesto del motor (barbecho con Kc 0,4) | Humedad inicial del suelo | No cuantificada | Déficit inicial | No (conocimiento científico especializado) |

## Calor

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Frecuencia de días calurosos ⚑ | `climate.heatProb · calibration_senamhi.json` | P(Tmax ≥ umbral) por día del año | fracción | **A** | SENAMHI Morropón 1981–2014 (observada) | Ventana ±7 días; transferencia al punto con el gradiente | La frecuencia es observada; su aplicación a 2015–2023 es una hipótesis | Estrés por calor en la etapa media | No (dato geográfico/satelital) |
| Umbral de calor del Loctao ⚑ | `engine2.PARAMS.loctao_t_stress_c` | 35 (rango 32–38) | °C | **E** | Sin umbral citable único; estudios de calor en V. radiata (35 °C control; pérdida de flores > 40 °C) | Se propaga 32/35/38 °C | Alta | Porcentaje de días de calor (4–67 %) y puntaje | No (conocimiento científico especializado) |
| Umbral de calor del arroz | `engine2.PARAMS.rice_t_stress_c` | 35 (rango 33–37) | °C | **E** | Valor genérico no verificado para Tinajones | Se propaga 33/35/37 °C | Media | Porcentaje de días de calor | No (conocimiento científico especializado) |
| Umbral de alerta de calor | `engine2.PARAMS.heat_soft` | 0.25 | fracción de días | **E** | Metodológico | Genera una alerta | No cuantificada | Solo alerta | No (conocimiento científico especializado) |

## Suelo y relieve

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| pH, arcilla y arena | `datasources.getSoil` | por punto | pH, % | **D** | ISRIC SoilGrids 2.0 (250 m, modelado; no es un análisis de la parcela) | Media 0–30 cm | Alta | Aptitud de suelo; encharcamiento; agua útil | Sí, opcional en modo Precisa |
| Altitud y pendiente | `datasources.getSlope` | por punto | m, % | **D** | SRTM 30 m (OpenTopoData), ventana de 180 m | Horn 3×3 | Media | Temperatura, erosión, soporte del punto | No (dato geográfico/satelital) |
| Pendiente de riesgo (cobertura baja) | `engine2.PARAMS.slope_risk_pct` | 25 | % | **E** | Regla heredada del motor original | Marca riesgo alto en cultivos de cobertura baja | No cuantificada | Riesgo de erosión | No (conocimiento científico especializado) |
| Pendiente que bloquea el análisis | `pipeline.assessSupport` | > 50 % | % | **E** | Regla heredada: el modelo (cultivos anuales) no es adecuado | Declara «no recomendable» antes de correr el motor | No cuantificada | Impide recomendar en esas parcelas | No (conocimiento científico especializado) |
| Pendiente máxima del arroz inundado | `engine2.PARAMS.rice_slope_max_pct` | desactivada | % | **E** | No hay un valor citable (candidata: FAO Soils Bulletin 55) | No se aplica | — | Ninguno | No (conocimiento científico especializado) |
| Rango óptimo y absoluto de pH | `crops.json (ph, ph_abs)` | Loctao 5.5–7.2 (abs 4.3–8.3); arroz 5–7.5 (abs 4,5–9) | pH | **B** | EcoCrop (en conflicto con una guía de Sudáfrica para el Loctao) | Óptimo: penaliza la aptitud; absoluto: límite de la especie | Media | Aptitud de suelo; inviable fuera del absoluto | No (conocimiento científico especializado) |

## Cultivo: arroz

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Ciclo del arroz Tinajones ⚑ | `rice_tinajones.json · morropon.rotationCrops` | 150 (114 efectivos) | días | **A** | SENAMHI Morropón 2026: 114 días a maduración córnea (una temporada) | Reparto en etapas = estimación | Una sola temporada y variedad | Duración, agua, calor, suelo desnudo | Sí, opcional en modo Precisa |
| Temperaturas y duración (EcoCrop) | `crops.json eco` | tmin 10 · óptimo 20–30 · tmax 36 | °C | **B** | FAO EcoCrop (Oryza sativa) | Tasa de desarrollo trapezoidal | Rangos de la especie, no de la variedad | Duración y viabilidad térmica | No (conocimiento científico especializado) |
| Requiere riego | `crops.json regime` | irrigated_required | — | **B** | Requisito del cultivo (inundación; EcoCrop 1000–4000 mm) | Sin riego declarado: inviable | Baja | Viabilidad sin riego | No (conocimiento científico especializado) |
| Cobertura, biomasa, N, costo, encharcamiento | `crops.json` | 0.8 · 0.6 · -1 · 3 · 0 | ordinales | **E** | Criterio del equipo, sin fuente | Escalas 0–1, −2…+2, 1–3 | No cuantificada | Erosión y nitrógeno; el costo ordinal ya NO puntúa en v2 | No (conocimiento científico especializado) |

## Cultivo: Loctao

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Ciclo del Loctao ⚑ | `crops.json · engine2.PARAMS.loctao_cycle_days` | 59 (rango 59–90) | días | **E** | 54 d observados (SENAMHI 2024, emergencia→maduración) + 5 d estimados; 75–90 d en prensa sin base de conteo | Se propagan 59, 75 y 90 d salvo ciclo declarado | Alta (54–90) | Agua, calor y suelo desnudo; cambia poco el ganador | Sí, opcional en modo Precisa |
| Kc del Loctao | `crops.json kc` | 0.4 / 1.05 / 0.5 | — | **B** | FAO-56 Tabla 12 («green gram, cowpeas») | Interpolación por etapas | Media: FAO agrupa mungo y caupí | Demanda de agua | No (conocimiento científico especializado) |
| Temperaturas y duración (EcoCrop) | `crops.json eco` | tmin 8 · óptimo 21–36 · tmax 40 | °C | **B** | FAO EcoCrop (Vigna radiata) | Tasa de desarrollo trapezoidal | Una guía de Sudáfrica da óptimo 27–30 °C | Duración y viabilidad térmica | No (conocimiento científico especializado) |
| Evidencia local por campaña | `crops.json local_evidence` | documentada en la chica | — | **A** | SENAMHI Morropón 2024 (emergencia 22-jul) y 200 ha instaladas (2025) | La grande se evalúa por condiciones y se marca «sin evidencia local directa» | Una temporada | Marca condicionada; desempate | No (conocimiento científico especializado) |
| Cobertura, biomasa, N (fijación), costo, encharcamiento | `crops.json · engine2.PARAMS.n_ordinal` | 0.6 · 0.4 · 0.5 · 1 · 0.8 | ordinales | **E** | Criterio del equipo; fijación de N típica 26–42 kg/ha (CSIRO/GRDC, fuera de Piura) | Escalas ordinales, sin cantidad | No cuantificada | Nitrógeno del suelo en el puntaje | No (conocimiento científico especializado) |
| Riesgos fitosanitarios | `—` | no investigados | — | **E** | Pendiente | No se puntúan | — | Ninguno (omitido, no inventado) | No (conocimiento científico especializado) |

## Viabilidad

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Fracción de escenarios para declarar inviable | `engine2.PARAMS.fail_inviable` | 0.8 | fracción | **E** | Metodológico; solo se aplica a límites DOCUMENTADOS | Sensibilidad 0,7–0,9 sin efecto | Baja | Inviable vs condicionada | No (conocimiento científico especializado) |
| Fracción de escenarios para declarar condicionada | `engine2.PARAMS.fail_conditional` | 0.1 | fracción | **E** | Metodológico | Por encima: condicionada | Media | Favorable vs condicionada | No (conocimiento científico especializado) |
| Ciclo completo (≥ 50 % de los años) y 90 % de alerta | `engine2.viability` | 0,5 / 0,9 | fracción | **E** | Regla heredada con tiempo térmico EcoCrop | Inviable si el ciclo no cabe en la ventana en la mayoría de los años | Media | Inviable por temperatura | No (conocimiento científico especializado) |
| Ventana de cada campaña | `morropon.SLOTS.window_days` | 165 | días | **E** | Diseño del equipo | Límite del ciclo y cálculo del suelo desnudo | No cuantificada | Suelo desnudo y erosión | No (conocimiento científico especializado) |
| Fechas de referencia de campaña ⚑ | `morropon.SLOTS` | 21 ene / 15 jul | fecha | **B** | SENAMHI 2026 (grande, observada) y 2024 (chica: 8 224 ha en jul–ago; Loctao 22-jul) | Inicio de cada ventana; no es un calendario fijo | Cambian con el año y el agua del canal | Clima de cada campaña | Sí, opcional en modo Precisa |

## Comparación (ranking)

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Penalización por repetir cultivo / familia ⚑ | `engine2.PARAMS.rot_same_crop · engine2.PARAMS.rot_same_family` | 0.45 / 0.3 | puntos | **E** | Supuesto del equipo; sin cuantificación | Resta del puntaje de rotación | Alta | Favorece alternar; cambia el ganador con ×0 o ×2 | No (conocimiento científico especializado) |
| Reparto de cada prioridad entre criterios | `engine2.scoreSeq` | agua 50/50 · suelo 40/40/20 | fracción | **E** | Diseño del equipo (evita contar dos veces un beneficio) | Cada prioridad se reparte y se renormaliza | Media | Pesos del puntaje | No (conocimiento científico especializado) |
| Normalizaciones de criterios | `engine2.scoreSeq` | calor/0,25 · erosión/0,5 · N (n+2)/4 | — | **E** | Diseño del equipo | Escalas a 0–1 | No cuantificada | Puntaje de calor, erosión y N | No (conocimiento científico especializado) |
| Fórmula de erosión | `engine2.campaignOn` | (0,3+0,7·pend/30)(0,3+0,7·lluvia≥20 mm/120)(1−cobertura) | — | **E** | Forma multiplicativa ad hoc del motor original | Riesgo relativo, no pérdida de suelo | No cuantificada | Criterio de erosión | No (conocimiento científico especializado) |
| Margen de desempate por evidencia local | `engine2.PARAMS.tie_margin` | 1 | puntos | **E** | Metodológico | Preferir la secuencia más documentada si la diferencia es menor | No aplica | Orden entre secuencias casi iguales | No (conocimiento científico especializado) |
| Sensibilidad Monte Carlo | `engine2.run` | 300 sorteos · σ pesos 0,35 · N ±0,5 | — | **E** | Diseño del equipo (semilla fija) | Mide la estabilidad del ranking; no es validación | No aplica | Veredictos «claramente preferible», «equivalentes» | No (conocimiento científico especializado) |

## Economía

| Parámetro | Dónde | Valor actual | Unidad | Cat. | Fuente y justificación | Método | Incertidumbre | Efecto en la recomendación | ¿Lo da el agricultor? |
|---|---|---|---|---|---|---|---|---|---|
| Valor económico por defecto | `engine2.run` | ninguno | — | **C** | Solo lo declarado | Sin datos completos no hay criterio económico; costo ordinal retirado del puntaje | — | Ningún valor ficticio entra al puntaje | Sí, opcional en modo Precisa |

⚑ = parámetro que puede cambiar la recomendación según las pruebas de sensibilidad (`docs/COMPARACION_MOTORES.md`, `docs/PRECISA_SENSIBILIDAD.md`).

## Valores hipotéticos encontrados (categoría E) y decisión

| Parámetro | Valor | ¿Decisivo? | Decisión |
|---|---|---|---|
| ETa/ETc mínimo (riesgo hídrico alto) | 0.5 | sí | Se conserva como RANGO propagado y se marca el resultado como sensible a supuestos; no se presenta como hecho |
| ETa/ETc de alerta | 0.8 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Factor de riego en el motor original (×0,3 sobre el riesgo de sequía) | 0,3 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Inicialización del balance hídrico | 45 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Umbral de calor del Loctao | 35 (rango 32–38) | sí | Se conserva como RANGO propagado y se marca el resultado como sensible a supuestos; no se presenta como hecho |
| Umbral de calor del arroz | 35 (rango 33–37) | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Umbral de alerta de calor | 0.25 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Pendiente de riesgo (cobertura baja) | 25 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Pendiente que bloquea el análisis | > 50 % | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Pendiente máxima del arroz inundado | desactivada | no | No se usa (omitido, no inventado) |
| Cobertura, biomasa, N, costo, encharcamiento | 0.8 · 0.6 · -1 · 3 · 0 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Ciclo del Loctao | 59 (rango 59–90) | sí | Se conserva como RANGO propagado y se marca el resultado como sensible a supuestos; no se presenta como hecho |
| Cobertura, biomasa, N (fijación), costo, encharcamiento | 0.6 · 0.4 · 0.5 · 1 · 0.8 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Riesgos fitosanitarios | no investigados | no | No se usa (omitido, no inventado) |
| Fracción de escenarios para declarar inviable | 0.8 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Fracción de escenarios para declarar condicionada | 0.1 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Ciclo completo (≥ 50 % de los años) y 90 % de alerta | 0,5 / 0,9 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Ventana de cada campaña | 165 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Penalización por repetir cultivo / familia | 0.45 / 0.3 | sí | Se conserva como RANGO propagado y se marca el resultado como sensible a supuestos; no se presenta como hecho |
| Reparto de cada prioridad entre criterios | agua 50/50 · suelo 40/40/20 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Normalizaciones de criterios | calor/0,25 · erosión/0,5 · N (n+2)/4 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Fórmula de erosión | (0,3+0,7·pend/30)(0,3+0,7·lluvia≥20 mm/120)(1−cobertura) | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Margen de desempate por evidencia local | 1 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |
| Sensibilidad Monte Carlo | 300 sorteos · σ pesos 0,35 · N ±0,5 | no | Se conserva como criterio metodológico declarado; no excluye por sí solo |

## Parámetros trasladados al modo Precisa (opcionales)

- **Agua por campaña** (supply_m3_ha): Cobertura hídrica; riesgo hídrico alto si no cubre.
- **Pérdida por filtración del arroz** (percolation_declared): Demanda de riego del arroz.
- **Textura del suelo** (soil_texture): Percolación del arroz, agua útil, aptitud de suelo.
- **pH medido** (soil_ph_declared): Aptitud de suelo y límite absoluto de la especie.
- **Fecha prevista de siembra (1.ª campaña)** (first_sowing_date): Clima, agua y calor de esa ventana.
- **Ciclo observado (arroz / Loctao)** (cycle_days): Duración, agua, calor, suelo desnudo.
- **Cultivo principal a conservar** (keep_main): Restringe el conjunto de secuencias.
- **Rendimiento, precio y costos** (economics): Criterio económico del puntaje.
- **Prioridades (suelo, agua, calor, plagas, ingreso, costo)** (priorities): Pesos del puntaje.
- **Percolación del arroz (referencia)** (rice_perc): Demanda de riego del arroz (≈ ±350 mm); con agua limitada cambia el ganador.
- **Capacidad de agua útil del suelo** (awc): Balance hídrico del cultivo.
- **pH, arcilla y arena** (soilgrids): Aptitud de suelo; encharcamiento; agua útil.
- **Ciclo del arroz Tinajones** (rice_cycle): Duración, agua, calor, suelo desnudo.
- **Ciclo del Loctao** (loctao_cycle): Agua, calor y suelo desnudo; cambia poco el ganador.
- **Fechas de referencia de campaña** (slots): Clima de cada campaña.
- **Valor económico por defecto** (econ_none): Ningún valor ficticio entra al puntaje.

## Parámetros científicos que NO se piden al agricultor

Se mantienen como valores bibliográficos, estimaciones explícitas o rangos propagados:

- Saturación inicial / preparación de suelo (arroz) — cat. B
- ETc por etapas (Kc) — cat. B
- Profundidad radicular y agotamiento permisible — cat. B
- ETa/ETc mínimo (riesgo hídrico alto) — cat. E ⚑
- ETa/ETc de alerta — cat. E
- Factor de riego en el motor original (×0,3 sobre el riesgo de sequía) — cat. E
- Fuentes de lluvia y sus pesos — cat. D ⚑
- Temperatura corregida — cat. D ⚑
- Incertidumbre térmica (±δ) — cat. D
- ET0 Penman-Monteith y piso de viento — cat. B
- Inicialización del balance hídrico — cat. E
- Umbral de calor del Loctao — cat. E ⚑
- Umbral de calor del arroz — cat. E
- Umbral de alerta de calor — cat. E
- Pendiente de riesgo (cobertura baja) — cat. E
- Pendiente que bloquea el análisis — cat. E
- Pendiente máxima del arroz inundado — cat. E
- Rango óptimo y absoluto de pH — cat. B
- Temperaturas y duración (EcoCrop) — cat. B
- Requiere riego — cat. B
- Cobertura, biomasa, N, costo, encharcamiento — cat. E
- Kc del Loctao — cat. B
- Temperaturas y duración (EcoCrop) — cat. B
- Evidencia local por campaña — cat. A
- Cobertura, biomasa, N (fijación), costo, encharcamiento — cat. E
- Riesgos fitosanitarios — cat. E
- Fracción de escenarios para declarar inviable — cat. E
- Fracción de escenarios para declarar condicionada — cat. E
- Ciclo completo (≥ 50 % de los años) y 90 % de alerta — cat. E
- Ventana de cada campaña — cat. E
- Penalización por repetir cultivo / familia — cat. E ⚑
- Reparto de cada prioridad entre criterios — cat. E
- Normalizaciones de criterios — cat. E
- Fórmula de erosión — cat. E
- Margen de desempate por evidencia local — cat. E
- Sensibilidad Monte Carlo — cat. E
