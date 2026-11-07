# Registro de decisiones

Estados: propuesta · validación pendiente · adoptada · descartada.

| ID | Decisión | Alternativas | Justificación / evidencia | Limitaciones | Estado |
|---|---|---|---|---|---|
| D‑01 | App web móvil sin framework y servidor Node sin dependencias | App nativa, React Native | Cero instalación, reproducible, viable en 10 días | Sin modo offline real ni instalación como app | adoptada |
| D‑02 | Foco en **cultivos anuales** (10 cultivos) | Café/cacao (perennes) | La rotación aplica a anuales; café/cacao quedan fuera del MVP | Zona cafetalera/cacaotera no cubierta | adoptada (confirmar con usuarios) |
| D‑03 | Motor de reglas + multicriterio, sin ML | Modelos estadísticos, ML | No hay datos etiquetados; auditabilidad | Pesos no calibrados | adoptada |
| D‑04 | Usar POWER (clima), IMERG (lluvia), SRTM (pendiente), SoilGrids (suelo). **No** usar SMAP, Landsat/NDVI, ECOSTRESS, GRACE | Incluirlos | SMAP 9–36 km y GRACE ~300 km son inútiles a escala de parcela; NDVI sufre nubosidad y no mide fertilidad; ECOSTRESS tiene cobertura irregular | El NDVI sería un indicador útil de cobertura real (futuro) | adoptada |
| D‑05 | **IMERG primaria, ERA5 y POWER de control**; evaluar con las tres y reportar robustez | POWER única; promedio de fuentes | POWER y IMERG/ERA5 discrepan hasta ×4 (`DATA_VALIDATION.md`) | Ninguna validada con pluviómetro | adoptada; **validación pendiente** |
| D‑06 | Balance hídrico diario FAO‑56 en vez de lluvia efectiva USDA‑SCS | Método SCS mensual | Con SCS la lluvia de 200 mm/mes rinde ~62 mm efectivos: exageraba la sequía (con ~1 500 mm/año reportaba déficit en 78 % de años). Detectado al revisar los resultados | Parámetros radiculares y AWC constantes | adoptada |
| D‑07 | Viento u₂ ≥ 0,5 m/s en ET₀ | Usar WS2M tal cual | WS2M ≤ 0,33 m/s irreal | Sesgo posible en ET₀ | adoptada |
| D‑08 | Máx. 1 campaña de abono verde en 4 | Sin límite | Sin la regla, la mucuna dominaba (sin costo de oportunidad) | Umbral arbitrario | adoptada (provisional) |
| D‑09 | Campañas fijas A (1‑nov) y B (15‑abr) | Fecha de siembra libre | Simplicidad; coincide con el patrón de lluvia observado | No optimiza fechas | adoptada (limitación conocida) |
| D‑10 | Ventana 2015–2023 común a todas las fuentes | 2015–2024 | IMERG/ClimateSERV termina el 2024‑06‑01 | 9 años: variabilidad interanual limitada | adoptada |
| D‑11 | Alternativa B = maximin entre fuentes de lluvia | B = 2.ª mejor | Hace visible la robustez, que es el principal riesgo de datos | A y B pueden empatar (ocurre en el demo) | adoptada |
| D‑12 | Parcela = punto (no polígono) | Dibujo de polígono | Los datos son de 10–55 km; el polígono no aportaría resolución | — | adoptada |
