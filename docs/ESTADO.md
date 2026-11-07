# Estado del proyecto (actualizado 2026‑11‑06)

> **CONGELADO por la regla del concurso** (ver `REGLAS_Y_CRONOLOGIA.md`): los pendientes de abajo **no se ejecutan antes del hackathon**. Quedan registrados, no resueltos.

## Pendiente adicional conocido (aportado por el usuario, NO verificado)
- ClimateSERV documentaría `datatype=26` como **IMERG V06 Late** y `datatype=226` como **V07 Late**. El código y los documentos dicen «V07» para `datatype=26`: **esa etiqueta puede ser incorrecta** y está sin comprobar. Tampoco se contrastó el efecto de ese cambio de versión en las cifras de lluvia.
- Lo mismo para: contraste con SENAMHI, tratamiento de `WS2M` (el calificativo «físicamente irreal» es una afirmación no cuantificada; falta medir el efecto del límite de 0,5 m/s sobre ET₀), auditoría bibliográfica de la base de cultivos, casos geográficos distintos de un punto urbano, y pruebas de interfaz.

## Hecho y verificado
- Pipeline real de datos con caché, procedencia y degradación controlada (POWER, IMERG, ERA5, SRTM, SoilGrids). [consultas reales]
- Motor completo: ET₀, balance hídrico, reglas eliminatorias, 8 criterios, robustez entre fuentes, sensibilidad de pesos, explicaciones. 
- API + app móvil (4 pasos, mapa con capa NASA GIBS, gráficos SVG, procedencia por dato, guardado de parcelas y decisiones con versión del motor).
- 25 pruebas automatizadas que pasan (`npm test`, sin red).
- Pantallas 1 (parcela/mapa) y 4 (resultados) verificadas visualmente en Edge headless (500 px, modo oscuro). Nota: Edge headless impone ~500 px de ancho mínimo; a 430 px la captura se recorta (artefacto de la captura, no del diseño).
- Informe de validación cruzada de lluvia reproducible.

## NO verificado / limitaciones (leer antes de presentar)
1. **Base de cultivos y reglas sin validación agronómica.** Parámetros ordinales (cobertura, N, costo) son criterio del equipo, no literatura citada por valor. Es la mayor debilidad científica.
2. **Ninguna fuente de lluvia se contrastó con un pluviómetro.** No se verificó acceso a SENAMHI.
3. **Pantallas 2–3 de la interfaz** (historial, prioridades) y el modo claro **no se revisaron visualmente**; tampoco se probó en un teléfono real, con toques en el mapa ni con lectores de pantalla.
4. Criterios oficiales 2026 y texto del reto **no consultados** (error TLS). Los criterios 2025 son solo orientativos.
5. IMERG vía ClimateSERV termina en 2024‑06‑01; sin credenciales Earthdata no hay forma de ampliarlo. Para producción: GES DISC directo con token.
6. Demo con datos reales de **un solo punto** (Moyobamba, píxel urbano: pendiente 0,8 %). No se probó una ladera ni otra región; el motor está calibrado solo por reglas tropicales genéricas.
7. Campañas A/B fijas; ciclos y Kc de valores típicos FAO‑56, no de variedades locales.
8. Ninguna afirmación de beneficio agrícola: el 81 vs 56 del demo es un índice comparativo, no un resultado de campo.
9. No hay repositorio remoto ni despliegue público; no hay autenticación (los datos de parcelas son locales).

## Siguiente acción concreta (por prioridad)
1. Revisar manualmente `spaceappschallenge.org/2026` (descripción oficial + criterios) y ajustar narrativa.
2. Pedir a un agrónomo local (o literatura regional) que revise `data/crops.json` y las reglas de `docs/METODOLOGIA.md` §3–4; sustituir los ordinales por valores citados donde existan.
3. Obtener datos de pluviómetro (SENAMHI u otra estación) para el punto y comparar con IMERG/ERA5/POWER.
4. Probar pantallas 1–3 en móvil real y corregir lo que aparezca; añadir prueba de interfaz.
5. Probar una segunda zona con pendiente alta (p. ej. ladera de San Martín) y revisar la regla de erosión.
6. Considerar NDVI HLS/Landsat como indicador de cobertura real (con tratamiento de nubes).

## Cómo continuar sin repetir trabajo
`npm test` → `npm start` → abrir `/?demo=1`. Los datos del demo están en `data/demo` (no volver a descargar IMERG: ~7 min). Decisiones en `docs/DECISIONES.md`.
