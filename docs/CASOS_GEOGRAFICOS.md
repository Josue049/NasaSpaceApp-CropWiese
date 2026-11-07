# Matriz geográfica (generada por `node scripts/geo_matrix.js`)

Comportamiento del motor en 13 sitios contrastantes (historial maíz→frijol, secano, prioridades neutras, campaña A). **No es validación agronómica**: muestra dónde el sistema recomienda, advierte o se niega a recomendar. Elevación y pendiente: SRTM (OpenTopoData); Δceldas = elevación del sitio − elevación de la celda POWER. Lluvia anual por fuente: I = IMERG V07, E = ERA5, P = POWER (mm). T = temperatura media anual de POWER corregida por altitud.

| Sitio | Elevación m | Pendiente % | T °C | Lluvia anual (mm) | Soporte | Cultivos viables | Alternativa A |
|---|---|---|---|---|---|---|---|
| Moyobamba (urbano, plano) | 878 (Δceldas -106) | 0.8 | 23.2 | I1407 / E1505 / P943 | limitada | Maíz, Frijol, Frijol, Soya, Maní, Camote, Tomate, Zapallo, Mucuna | Camote→Zapallo→Mucuna→Zapallo (A vs B: equivalentes) |
| Ladera sur de Moyobamba | 1335 (Δceldas 351) | 26.2 | 20.2 | I1321 / E1801 / P943 | limitada | Maíz, Frijol, Soya, Maní, Camote, Zapallo, Mucuna, Frijol | Camote→Mucuna→Zapallo→Camote (A vs B: equivalentes) |
| Rioja | 827 (Δceldas -1234) | 3.5 | 24.9 | I1244 / E3214 / P577 | no_recomendable | — | no se recomienda |
| Tarapoto | 277 (Δceldas -249) | 3.0 | 26.9 | E1511 / P1086 | limitada | Maíz, Frijol, Frijol, Soya, Maní, Camote, Zapallo, Mucuna | Camote→Frijol→Zapallo→Frijol (A vs B: equivalentes) |
| Yurimaguas | 146 (Δceldas -240) | 2.6 | 27.3 | E2431 / P1274 | limitada | Maíz, Frijol, Frijol, Soya, Maní, Camote, Zapallo, Mucuna | Camote→Mucuna→Zapallo→Camote (A vs B: equivalentes) |
| Tingo María | 646 (Δceldas -1795) | 1.8 | 24.6 | I2237 / E1460 / P1317 | no_recomendable | — | no se recomienda |
| Pucallpa | 154 (Δceldas -20) | 2.4 | 28.1 | I1878 / E2159 / P1054 | limitada | Maíz, Frijol, Frijol, Soya, Maní, Camote, Zapallo, Mucuna | Camote→Zapallo→Mucuna→Zapallo (A vs B: equivalentes) |
| Iquitos | 93 (Δceldas -22) | 1.0 | 25.9 | I3399 / E2718 / P2929 | limitada | Maíz, Frijol, Frijol, Soya, Maní, Camote, Tomate, Zapallo, Mucuna | Camote→Frijol→Zapallo→Mucuna (A vs B: equivalentes) |
| Jaén | 741 (Δceldas -571) | 4.4 | 26.1 | I908 / E896 / P432 | limitada | Maíz, Frijol, Frijol, Soya, Maní, Camote, Tomate, Zapallo, Mucuna | Camote→Zapallo→Mucuna→Zapallo (A vs B: equivalentes) |
| Chachapoyas | 2353 (Δceldas 241) | 6.0 | 15.9 | I831 / E1090 / P446 | limitada | Frijol | sin alternativa |
| Cajamarca | 2704 (Δceldas -46) | 3.3 | 14.9 | I564 / E1467 / P516 | limitada | Frijol | sin alternativa |
| Cusco | 3379 (Δceldas -361) | 1.4 | 10.9 | E1168 / P762 | no_recomendable | — | no se recomienda |
| Lima (costa desértica) | 144 (Δceldas -1051) | 4.2 | 25.4 | I128 / E74 / P42 | no_recomendable | — | no se recomienda |

## Detalle de soporte
### Moyobamba (urbano, plano) (-6.034, -76.971) — demo; sin pluviómetro
- Soporte: **limitada**
  - Las fuentes de lluvia discrepan (943–1505 mm/año, ratio 1.60): el riesgo hídrico es incierto.


### Ladera sur de Moyobamba (-6.1, -77) — ladera ≈26 %
- Soporte: **limitada**
  - La celda de POWER difiere 351 m de la parcela: la corrección térmica por altitud es estimativa y más incierta.
  - Pendiente 26 %: alto riesgo de erosión; la pendiente SRTM (ventana de 180 m) puede no representar la parcela.
  - Las fuentes de lluvia discrepan (943–1801 mm/año, ratio 1.91): el riesgo hídrico es incierto.


### Rioja (-6, -77.25) — celda POWER muy distinta
- Soporte: **no_recomendable**
  - La celda de NASA POWER (~55 km) está 1234 m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).
  - Las fuentes de lluvia discrepan (577–3214 mm/año, ratio 5.57): el riesgo hídrico es incierto.
- Limitación: La celda de NASA POWER (~55 km) está 1234 m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).
- Limitación: No se generan estrategias para esta ubicación.

### Tarapoto (-6.5, -76.367) — pluviómetro GHCN (681 días)
- Soporte: **limitada**
  - Sin serie IMERG completa: la lluvia depende de reanálisis (ERA5/POWER).
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.


### Yurimaguas (-5.894, -76.118) — pluviómetro GHCN (958 días)
- Soporte: **limitada**
  - Las fuentes de lluvia discrepan (1274–2431 mm/año, ratio 1.91): el riesgo hídrico es incierto.
  - Sin serie IMERG completa: la lluvia depende de reanálisis (ERA5/POWER).


### Tingo María (-9.3, -76) — selva alta, otro régimen
- Soporte: **no_recomendable**
  - La celda de NASA POWER (~55 km) está 1795 m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).
  - Las fuentes de lluvia discrepan (1317–2237 mm/año, ratio 1.70): el riesgo hídrico es incierto.
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.
- Limitación: La celda de NASA POWER (~55 km) está 1795 m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).
- Limitación: No se generan estrategias para esta ubicación.

### Pucallpa (-8.38, -74.55) — llanura amazónica
- Soporte: **limitada**
  - Las fuentes de lluvia discrepan (1054–2159 mm/año, ratio 2.05): el riesgo hídrico es incierto.
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.


### Iquitos (-3.75, -73.25) — ecuatorial muy húmedo
- Soporte: **limitada**
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.


### Jaén (-5.71, -78.81) — valle interandino más seco
- Soporte: **limitada**
  - La celda de POWER difiere 571 m de la parcela: la corrección térmica por altitud es estimativa y más incierta.
  - Las fuentes de lluvia discrepan (432–908 mm/año, ratio 2.10): el riesgo hídrico es incierto.
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.


### Chachapoyas (-6.23, -77.87) — andino ≈2350 m
- Soporte: **limitada**
  - Las fuentes de lluvia discrepan (446–1090 mm/año, ratio 2.45): el riesgo hídrico es incierto.
- Limitación: Con el clima, la altitud y las restricciones de esta ubicación no se encontró ninguna alternativa viable distinta de su rotación actual. No es responsable recomendar un cambio con estos datos.
- Limitación: Solo 1 de los 10 cultivos de la base son viables aquí (Frijol común); la base no incluye cultivos propios de este piso altitudinal.

### Cajamarca (-7.16, -78.51) — andino ≈2700 m
- Soporte: **limitada**
  - Las fuentes de lluvia discrepan (516–1467 mm/año, ratio 2.84): el riesgo hídrico es incierto.
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.
- Limitación: Con el clima, la altitud y las restricciones de esta ubicación no se encontró ninguna alternativa viable distinta de su rotación actual. No es responsable recomendar un cambio con estos datos.
- Limitación: Solo 1 de los 10 cultivos de la base son viables aquí (Frijol común); la base no incluye cultivos propios de este piso altitudinal.

### Cusco (-13.52, -71.97) — andino alto > 3000 m
- Soporte: **no_recomendable**
  - Altitud 3379 m: por encima del dominio de la base de cultivos (cultivos de piso bajo y medio; sin cultivos andinos de altura).
  - La celda de POWER difiere 361 m de la parcela: la corrección térmica por altitud es estimativa y más incierta.
  - Las fuentes de lluvia discrepan (762–1168 mm/año, ratio 1.53): el riesgo hídrico es incierto.
  - Sin serie IMERG completa: la lluvia depende de reanálisis (ERA5/POWER).
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.
- Limitación: Altitud 3379 m: por encima del dominio de la base de cultivos (cultivos de piso bajo y medio; sin cultivos andinos de altura).
- Limitación: No se generan estrategias para esta ubicación.

### Lima (costa desértica) (-12.05, -77.04) — casi sin lluvia
- Soporte: **no_recomendable**
  - La celda de NASA POWER (~55 km) está 1051 m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).
  - Las fuentes de lluvia discrepan (42–128 mm/año, ratio 3.03): el riesgo hídrico es incierto.
  - Sin datos de suelo: se omite el criterio de ajuste al suelo.
- Limitación: La celda de NASA POWER (~55 km) está 1051 m de diferencia en altitud respecto a la parcela: la temperatura no es fiable (la corrección de −6,5 °C/km se contrastó con ERA5 y difiere hasta ~3 °C ya con 1200 m).
- Limitación: No se generan estrategias para esta ubicación.
