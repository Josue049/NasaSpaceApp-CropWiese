# SENAMHI MORROPÓN — serie diaria histórica: importación y calidad

> Generado por `node scripts/senamhi_import.js`. Los datos originales NO se modifican; se copian a `data/senamhi/raw/` con su SHA-256.

## Procedencia

- Estación: **MORROPON** (Dep. PIURA, Prov. MORROPON, Dist. MORROPON), según la gráfica del portal de SENAMHI.
- Archivo: `qc00000235.txt` (390679 bytes) · SHA-256 `215a94046e8b9f781d1c07e7d8f927f934b58f2a6502fa31fb829f5652c64240`
- Coordenadas y altitud: **no constan en el archivo**; no se asumen.
- Origen: portal de datos históricos de SENAMHI (descarga manual).

## Formato (verificado sobre el archivo)

- Sin encabezado, 6 columnas separadas por espacios: `año mes día pr tmax tmin`. Valor ausente `-99.9`. Sin indicadores de calidad.
- Asignación de columnas **inferida**: la 4.ª es 0 en el 83 % de los días y llega a 170.9 mm; la 5.ª supera a la 6.ª en el 100 % de los días con ambas; coincide con la gráfica del portal.
- Líneas con problemas de formato: **0**.

## Cobertura temporal

- Primer día: **1963-10-01** · último día: **2014-06-30** · días esperados: 18536 · registros: 18536 · saltos de calendario: 0.
- **No incluye 2015–2023**: la serie termina antes del periodo de nuestras climatologías.

| Variable | Días válidos | Cobertura |
|---|---|---|
| Precipitación | 17776 | 95.9 % |
| Tmax | 17906 | 96.6 % |
| Tmin | 17924 | 96.7 % |
| Tmedia estimada | 17832 | 96.2 % |

### Rachas de ausentes ≥ 15 días

- **pr_mm**: 1967-01-01→1967-06-30 (181 d); 1967-08-01→1967-09-05 (36 d); 1970-06-01→1970-06-30 (30 d); 1974-06-01→1974-06-30 (30 d); 1976-11-01→1976-11-30 (30 d); 1984-06-01→1984-06-30 (30 d); 1986-03-10→1986-03-26 (17 d); 1989-04-01→1989-05-03 (33 d); 1989-12-01→1989-12-31 (31 d); 1990-09-01→1990-09-30 (30 d); 1992-12-01→1992-12-31 (31 d); 1993-06-01→1993-10-31 (153 d); 1998-02-01→1998-04-30 (89 d); 2013-07-01→2013-07-31 (31 d)
- **tmax_c**: 1964-09-01→1964-11-12 (73 d); 1967-01-01→1967-06-30 (181 d); 1967-08-01→1967-09-06 (37 d); 1970-06-01→1970-06-30 (30 d); 1989-04-01→1989-05-04 (34 d); 1992-12-01→1992-12-31 (31 d); 1993-06-01→1993-11-03 (156 d); 2013-07-01→2013-07-31 (31 d)
- **tmin_c**: 1967-01-01→1967-06-30 (181 d); 1967-08-01→1967-09-06 (37 d); 1970-03-25→1970-06-30 (98 d); 1989-04-01→1989-05-04 (34 d); 1992-12-01→1992-12-31 (31 d); 1993-06-01→1993-11-03 (156 d); 2013-07-01→2013-07-31 (31 d)

### Años con ausentes (días con dato / días del año)

| Año | Pr | Tmax | Tmin |
|---|---|---|---|
| 1964 | 100 % | 80.1 % | 97.8 % |
| 1967 | 40.5 % | 40.3 % | 40.3 % |
| 1970 | 91.8 % | 91.8 % | 73.2 % |
| 1972 | 100 % | 96.7 % | 96.4 % |
| 1974 | 91.8 % | 98.1 % | 98.6 % |
| 1976 | 91.8 % | 97 % | 100 % |
| 1984 | 91.8 % | 100 % | 100 % |
| 1986 | 95.3 % | 96.2 % | 96.2 % |
| 1989 | 82.5 % | 90.7 % | 90.7 % |
| 1990 | 91.8 % | 97.8 % | 97.8 % |
| 1992 | 91.5 % | 91.5 % | 91.5 % |
| 1993 | 58.1 % | 57.3 % | 57.3 % |
| 1996 | 100 % | 98.9 % | 100 % |
| 1998 | 75.6 % | 100 % | 100 % |
| 2005 | 100 % | 99.7 % | 100 % |
| 2013 | 91.5 % | 91.5 % | 91.5 % |

## Banderas de calidad

- `tmin_ausente`: 616
- `tmax_ausente`: 630
- `tmin_sospechosa`: 16
- `pr_ausente`: 752

Valores sospechosos conservados (umbral de revisión pr ≥ 200 mm, Tmax ≥ 42 °C, Tmin ≤ 10 °C): 16 → 1966-06-03 tmin_c=9.8; 1966-06-06 tmin_c=9.8; 1966-06-08 tmin_c=9.4; 1966-06-14 tmin_c=9.8; 1966-06-16 tmin_c=9; 1966-06-23 tmin_c=9.4; 1966-06-27 tmin_c=10; 1966-06-29 tmin_c=10; 1966-07-03 tmin_c=9.4; 1971-07-04 tmin_c=10; 1971-07-05 tmin_c=9.6; 1971-07-06 tmin_c=9.5

## Validez mensual y sensibilidad de la regla

| Regla (ausentes máx. / consecutivos máx.) | Meses de precipitación válidos | Años completos |
|---|---|---|
| estricta_5_3 (5/3) | 583 | 38 |
| omm_10_5 (10/5) | 584 | 38 |
| laxa_15_10 (15/10) | 584 | 38 |

## Climatología mensual (meses válidos, regla 10/5)

| Mes | Lluvia 1963-2014 (mm) | Lluvia 2001-2014 (mm) | Tmax (°C) | Tmin (°C) | Tmedia est. (°C) |
|---|---|---|---|---|---|
| ene | 38.3 (50) | 42.6 (14) | 32.9 | 21.0 | 27.0 |
| feb | 100.7 (49) | 163.1 (14) | 32.7 | 21.8 | 27.3 |
| mar | 161.6 (48) | 181.1 (14) | 32.7 | 21.7 | 27.2 |
| abr | 66.9 (48) | 63.5 (14) | 32.3 | 20.6 | 26.4 |
| may | 11.7 (50) | 2.5 (14) | 31.1 | 18.8 | 24.9 |
| jun | 2.8 (46) | 0.6 (14) | 29.9 | 17.1 | 23.5 |
| jul | 0.3 (48) | 0.2 (12) | 29.6 | 16.0 | 22.8 |
| ago | 0.3 (48) | 0.0 (13) | 30.5 | 15.8 | 23.1 |
| sep | 0.3 (48) | 0.0 (13) | 31.6 | 15.9 | 23.8 |
| oct | 2.1 (50) | 3.9 (13) | 31.9 | 16.6 | 24.3 |
| nov | 1.8 (50) | 3.8 (13) | 32.4 | 17.5 | 24.9 |
| dic | 11.1 (49) | 4.1 (13) | 32.8 | 19.1 | 25.9 |

(entre paréntesis, años con mes válido). La media anual de lluvia de una climatología con años faltantes no equivale a un total anual observado.

## Lluvia anual (solo años con 12 meses válidos)

1964: 62 mm · 1965: 655 mm · 1966: 72 mm · 1968: 27 mm · 1969: 104 mm · 1971: 152 mm · 1972: 482 mm · 1973: 569 mm · 1975: 395 mm · 1977: 403 mm · 1978: 123 mm · 1979: 116 mm · 1980: 148 mm · 1981: 623 mm · 1982: 136 mm · 1983: 2891 mm · 1985: 130 mm · 1987: 682 mm · 1988: 52 mm · 1991: 80 mm · 1994: 259 mm · 1995: 219 mm · 1996: 134 mm · 1997: 424 mm · 1999: 613 mm · 2000: 594 mm · 2001: 717 mm · 2002: 773 mm · 2003: 142 mm · 2004: 208 mm · 2005: 144 mm · 2006: 600 mm · 2007: 189 mm · 2008: 1181 mm · 2009: 455 mm · 2010: 371 mm · 2011: 243 mm · 2012: 1194 mm

Años completos: 38. Mediana: 259.1 mm; máximo: 2891.1 mm (1983). Distribución muy asimétrica (años Niño).

## Extremos y umbrales

- Mayores lluvias diarias: 1981-03-13 170.9 mm; 1983-01-26 152.7 mm; 1983-04-20 137.1 mm; 2002-04-06 130 mm; 1983-04-06 123.9 mm
- Tmax más altas: 1990-03-13 39 °C; 1991-03-05 39 °C; 1995-04-03 39 °C; 1997-03-15 38.8 °C; 1992-01-28 38.2 °C
- Tmin más bajas: 1971-07-11 8.8 °C; 1966-06-16 9 °C; 1971-07-14 9.2 °C; 1966-06-08 9.4 °C; 1966-06-23 9.4 °C
- Días con tmax_c ≥ umbral (sobre 17906 días válidos): >=30: 14375 (80.28 %) · >=32: 9099 (50.82 %) · >=35: 1516 (8.47 %)
- Días con tmin_c ≥ umbral (sobre 17920 días válidos): >=20: 6404 (35.74 %) · >=22: 3133 (17.48 %) · >=24: 371 (2.07 %)
- Lluvia: 1485 días ≥1 mm · 279 días ≥20 mm · P95 de días húmedos 54.2 mm · P99 88.3 mm.

## Limitaciones

- La serie termina el 2014-06-30: NO solapa con la climatología 2015–2023 usada por el motor; sirve para validar fuentes en un periodo anterior (2000-06 → 2014-06 para IMERG; 1981+ para POWER; 1963+ para ERA5).
- La temperatura media se estima como (Tmax+Tmin)/2; no es la media de observaciones horarias.
- Un 0 de precipitación y un día sin reporte son distintos: solo -99.9 se trata como ausente; no se puede distinguir un 0 real de un 0 no reportado.
