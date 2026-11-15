# Validación de POWER, ERA5 e IMERG frente a SENAMHI Morropón

> Generado por `node scripts/validate_sources_senamhi.js` a partir de `data/senamhi/morropon_daily.csv` y `data/validation/historic/`. Resultados completos en `data/validation/senamhi_sources.json`.

## Alcance y límites

- **Periodo comparado: 2001-01-01 → 2014-06-30.** La serie SENAMHI termina el 2014-06-30, de modo que **no valida 2015–2023**, el periodo de la climatología que usa el motor. Lo que se valida es el comportamiento de cada producto frente a una estación real en 13,5 años, y se asume (hipótesis) que sus sesgos son estables entre periodos.
- Fuentes: power, era5, imerg (IMERG: años 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014).
- Punto de las fuentes = referencia del proyecto (-5.19, -79.99); las coordenadas de la estación no constan en el TXT. ERA5 usa su celda más cercana (≈0.25°); IMERG un cuadro de 0.1°; POWER una celda de 0.5°×0.625°: **se compara una estación puntual con promedios de área**.
- Solo pares de fechas compatibles. Partición temporal: bloque A = 2001–2007, bloque B = 2008–jun 2014; cada corrección se calibra en un bloque y se valida en el otro, en ambos sentidos.

## Precipitación

### Totales mensuales (meses válidos de SENAMHI; suma sobre días con dato en ambas series)

| Fuente | Meses | Obs. total (mm) | Fuente total (mm) | Sesgo | RMSE mensual (mm) | MAE (mm) | r |
|---|---|---|---|---|---|---|---|
| power | 161 | 6502 | 3480 | -46 % | 85.0 | 35.5 | 0.75 |
| era5 | 161 | 6502 | 15272 | 135 % | 108.9 | 58.5 | 0.86 |
| imerg | 161 | 6501 | 7637 | 17 % | 49.0 | 28.2 | 0.89 |

### Diario (todos los pares válidos)

| Fuente | n | Sesgo (mm/d) | RMSE (mm/d) | r | POD ≥1 mm | FAR ≥1 mm | POD ≥20 mm | FAR ≥20 mm | Mejor desfase (r) |
|---|---|---|---|---|---|---|---|---|---|
| power | 4898 | -0.62 | 7.00 | 0.45 | 0.57 | 0.67 | 0.03 (3/90) | 0.40 | 0 d (0.45) |
| era5 | 4898 | 1.79 | 8.90 | 0.46 | 0.89 | 0.75 | 0.48 (43/90) | 0.73 | 1 d (0.49) |
| imerg | 4891 | 0.23 | 7.74 | 0.40 | 0.62 | 0.68 | 0.32 (29/90) | 0.66 | 1 d (0.59) |

### Temporada de lluvias (ene–abr) por año

| Fuente | Años | Sesgo (mm) | RMSE (mm) | r |
|---|---|---|---|---|
| power | 14 | -288 | 423 | 0.66 |
| era5 | 14 | 503 | 574 | 0.87 |
| imerg | 14 | -39 | 140 | 0.97 |

### Cociente fuente/observado por mes del año (solo meses con >5 mm observados)

| Mes | power | era5 | imerg |
|---|---|---|---|
| ene | 0.57 | 2.96 | 0.98 |
| feb | 0.32 | 1.68 | 0.72 |
| mar | 0.30 | 2.27 | 0.87 |
| abr | 0.48 | 2.24 | 1.48 |
| may | 4.48 | 11.91 | 8.28 |
| jun | 13.71 | 6.34 | 17.78 |
| jul | — | — | — |
| ago | — | — | — |
| sep | — | — | — |
| oct | 3.70 | 6.03 | 7.23 |
| nov | 4.84 | 10.50 | 6.61 |
| dic | 5.19 | 9.63 | 7.10 |

### Correcciones de sesgo validadas fuera de muestra (RMSE mensual, mm)

| Fuente | Sentido | Sin corregir | Factor mensual | Factor global | Climatología obs. | ¿Mejora (mensual)? | ¿Mejora (global)? |
|---|---|---|---|---|---|---|---|
| power | A->B | 105.1 | 75 | 93.2 | 100.6 | sí | sí |
| power | B->A | 61 | 69.8 | 52.6 | 69.3 | no | sí |
| era5 | A->B | 96.8 | 74.1 | 78.2 | 100.6 | sí | sí |
| era5 | B->A | 119 | 35.1 | 29.9 | 69.3 | sí | sí |
| imerg | A->B | 56.7 | 46.9 | 64.4 | 100.6 | sí | no |
| imerg | B->A | 40.7 | 36.5 | 41.4 | 69.3 | sí | no |

### ¿Hay una fuente claramente mejor? (bootstrap por años sobre la diferencia de RMSE mensual)

| A | B | Meses | RMSE(A)−RMSE(B) mediana (mm) | IC95 % | Ganador confiable |
|---|---|---|---|---|---|
| power | era5 | 161 | -24 | -63.1 a 13.2 | **ninguno** |
| power | imerg | 161 | 35.6 | 12.1 a 56.2 | imerg |
| era5 | imerg | 161 | 58.8 | 31.8 a 91.5 | imerg |

### Sensibilidad a la regla de meses válidos (RMSE mensual, mm)

| Fuente | 5/3 | 10/5 | 15/10 |
|---|---|---|---|
| power | 85 (161 m) | 85 (161 m) | 85 (161 m) |
| era5 | 108.9 (161 m) | 108.9 (161 m) | 108.9 (161 m) |
| imerg | 49 (161 m) | 49 (161 m) | 49 (161 m) |

## Temperatura (diaria)

### Tmax

| Fuente | n | Sesgo (°C) | MAE | RMSE | r | Mejor corrección fuera de muestra (A→B / B→A) | Supera climatología sin corregir |
|---|---|---|---|---|---|---|---|
| power | 4897 | -1.01 | 2.66 | 3.29 | 0.06 | offset mensual: sí / sí (RMSE 3.36→2.46 / 3.22→2.43) | no / no (clim. 2.3 / 2.19) |
| era5 | 4897 | -4.37 | 4.44 | 4.83 | 0.57 | offset mensual: sí / sí (RMSE 5.06→2.01 / 4.6→1.88) | no / no (clim. 2.3 / 2.19) |

### Tmin

| Fuente | n | Sesgo (°C) | MAE | RMSE | r | Mejor corrección fuera de muestra (A→B / B→A) | Supera climatología sin corregir |
|---|---|---|---|---|---|---|---|
| power | 4898 | -2.19 | 2.58 | 3.10 | 0.56 | offset mensual: sí / sí (RMSE 3.04→1.45 / 3.16→1.45) | no / no (clim. 1.38 / 1.42) |
| era5 | 4898 | -0.40 | 1.10 | 1.37 | 0.87 | offset mensual: sí / sí (RMSE 1.28→1.26 / 1.45→1.27) | sí / no (clim. 1.38 / 1.42) |

### Tmedia (estimada en SENAMHI = (Tx+Tn)/2)

| Fuente | n | Sesgo (°C) | MAE | RMSE | r | Mejor corrección fuera de muestra (A→B / B→A) | Supera climatología sin corregir |
|---|---|---|---|---|---|---|---|
| power | 4897 | -3.04 | 3.17 | 3.67 | 0.20 | offset mensual: sí / sí (RMSE 3.72→1.35 / 3.62→1.39) | no / no (clim. 1.32 / 1.34) |
| era5 | 4897 | -2.87 | 2.89 | 3.11 | 0.81 | offset mensual: sí / sí (RMSE 3.12→1.12 / 3.1→1.11) | no / no (clim. 1.32 / 1.34) |

### Días por encima de umbral térmico (importante para el estrés por calor)

| Fuente | Variable | Umbral | Días observados | Días con la fuente (sobre días con dato) | POD | FAR |
|---|---|---|---|---|---|---|
| power | Tmax | >=32 | 2844 | 1660 | 0.35 | 0.39 |
| power | Tmax | >=35 | 522 | 46 | 0.01 | 0.87 |
| power | Tmin | >=22 | 1063 | 0 | 0.00 | — |
| power | Tmin | >=24 | 79 | 0 | 0.00 | — |
| era5 | Tmax | >=32 | 2844 | 35 | 0.01 | 0.00 |
| era5 | Tmax | >=35 | 522 | 0 | 0.00 | — |
| era5 | Tmin | >=22 | 1063 | 318 | 0.24 | 0.20 |
| era5 | Tmin | >=24 | 79 | 1 | 0.01 | 0.00 |

## Cómo leer este informe

- Un RMSE menor que el de la **climatología observada** significa que la fuente aporta información más allá del ciclo estacional; si no lo supera, su detalle diario no añade nada a un promedio mensual de la estación.
- Una corrección de sesgo solo se recomienda si mejora el error fuera de muestra en **ambos** sentidos de la partición.
- Un "ganador" solo se declara si el intervalo bootstrap de la diferencia de RMSE excluye el cero.
