# Validación del modelo con las referencias disponibles

Generado por `node scripts/backtest.js` (2026-11-15). Reproducible; los datos de 2026 están en `data/validation/`.
> **Lectura rápida.** **Temperatura:** el modelo trae un sesgo grande (Tmáx +5.1 °C). Tras corregirlo con datos locales y probarlo con validación cruzada, el error es RMSE 1.3 °C (Tmedia); supera a una línea base constante en 0 de 3 variables, es decir, **no mejora la predicción de la variación de la temperatura** respecto a un valor fijo (referencia de solo 11 valores). **Fenología:** en la campaña con que se calibró coincide, pero es circular. Fuera de muestra el error medio es de 14.0 días (n = 3, variedades distintas). **Orden de fechas y rotación:** no pueden evaluarse (no hay rendimientos ni resultados de campaña) y el índice casi no discrimina entre fechas.


## 0. Qué se evalúa y qué no

| Salida del modelo | Referencia | ¿Evaluable? |
|---|---|---|
| Temperatura | 11 valores SENAMHI Morropón 2026 | Sí (validación cruzada) |
| Fenología, Morropón | SENAMHI 2026 (la usada para calibrar) | Solo **circular** |
| Fenología, otras estaciones | SENAMHI costa norte 2026 | Sí, fuera de muestra (n pequeño) |
| Ciclo del cultivo | NDVI Sentinel‑2 en la estación | Orientativo (un píxel) |
| Lluvia | 11 fechas SENAMHI (casi todo 0 mm) | Muy débil |
| Orden de fechas / rotación | — | **No**: sin rendimientos ni verdad de campo |

## 1. Temperatura (Morropón, 11 valores SENAMHI, clima real de 2026)

Error = modelo − SENAMHI (°C). Se compara la media de ±3 días de NASA POWER 2026, con corrección de altitud estándar. *Validación cruzada*: el sesgo se estima con 10 valores y se prueba en el que queda fuera (no circular). *Línea base*: predecir con la media de los otros valores.

| Variable | Sin corrección de altitud (sesgo / RMSE) | Con altitud, sin corregir (sesgo / RMSE) | **Con corrección local, validación cruzada** (sesgo / RMSE) | Línea base constante (RMSE) |
|---|---|---|---|---|
| Tmedia | -3.6 / 3.8 | +2.3 / 2.6 | **+0.0 / 1.3** | 1.0 |
| Tmáx | -0.8 / 2.5 | +5.1 / 5.7 | **-0.0 / 2.7** | 2.1 |
| Tmín | -3.9 / 4.1 | +2.0 / 2.2 | **-0.0 / 1.2** | 0.9 |

Rango del desplazamiento estimado entre pliegues (estabilidad): Tmedia 2.0 a 2.5 °C · Tmáx 4.5 a 5.5 °C · Tmín 1.8 a 2.2 °C.

**Lectura.** Sin corregir, la temperatura modelada queda sesgada (Tmáx +5.1 °C). Tras la corrección local el error en la validación cruzada es RMSE 1.3 °C (Tmedia), 2.7 °C (Tmáx) y 1.2 °C (Tmín). NO supera a la línea base constante en Tmedia (1.0 °C), no supera en Tmáx (2.1 °C) y no supera en Tmín (0.9 °C). Con 11 valores de una temporada y agregación desconocida de SENAMHI (¿día, década?), esto es **orientativo**.

## 2. Fenología

### 2a. Morropón (en muestra: **circular**)

Siembra 21‑ene‑2026, ciclo de Tinajones calibrado con estas mismas fechas, clima real de 2026 con corrección térmica local. Solo comprueba que el tiempo térmico no desordena las fases:

| Fase | Observada (días) | Modelo (días) | Error |
|---|---:|---:|---:|
| Emergencia | 5 | 5 | 0.0 |
| Plántula | 24 | 24 | 0.0 |
| Macollaje | 33 | 33 | 0.0 |
| Elongación del tallo | 64 | 64 | 0.0 |
| Panoja | 79 | 79 | 0.0 |
| Desarrollo de panoja | 86 | 86 | 0.0 |
| Floración | 93 | 93 | 0.0 |
| Maduración lechosa | 102 | 102 | 0.0 |
| Maduración pastosa | 107 | 107 | 0.0 |
| Maduración córnea | 114 | 114 | 0.0 |

MAE 0.0 días (n = 10). **No es validación**: el ciclo se ajustó a estos datos.

### 2b. Otras estaciones (fuera de muestra)

Se aplica el ciclo de Tinajones (calibrado en Morropón) a otros sitios con su clima de 2026. Solo se comparan fases **equivalentes** (inicio/desarrollo de panoja). Variedades distintas: el desacuerdo es esperable.

| Estación | Variedad | Siembra | Fase observada | Observado (días) | Modelo (días) | Error |
|---|---|---|---|---:|---:|---:|
| Partidor (Piura) | Ferón | 2025-12-20 | Inicio de panoja | 74 | 80 | +6.0 |
| Lambayeque | El Valor | 2025-11-27 | Inicio de panoja | 94 | 79 | -15.0 |
| Talla (La Libertad) | El Valor | 2025-11-22 | Desarrollo de panoja | 107 | 86 | -21.0 |

**Fuera de muestra: MAE 14.0 días, sesgo -10.0 días (n = 3).** Con n = 3 y variedades distintas no se puede concluir el error «real»; sí muestra que **un ciclo único de Tinajones no sirve para otras variedades** (en el modo Precisa se recalibra con las fechas del agricultor).

## 3. NDVI Sentinel‑2 frente a la fenología modelada (Morropón, un píxel)

- Observaciones válidas: 20. Patrón: **estacional** (NDVI p10–p90: 0.24–0.76).
- Pico de NDVI: **2026-05-05** (0.819). Ventana esperada de pico (panoja–floración): 2026-04-10 a 2026-04-24 → el pico quedó **11 días después** del final de la ventana.
- Mínimo de NDVI previo al cultivo: 2026-02-04 (0.124), a 14 días de la siembra observada (21‑ene).
- **Límites:** un píxel de 10 m en la coordenada de la estación puede no ser el campo observado; en Piura casi toda la vegetación sigue las lluvias; el pico de NDVI no coincide exactamente con la floración. Es consistencia cualitativa, no medida de error.

## 4. Lluvia

Lluvia anual media por fuente en Morropón (2015–2023): IMERG 623 mm · ERA5 908 mm · POWER 336 mm. Las fuentes discrepan mucho entre sí, y **no hay pluviómetro local** para saber cuál acierta.

Contraste débil con los valores de lluvia diaria que SENAMHI reporta en las fechas de cada fase (NASA POWER 2026):

| Fase | Fecha | SENAMHI (mm) | POWER (mm) |
|---|---|---:|---:|
| Siembra | 2026-01-21 | 0.0 | 0.4 |
| Emergencia | 2026-01-26 | 1.2 | 0.1 |
| Plántula | 2026-02-14 | 1.4 | 1.1 |
| Macollaje | 2026-02-23 | 3.5 | 10.1 |
| Elongación del tallo | 2026-03-26 | 0.0 | 0.1 |
| Panoja | 2026-04-10 | 0.0 | 0.0 |
| Desarrollo de panoja | 2026-04-17 | 0.0 | 1.9 |
| Floración | 2026-04-24 | 0.0 | 0.0 |
| Maduración lechosa | 2026-05-03 | 0.0 | 0.3 |
| Maduración pastosa | 2026-05-08 | 0.0 | 0.0 |
| Maduración córnea | 2026-05-15 | 0.0 | 0.0 |

Solo 3 de 11 fechas tienen lluvia reportada, así que **no permite estimar el error de lluvia**. En esas fechas, SENAMHI vs POWER: Emergencia (1.2 vs 0.1 mm); Plántula (1.4 vs 1.1 mm); Macollaje (3.5 vs 10.1 mm).

## 5. Orden de fechas de siembra y rotación

- **No evaluables**: no hay rendimientos, resultados de campaña ni fechas «óptimas» verificadas.
- **Poder de discriminación:** de las 37 fechas de siembra evaluadas, 31 quedan «sin impedimento térmico» y el índice varía solo entre 92.4 y 100 de 100. Acertar la fecha real de siembra de los 5 puntos de SENAMHI (22‑nov a 25‑ene) **no demuestra nada**: casi cualquier fecha pasa.
- La rotación se decide sobre todo por reglas de alternancia (con dos cultivos) y escalas ordinales provisionales.

## 6. Conclusión honesta

| Componente | Resultado | Confianza |
|---|---|---|
| Temperatura corregida localmente | RMSE 1.3 °C (Tmedia) en validación cruzada | Baja‑media (11 valores, una temporada) |
| Fenología en la campaña de calibración | Circular | No cuenta como validación |
| Fenología en otras estaciones | MAE 14.0 días (n = 3) | Baja: variedades distintas |
| Ciclo vs NDVI | Consistente en forma, pico algo tardío | Cualitativa |
| Lluvia | No evaluable | — |
| Orden de fechas y rotación | No evaluable | — |

**Qué haría falta para medir de verdad:** (1) varias campañas observadas por parcela (fechas de fases y cosecha) de agricultores de Morropón; (2) pluviómetro y temperatura locales (SENAMHI diaria); (3) rendimientos y dotación real de riego; (4) revisión de un agrónomo local. El modo Precisa del proyecto está pensado para recoger justamente esos datos.
