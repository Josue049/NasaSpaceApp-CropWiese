# Auditoría científica (2026‑11‑06)

Estado de cada afirmación: **VERIFICADO** (comprobado con datos/fuentes en esta sesión), **INFERIDO** (consistente con la evidencia, sin confirmación oficial), **PENDIENTE**. Nada de esto equivale a validación agronómica de campo.

## 1. Producto IMERG de ClimateSERV (`datatype` 26 vs 226)
- **VERIFICADO (documentación oficial)**: la tabla de ClimateSERV (`/develop-api`, leída el 2026‑11‑06) identifica `26` = NASA‑IMERG‑V06‑Late, `91` = V06‑Early, `226` = NASA‑IMERG‑V07‑Late, `227` = NASA‑IMERG‑V07‑Early, todos diarios y «2000 – near present». El usuario lo había señalado; antes se había etiquetado `26` como V07 por error.
- **VERIFICADO (medido)**: `26` y `226` devuelven series distintas para el mismo cuadro de 0,1° y las mismas fechas. `26` **no devuelve datos desde 2024‑06‑01** aunque la tabla diga «near present»; `226` sí devuelve (comprobado en ene–feb 2025).
- **Comparabilidad (Moyobamba, 2015–2023, `docs/evidence/imerg_v06_vs_v07_moyobamba.json`)**: ambas en mm/día (magnitudes coherentes; la API no declara la unidad). Media anual V06 1603 mm, V07 1407 mm (razón 0,88); días con ≥1 mm: 47,9 % vs 45,0 %; máximo diario 175 vs 121 mm; r diario 0,73, r mensual 0,74; diferencia absoluta media 2,9 mm/día. El año 2023 pasa de 2350 a 1382 mm.
- **Lo que NO se afirma**: no se investigó la causa de las diferencias ni se atribuyen a error de una versión; sin pluviómetro local no se sabe cuál se acerca más a la realidad. Concordancia mensual con ERA5: r = 0,58 (V06) → 0,70 (V07), lo que no prueba que V07 sea más exacta.
- **Procedencia y caché**: el código usa `226` por defecto (`FIELDSHIFT_IMERG_DT` lo cambia); los archivos de caché llevan el datatype en el nombre (`imerg226_…`, `imerg26_…`) para no mezclar versiones; la procedencia mostrada en la interfaz indica «V07 Late (datatype 226)». La ventana del análisis sigue siendo 2015–2023 (ampliable porque 226 llega a 2025).

## 2. `WS2M` de NASA POWER y piso de viento
- **VERIFICADO**: en Moyobamba 2015–2023 `WS2M` tiene media 0,05 m/s y máximo 0,33 m/s. ERA5 (u10 medio 1,04 m/s × 0,748, FAO‑56 ec. 47) da u2 ≈ 0,78 m/s.
- La expresión previa «físicamente irreal» era una afirmación no cuantificada y se retiró: es un valor muy bajo, probablemente por escala de rejilla y rugosidad, no demostrado imposible.
- **Efecto sobre ET₀ anual** (`node scripts/audit_ws2m.js`): u2=0,5 → 1250 mm; 0,8 → +2,0 %; 1,0 → +3,2 %; 1,5 → +6,2 %; 2,0 → +8,9 %. Se mantiene el piso FAO‑56 de 0,5 m/s; la incertidumbre por viento es ≈ +2 % (ERA5) y hasta +6 %.
- **Efecto sobre la recomendación** (`docs/SENSIBILIDAD.md`): ninguno en la estrategia A para u2 = 0,8 o 1,5.

## 3. Contraste con pluviómetro (parcial)
- SENAMHI: la web de datos históricos se consulta por estación mediante formulario dinámico; **no se obtuvo acceso programático**. PENDIENTE: serie de la estación de Moyobamba.
- Alternativa usada: GHCN‑Daily (NOAA), estación **Tarapoto PE000084455** (−6,5; −76,367; 282 m), a ≈70 km de Moyobamba y ≈600 m más baja. Mala representatividad; solo da una comprobación indicativa. Años 2015–2019, 681 días con dato (huecos grandes; no se usan totales anuales).
- Resultado (`scripts/validate_gauge.js`, `docs/evidence/gauge_-6.5_-76.367.json`), con desfase de −1 día (la lectura de las 7 h se asigna al día siguiente):

| Fuente | Sesgo (días con dato) | r diario | r en bloques de 5 días (25 bloques) |
|---|---|---|---|
| IMERG 226 | +49 % | 0,25 | 0,09 |
| ERA5 | +30 % | 0,32 | 0,15 |
| POWER | +19 % | 0,57 | 0,69 |

- **Lectura**: en este punto POWER concuerda mejor con el pluviómetro que IMERG, lo que **no respalda** presumir que IMERG sea la mejor fuente. La muestra es pequeña, la representatividad baja, y las tres fuentes usan día UTC frente al día de pluviómetro local. No hay base para cambiar la fuente primaria ni para afirmar lo contrario en Moyobamba. Por eso el diseño evalúa cada rotación con las tres fuentes y comunica la discrepancia.

## 4. Base de cultivos vs FAO‑56 (`data/crops.json`, campo `param_status`)
Comparación con las Tablas 11, 12 y 22 de FAO‑56 leídas en fao.org (extractos en `docs/evidence/fao56_*`).
- **Kc (ini/mid/end)**: coinciden con la Tabla 12 en los 9 cultivos presentes en FAO‑56 (dentro de rangos donde FAO da rango).
- **Fracción de agotamiento `p`**: coincide, salvo zapallo (teníamos 0,5; FAO 0,35 → corregido).
- **Profundidad radicular**: teníamos valores por debajo del rango de la Tabla 22 en maíz, frijol, camote y zapallo; se subieron al límite inferior del rango FAO (conservador). Esto es una elección y se probó en sensibilidad.
- **Duración de etapas**: coincide con la primera fila de la Tabla 11 en arroz, frijol, maní, camote y zapallo; difiere en maíz (135 d vs 180), caupí, soya y tomate (variedades/ciclos locales, sin fuente) → marcados PROVISIONAL.
- **Mucuna**: no figura en FAO‑56; todos sus parámetros son PROVISIONALES.
- **PROVISIONAL (juicio propio, sin fuente)**: `cover`, `biomass`, `n_balance`, `cost`, `waterlog_sens` de todos los cultivos. `t_abs`, `ph`: citados a EcoCrop/FAO, **no verificados** en esta sesión.
- Son estas escalas ordinales las que dominan la recomendación; requieren un agrónomo (ver `docs/HOJA_AGRONOMO.md`).

## 5. Sensibilidad
`docs/SENSIBILIDAD.md`: la estrategia A (mucuna → zapallo → camote → caupí) no cambia al variar AWC (70–150 mm/m), piso de viento (0,5–1,5), profundidad radicular (×0,7–×1,3) ni Kc_mid (×0,9–×1,1); varía su puntaje (79–83) y a veces la estrategia B. **Limitación**: la recomendación es robusta a los parámetros *físicos* probados, pero no se ha probado frente a las escalas ordinales (sección 4), que son la fuente principal de incertidumbre.

## 6. Casos geográficos (`docs/CASOS_GEOGRAFICOS.md`, `node scripts/geo_cases.js`)
- **Ladera (−6,10; −77,00; pendiente SRTM 26 %, 1335 m)**: el motor activa el peso de erosión (0,24) y la regla de cobertura con pendiente > 25 %; las alternativas A y B incluyen mucuna/zapallo/camote.
- **Chachapoyas (−6,23; −77,87; 2353 m)**: hallazgo de debilidad. La temperatura de POWER venía de una celda a 2112 m y no se corregía. Se añadió corrección por altitud (D‑14): temperatura media de ciclo ≈ 15–16 °C. El motor aún permite camote y zapallo (mínimo usado 15 °C, sin verificar) y mantiene ciclos fijos de 135–150 d, que serían más largos en frío. Se añadió un **aviso** de temperatura marginal (D‑15); no se inventaron óptimos.
- **PENDIENTE**: modelar ciclos más largos con la temperatura (grados‑día) requiere parámetros por cultivo con fuente; un agrónomo andino debería revisar esto antes de usar la herramienta por encima de ~1500 m.

## 7. Interfaz (capturas con Edge headless a 500 px)
- Pantallas 2, 3 y resultados revisadas en modo claro y oscuro. **Error encontrado y corregido**: en modo oscuro los chips de «cultivos que NO quiere sembrar» tenían texto casi invisible (`color` sin definir). Enlaces de prueba `?demo=1&step=2|3&theme=light|dark`.
- **No probado**: teléfono real, toques en el mapa, lector de pantalla, conexión lenta.
