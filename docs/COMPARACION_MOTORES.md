# Comparación de motores y sensibilidad

> Generado por `node scripts/comparar_motores.js`. Punto: estación de referencia (-5.19, -79.99). Los puntajes de motores distintos NO son comparables entre sí; se comparan las secuencias ganadoras y sus condiciones.

## A. Antes y después (centro, riego declarado salvo indicación)

| Escenario | v1 original (frijol común, temp. heredada) | v1 con temp. calibrada | v2 (arroz + Loctao) |
|---|---|---|---|
| inicio grande · hist. arroz–arroz | FAFA 65.5 / FFAF 62.5 · actual 53.9 | FAFA 65.1 / FFAF 62.6 · actual 53.1 | LLAL 61 / LALA 59.4 · actual 34 |
| inicio chica · hist. arroz–arroz | FAFA 65.4 / FFAF 62.6 · actual 53.9 | FAFA 65.6 / FFAF 62.4 · actual 53.1 | LALA 69.5 / LLAL 55.9 · actual 34 |
| inicio grande · hist. arroz–{leg} | FAFA 60 / AFFA 59.9 · actual 65.4 | AFFA 59.9 / FAFA 59.6 · actual 65.6 | LLLL 54.9 / ALLA 53.2 · actual 69.5 |
| inicio grande · sin riego | sin alternativa · actual 41.8 | sin alternativa · actual 41 | sin alternativa (no viable) · actual 35.2 |
| inicio grande · 12 000 m³/ha | FAFA 65.5 / FFAF 62.5 · actual 53.9 | FAFA 65.1 / FFAF 62.6 · actual 53.1 | LLLL 56 / LLAL 64.4 · actual 43.7 |
| inicio grande · 6 000 m³/ha | FAFA 65.5 / FFAF 62.5 · actual 53.9 | FAFA 65.1 / FFAF 62.6 · actual 53.1 | LLLL 56 / LLAL 62.3 · actual 35.2 |

(A = arroz, F = frijol común, L = frijol Loctao.) El motor v1 con la temperatura calibrada ya no encuentra alternativas con frijol común en la campaña grande: con la temperatura corregida el frijol común no completa su ciclo allí (coherente con que no sea el frijol local).

## B. Sensibilidad del motor v2 (centro, inicio grande, historial arroz–arroz)

### Agua disponible por campaña

| Dotación | Viabilidad (A=arroz, L=Loctao; g=grande, c=chica) | Mejor alternativa | Necesidad de riego del arroz (chica) |
|---|---|---|---|
| secano | Arroz: grande inviable, chica inviable · Loctao: grande condicionada, chica condicionada | sin alternativa | 1350 mm |
| 3000 m³/ha | Arroz: grande condicionada, chica condicionada · Loctao: grande favorable, chica favorable | LLLL (56) | 1350 mm |
| 6000 m³/ha | Arroz: grande condicionada, chica condicionada · Loctao: grande favorable, chica favorable | LLLL (56) | 1350 mm |
| 9000 m³/ha | Arroz: grande condicionada, chica condicionada · Loctao: grande favorable, chica favorable | LLLL (56) | 1350 mm |
| 12000 m³/ha | Arroz: grande condicionada, chica condicionada · Loctao: grande favorable, chica favorable | LLLL (56) | 1350 mm |
| 15000 m³/ha | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LALA (66) | 1350 mm |

### Temperatura (escenarios y desplazamientos)

| Escenario | Viabilidad | Mejor alternativa |
|---|---|---|
| base | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61) |
| +1 °C | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61) |
| +2 °C | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61.2) |
| +3 °C | Arroz: grande condicionada, chica favorable · Loctao: grande favorable, chica favorable | LALA (59.3) |
| −1 °C | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61) |
| −2 °C | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61) |

### Escenarios de lluvia

| Escenario | Viabilidad | Mejor alternativa |
|---|---|---|
| Hipotético seco: lluvia −20 %, +1,5 °C | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61.1) |
| Hipotético lluvioso: lluvia +15 % | Arroz: grande favorable, chica favorable · Loctao: grande favorable, chica favorable | LLAL (61) |

### Ciclo del Loctao (incertidumbre abierta 54–90 d)

| Ciclo (días) | Loctao: grande / chica | Mejor alternativa |
|---|---|---|
| 59 | favorable (75 d) / favorable (75 d) | LLAL (61) |
| 75 | favorable (75 d) / favorable (75 d) | LLAL (60.6) |
| 90 | favorable (75 d) / favorable (75 d) | LALA (60.3) |

### Umbral de calor del Loctao (hipótesis)

| Umbral (°C) | Calor etapa media: grande / chica | Mejor alternativa |
|---|---|---|
| 32 | 0.31 / 0.19 | LALA (49.2) |
| 35 | 0.31 / 0.19 | LLAL (61) |
| 38 | 0.31 / 0.19 | LALA (69.7) |
| 40 | 0.31 / 0.19 | LALA (70.1) |

### Percolación del arroz (FAO 2–8 mm/d; 5 central)

| Percolación | Demanda del arroz grande / chica (mm) | Mejor alternativa con 9 000 m³/ha |
|---|---|---|
| 2 mm/d | 722 / 1008 | ALAL (64.2) |
| 5 mm/d | 1067 / 1350 | LLLL (56) |
| 8 mm/d | 1412 / 1692 | LLLL (56.2) |

### Fuente de lluvia usada sola (el motor las combina con pesos de validación)

| Fuente | Demanda del arroz grande (mm) | Mejor alternativa con 9 000 m³/ha | Mejor alternativa con 12 000 m³/ha |
|---|---|---|---|
| todas (pesos) | 1067 | LLLL (56) | LLLL (56) |
| imerg | 1067 | LLLL (56) | LLLL (56) |
| era5 | 967 | LLLL (55.8) | ALAL (64.5) |
| power | 1143 | LLLL (56.3) | LLLL (56.3) |

### Historial y prioridades

| Variante | Mejor alternativa |
|---|---|
| hist. arroz–arroz | LLAL (61) |
| hist. arroz–Loctao | LLLL (54.9) |
| hist. Loctao–arroz | LLAL (61) |
| prioridad agua = 5 | LLAL (62.6) |
| prioridad suelo = 5 | LLAL (62.4) |
| prioridad plagas = 5 | LALA (62.3) |
| prioridad calor = 5 | ALAL (60.8) |
| conservar arroz en la grande | ALAL (58.3) |

## C. Ubicación: qué cambia realmente entre parcelas de Morropón

| Punto | Altitud | Pendiente | pH | Fuente de lluvia principal | Soporte | Arroz grande/chica: necesidad de riego | Mejor alternativa |
|---|---|---|---|---|---|---|---|
| Centro (estación) | 118 m | 0.9 % | 7.35 | imerg | limitada | 1067 / 1350 mm | LLAL (61) |
| Zona llana (noroeste) | 108 m | 0.2 % | 7.28 | era5 | limitada | 1141 / 1343 mm | LLAL (60.8) |
| Pendiente moderada (suroeste) | 143 m | 13.4 % | 7.38 | era5 | limitada | 1242 / 1391 mm | LLAL (60.1) |
| Piedemonte (este) | 600 m | 54 % | 6.68 | era5 | no_recomendable (Pendiente 54 %: el modelo (cultivos anuales) no es adecuado;…) | — | no se recomienda |
| Zona de mayor altitud (noreste) | 828 m | 61.5 % | 6.6 | era5 | no_recomendable (Pendiente 62 %: el modelo (cultivos anuales) no es adecuado;…) | — | no se recomienda |

Las ubicaciones con pendiente > 50 % se marcan «no recomendable» antes de correr el motor; fuera del centro no hay serie IMERG descargada (se usa ERA5 con aviso hasta completar la descarga).
