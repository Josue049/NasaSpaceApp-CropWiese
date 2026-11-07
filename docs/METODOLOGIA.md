# Metodología

Etiquetas: **[H]** hecho verificado · **[C]** resultado calculado · **[Hip]** hipótesis · **[S]** supuesto operativo · **[PV]** pendiente de validación.

## 1. Qué es y qué no es

Un motor **explicable de reglas + evaluación multicriterio**. No usa aprendizaje automático: no existen datos de campo etiquetados para entrenarlo ni validarlo, y un modelo opaco no sería auditable. [S/decisión D-03]

Produce **índices relativos 0–100 para comparar secuencias**. No estima rendimientos, kg de N, ahorros de agua ni mejora de la salud del suelo. Los satélites **no miden** nitrógeno, materia orgánica ni fertilidad química; esos puntos se tratan con escalas ordinales declaradas como tales.

## 2. Flujo de cálculo

1. **Clima diario** (2015–2023): temperatura, humedad, radiación y viento de NASA POWER; lluvia de IMERG (primaria), ERA5 y POWER (controles).
2. **ET₀ diaria** FAO‑56 Penman‑Monteith (Allen et al., 1998, ec. 6). Viento acotado a u₂ ≥ 0,5 m/s (piso FAO-56) porque `WS2M` de POWER es muy bajo aquí (media 0,05; máx. 0,33 m/s) frente a ERA5 (≈0,78 m/s); sensibilidad en AUDITORIA.md §2. [C]
3. **Demanda del cultivo** ETc = Kc·ET₀ con curva de cuatro etapas (FAO‑56, valores típicos). [C]
4. **Balance hídrico diario de la zona radicular** (FAO‑56 cap. 8): agotamiento Dr, coeficiente de estrés Ks, ETa = Ks·ETc; el exceso sobre capacidad de campo se pierde. Capacidad de agua útil 110 mm/m (70 si arena ≥ 60 %, 120 si arcilla ≥ 40 %), profundidad radicular y fracción de agotamiento constantes por cultivo. Arranque con 45 días de barbecho (Kc 0,4). [C/S]
   *Se descartó la «lluvia efectiva USDA‑SCS»: descarta ~70 % de una lluvia de 200 mm/mes y exageraba la sequía en un clima húmedo (ver DECISIONES D‑06).*
5. **Índice hídrico** = 0,4·ETa/ETc(ciclo) + 0,6·ETa/ETc(etapa media); la etapa media pesa más por su sensibilidad (FAO‑33). Ponderación **provisional**. **Riesgo de sequía** = fracción de años con índice < 0,8. [C/PV]
6. Cada cultivo se evalúa sembrado al inicio de dos campañas fijas: **A** (1‑nov, ventana 165 d) y **B** (15‑abr, ventana 200 d). Secuencia = 4 campañas (2 años). [S]
7. **Temperatura y fenología (tiempo térmico).** La temperatura de POWER se corrige por altitud con −6,5 °C/km entre la elevación de la celda y la de la parcela (SRTM) [S, estimativo]. La tasa de desarrollo diaria r(T) es la trapezoidal de **FAO EcoCrop** (0 bajo TMIN y sobre TMAX; 1 en [TOPMN, TOPMX]; lineal entre medias; parámetros por **especie**, no por variedad). Un «día efectivo» es un día con r=1. El ciclo base de la base de cultivos (FAO‑56 Tabla 11 o provisional) se interpreta como **días efectivos** (supuesto: duración a temperatura óptima); la duración real es el número de días necesarios para acumularlos, y el Kc avanza con los días efectivos (el frío alarga las etapas). El cultivo **completa** el año si termina dentro de min(ventana de la campaña, EcoCrop GMAX). [S/C]
8. **Incertidumbre de temperatura δ** = √(1,9² + (1,5·|Δz|/1000)²) °C: 1,9 °C es el RMS de la diferencia entre POWER corregido y ERA5 en 6 sitios (`docs/evidence/temperatura_power_vs_era5.json`; mide discrepancia entre productos, no error frente a estaciones) y ±1,5 °C/km es una incertidumbre **asumida** del gradiente. δ se propaga evaluando cada cultivo y campaña con T−δ, T y T+δ (el desplazamiento afecta a la fenología, no a la ET₀).
9. **Cobertura de suelo.** Cobertura efectiva = mín(escala ordinal propia, cobertura media de dosel FAO‑56 ec. 76 calculada con Kc y la altura máxima de FAO‑56 Tabla 12). El ordinal nunca supera a la física.

## 3. Reglas eliminatorias (descalifican)

**No completa el ciclo** (con la temperatura estimada, en ≥50 % de los años, dentro de min(ventana, GMAX)) · **altitud > máximo EcoCrop** · cultivo con riego obligatorio (arroz) sin riego · ETa/ETc mediana < 0,5 en secano · pendiente > 25 % con cobertura < 0,5 · exclusión del agricultor · solanáceas consecutivas · mismo cultivo 3 campañas seguidas · más de una campaña de abono verde en cuatro (viabilidad económica). La estrategia **actual** del agricultor no se descalifica: se evalúa y se listan las reglas que incumple.

**Exclusión frente a penalización.** *Capacidad* (¿puede el cultivo completar su ciclo y recibir agua aquí?) = reglas eliminatorias. *Conveniencia* (rotación, N, mercado, costo) = puntaje. Un cultivo que completa su ciclo solo con T estimada pero no con T−δ **no se excluye**: pasa con aviso y penalización (criterio «Ajuste térmico», peso fijo de diseño ≈6 %: 0,5·fracción de años completos con T + 0,5·con T−δ).

## 4. Criterios que modifican la puntuación (0–1)

| Criterio | Cálculo | Naturaleza |
|---|---|---|
| Erosión | riesgo = (0,3+0,7·pendiente/30)·(0,3+0,7·lluvia intensa temprana/120 mm)·(1−cobertura efectiva); cobertura efectiva incluye periodo sin cultivo | índice; cobertura ordinal [PV] |
| Materia orgánica y N | 0,6·balance de N ordinal normalizado + 0,4·biomasa ordinal + bono de efecto precultivo leguminosa (+0,08, máx. 0,16) | **ordinal**, sin kg N/ha |
| Agua | mediana del índice hídrico | calculado |
| Resiliencia | 1 − (0,65·riesgo de sequía + 0,35·fracción de días de calor en etapa media) | calculado; riego ×0,3 [S] |
| Ajuste térmico | 0,5·fracción de años en que se completa el ciclo con T + 0,5·con T−δ | calculado; parámetros EcoCrop por especie |
| Plagas | 0,7 − 0,45 por repetir cultivo − 0,30 por repetir familia + 0,1 por familia adicional | regla agronómica |
| Mercado | preferencia declarada 1–5 (abono verde = 1) | declarado |
| Bajo costo | costo ordinal 1–3 | ordinal |
| Ajuste al suelo | ajuste de pH al rango del cultivo, penalización por arcilla > 40 % en cultivos sensibles al encharcamiento | SoilGrids (modelado) |

**Pesos** = prioridades del agricultor (0–5) normalizadas; el de erosión se multiplica por (1 + pendiente/30). **Provisionales, no calibrados.**

## 5. Robustez e incertidumbre

- **Entre productos de lluvia:** cada estrategia se puntúa con IMERG, ERA5 y POWER. La Alternativa A maximiza el ajuste con la fuente primaria; la B maximiza el **peor caso entre fuentes** (maximin) con ≥2 campañas distintas de A.
- **Incertidumbre combinada (400 sorteos, semilla fija):** en cada sorteo varían a la vez los pesos (log‑normal σ=0,35), las escalas ordinales de todos los cultivos (± medio paso), la fuente de lluvia y la temperatura (−δ, 0, +δ; sorteos en que un cultivo no completa el ciclo puntúan 0). Se reportan, para A vs actual, B vs actual y A vs B: probabilidad de ganar, diferencia mediana y rango 5–95 %, con un veredicto: **claramente preferible** (gana ≥90 % y |Δ mediana| ≥ 2 puntos), **probablemente preferible** (≥70 %), **prácticamente equivalentes** (|Δ mediana| < 2 puntos) o **indistinguibles**. Umbrales de diseño. La estabilidad **no es validación agronómica**.
- **Soporte por ubicación:** `no_recomendable` (altitud > 3200 m, celda POWER a > 1000 m de diferencia de altitud, pendiente > 50 %) → no se generan estrategias; `limitada` (dominio fuera de Perú, diferencia de celda > 300 m, pendiente > 25 %, fuentes de lluvia con razón > 1,5, sin IMERG, sin suelo) → se recomienda con advertencias; `aceptable` = sin limitación conocida, **no** significa validado. Umbrales de diseño.
- **Ventanas de siembra:** inicio cada 15 días; viable / marginal / no viable según años en que se completa el ciclo (con T−δ) y suficiencia hídrica.
- **Confianza por criterio:** agua y resiliencia dependen del desacuerdo entre fuentes (>0,25 baja; >0,12 media); los criterios ordinales se declaran de confianza baja; mercado, declarado.
- **Escenarios hipotéticos** (lluvia −20 %/+15 %, +1,5/+2 °C con humedad relativa constante): ejercicios de sensibilidad, **no pronósticos**.

## 6. Validación (estado)

| Nivel | Hecho | Pendiente |
|---|---|---|
| Software | 39 pruebas: ET₀, Kc, balance hídrico, tiempo térmico, exclusión por altitud/temperatura, soporte por ubicación, invariantes sobre una rejilla de 48 condiciones, determinismo, datos ausentes, API | Pruebas de interfaz automatizadas |
| Datos | Validación cruzada IMERG/ERA5/POWER (`DATA_VALIDATION.md`), contraste parcial con 2 estaciones GHCN lejanas (`AUDITORIA.md` §3), temperatura POWER vs ERA5 | Pluviómetro local (SENAMHI, descarga manual) [PV] |
| Agronómica | — | **Revisión de la base de cultivos y reglas por agrónomo local; ensayos de campo** [PV] |

Una recomendación calculada **no** es eficacia agronómica demostrada.
