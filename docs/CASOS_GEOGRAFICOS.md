# Casos geográficos (generado por `node scripts/geo_cases.js`)

Prueba de comportamiento del motor fuera del punto urbano plano. **No es validación agronómica**: solo muestra si las reglas reaccionan de forma coherente.

## Ladera, cerros al sur de Moyobamba (-6.1, -77)
- Pendiente SRTM: 26.2 %, 1335 m
- IMERG faltante: no; problemas: ninguno
- Candidatas válidas: 3613
- **Su rotación actual (proyectada)** (60): maiz → frijol → maiz → frijol
- **Alternativa A · mejor ajuste a sus prioridades** (76.3): camote → zapallo → mucuna → camote
- **Alternativa B · más robusta ante la incertidumbre de lluvia** (75.8): camote → mucuna → zapallo → camote
- Pesos: {"erosion":0.219,"organic_n":0.117,"water":0.117,"resilience":0.117,"pest":0.117,"market":0.117,"low_cost":0.117,"soil_fit":0.078}

## Chachapoyas (clima frío, 2350 m) (-6.23, -77.87)
- Pendiente SRTM: 6.0 %, 2353 m
- IMERG faltante: no; problemas: ninguno
- Candidatas válidas: 352
- **Su rotación actual (proyectada)** (70.2): maiz → frijol → maiz → frijol
- **Alternativa A · mejor ajuste a sus prioridades** (78.2): camote → zapallo → camote → zapallo
- **Alternativa B · más robusta ante la incertidumbre de lluvia** (76.3): camote → frijol → zapallo → camote
- Pesos: {"erosion":0.152,"organic_n":0.127,"water":0.127,"resilience":0.127,"pest":0.127,"market":0.127,"low_cost":0.127,"soil_fit":0.085}

