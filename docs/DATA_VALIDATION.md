# Validación de datos (generada por `npm run validate-data`)

Punto: -6.034, -76.971 (Moyobamba). Ventana 2015–2023, 3286 días comunes. Datos: instantánea `data/demo`.

## 1. Precipitación anual por fuente (mm)

| Año | IMERG (NASA) | ERA5 (control) | NASA POWER |
|---|---|---|---|
| 2015 | 1478 | 2125 | 1100 |
| 2016 | 1379 | 1856 | 1016 |
| 2017 | 1817 | 1416 | 1220 |
| 2018 | 1177 | 1272 | 1201 |
| 2019 | 1409 | 1337 | 1186 |
| 2020 | 1331 | 1054 | 845 |
| 2021 | 1613 | 1270 | 668 |
| 2022 | 1864 | 1532 | 698 |
| 2023 | 2394 | 1687 | 548 |
| **Media** | **1607** | **1505** | **943** |

## 2. Concordancia entre fuentes

| Par | r diario | r mensual | RMSE mensual (mm) |
|---|---|---|---|
| imerg vs era5 | 0.45 | 0.58 | 74 |
| imerg vs power | 0.31 | 0.28 | 103 |
| era5 vs power | 0.31 | 0.57 | 76 |

**Lectura.** POWER (PRECTOTCORR) acumula 59 % de la lluvia de IMERG en este punto y su serie anual diverge desde 2020. IMERG y ERA5 concuerdan entre sí más que cualquiera de ellos con POWER, pero la concordancia es solo MODERADA (r mensual 0.58). Por ello el sistema usa IMERG como fuente primaria, ERA5 y POWER como controles y comunica la discrepancia. **Ninguna de las tres ha sido contrastada con un pluviómetro** (pendiente: SENAMHI u otra estación local).

## 3. Control de calidad de NASA POWER

- WS2M máx 0.33 m/s: físicamente irreal para agronomía; se aplica mínimo 0,5 m/s en ET0

## 4. Otras fuentes

- Pendiente SRTM: 0.79 % (elevación SRTM 878 m; POWER reporta 984 m para su celda)
- SoilGrids 0–30 cm: pH 5.2 [4.0–7.2], arcilla 33 %, C orgánico 27 g/kg (intervalo 5–95 %: 5–74).
- IMERG vía ClimateSERV: serie diaria disponible hasta 2024-06-01 (comprobado el 2026-11-06); por eso la ventana termina en 2023.
