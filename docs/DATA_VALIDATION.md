# Validación de datos (generada por `npm run validate-data`)

Punto: -6.034, -76.971 (Moyobamba). Ventana 2015–2023, 3286 días comunes. Datos: instantánea `data/demo`.

## 1. Precipitación anual por fuente (mm)

| Año | IMERG (NASA) | ERA5 (control) | NASA POWER |
|---|---|---|---|
| 2015 | 1527 | 2125 | 1100 |
| 2016 | 1231 | 1856 | 1016 |
| 2017 | 1771 | 1416 | 1220 |
| 2018 | 1252 | 1272 | 1201 |
| 2019 | 1292 | 1337 | 1186 |
| 2020 | 1163 | 1054 | 845 |
| 2021 | 1509 | 1270 | 668 |
| 2022 | 1537 | 1532 | 698 |
| 2023 | 1382 | 1668 | 548 |
| **Media** | **1407** | **1503** | **943** |

## 2. Concordancia entre fuentes

| Par | r diario | r mensual | RMSE mensual (mm) |
|---|---|---|---|
| imerg vs era5 | 0.44 | 0.70 | 56 |
| imerg vs power | 0.33 | 0.57 | 69 |
| era5 vs power | 0.31 | 0.57 | 76 |

**Lectura.** POWER (PRECTOTCORR) acumula 67 % de la lluvia de IMERG en este punto y su serie anual diverge desde 2020. IMERG y ERA5 concuerdan entre sí más que cualquiera de ellos con POWER, pero la concordancia es solo MODERADA (r mensual 0.70). Por ello el sistema usa IMERG como fuente primaria, ERA5 y POWER como controles y comunica la discrepancia. **Ninguna de las tres ha sido contrastada con un pluviómetro** (un contraste parcial con la estación GHCN de Tarapoto está en docs/AUDITORIA.md §3; SENAMHI Moyobamba sigue pendiente).

## 3. Control de calidad de NASA POWER

- WS2M máx 0.33 m/s: muy bajo (rugosidad/escala de la rejilla); se aplica piso FAO-56 de 0,5 m/s en ET0 (efecto ≈+2 % con u2=0,8; ver AUDITORIA.md)

## 4. Otras fuentes

- Pendiente SRTM: 0.79 % (elevación SRTM 878 m; POWER reporta 984 m para su celda)
- SoilGrids 0–30 cm: pH 5.2 [4.0–7.2], arcilla 33 %, C orgánico 27 g/kg (intervalo 5–95 %: 5–74).
- IMERG vía ClimateSERV: datatype 226 (V07 inferida) usado desde 2026-11-06; el datatype 26 heredado termina en 2024-06-01 y difiere mucho (ver docs/AUDITORIA.md §1).
