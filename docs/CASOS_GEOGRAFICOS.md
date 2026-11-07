# Casos geográficos (generado por `node scripts/geo_cases.js`)

Prueba de comportamiento del motor fuera del punto urbano plano. **No es validación agronómica**: solo muestra si las reglas reaccionan de forma coherente.

## Ladera, cerros al sur de Moyobamba (-6.1, -77)
- Pendiente SRTM: 26.2 %, 1335 m
- IMERG faltante: no; problemas: ninguno
- Candidatas válidas: 2054
- **Su rotación actual (proyectada)** (62.3): maiz → frijol → maiz → frijol
- **Alternativa A · mejor ajuste a sus prioridades** (77.1): camote → mucuna → zapallo → camote
- **Alternativa B · más robusta ante la incertidumbre de lluvia** (76.7): camote → zapallo → mucuna → camote
- Pesos: {"erosion":0.207,"organic_n":0.111,"water":0.111,"resilience":0.111,"pest":0.111,"market":0.111,"low_cost":0.111,"soil_fit":0.074,"thermal":0.055}

## Chachapoyas (clima frío, 2350 m) (-6.23, -77.87)
- Pendiente SRTM: 6.0 %, 2353 m
- IMERG faltante: no; problemas: ninguno
- Candidatas válidas: 0
- **Su rotación actual (proyectada)** (70): maiz → frijol → maiz → frijol · VIOLA: Campaña 1 (Maíz amarillo duro): no completa su ciclo (135 días efectivos) en la campaña: con la temperatura estimada solo lo logra en 13 % de los años dentro de 165 días (límite = menor entre la ventana de 165 d y EcoCrop GMAX 365 d); Campaña 3 (Maíz amarillo duro): no completa su ciclo (135 días efectivos) en la campaña: con la temperatura estimada solo lo logra en 13 % de los años dentro de 165 días (límite = menor entre la ventana de 165 d y EcoCrop GMAX 365 d)
- Pesos: {"erosion":0.143,"organic_n":0.12,"water":0.12,"resilience":0.12,"pest":0.12,"market":0.12,"low_cost":0.12,"soil_fit":0.08,"thermal":0.06}

