# Fuentes de datos (verificadas con consultas reales el 2026-11-06)

| Producto | Uso | Acceso | Resolución | Estado |
|---|---|---|---|---|
| **NASA POWER** diaria v2.10 (MERRA‑2/SYN1DEG) | T, Tmax, Tmin, HR, radiación, viento → ET₀ | `https://power.larc.nasa.gov/api/temporal/daily/point` sin credenciales | ~0,5°×0,625° | ✔ funciona. **Lluvia poco fiable aquí**; `WS2M` muy bajo (ver AUDITORIA §2) |
| **NASA GPM IMERG Late** diaria | Lluvia primaria | vía **ClimateSERV** (SERVIR, NASA/USAID) `datatype=226` (= V07 Late según la documentación oficial; el 26 = V06 Late, serie heredada, sin datos desde 2024‑06), asíncrono, ~50 s/año | 0,1° | ✔ funciona. Ver `AUDITORIA.md` §1 |
| **SRTM 1″** (NASA/USGS/NGA) | Pendiente (Horn 3×3, paso 90 m) | espejo de terceros **OpenTopoData** (`srtm30m`) | ~30 m | ✔ funciona; no es un endpoint NASA |
| **ISRIC SoilGrids 2.0** | pH, C orgánico, arcilla, arena 0–30 cm | `rest.isric.org` | 250 m | ✔ funciona; `null` en píxeles urbanos (se prueba el entorno); incertidumbre muy alta |
| **ERA5** vía Open‑Meteo | Control independiente de lluvia (**no NASA**) | `archive-api.open-meteo.com` | ~25 km | ✔ funciona |
| NASA GIBS (MODIS) | Capa visual del mapa (no entra al cálculo) | WMTS público | 250 m–1 km | ✔ |
| GES DISC IMERG directo | — | **requiere credenciales Earthdata** | — | ✘ bloqueado (no hay cuenta configurada) |
| SMAP, Landsat/HLS, MODIS NDVI, ECOSTRESS, GRACE | — | — | — | **No usados** (ver D‑04) |
| SENAMHI | Contraste de lluvia | **no se verificó un acceso programático** | — | ⚠ pendiente |

## Hallazgos que condicionan el diseño

1. **Las fuentes de lluvia discrepan mucho** (media 2015–2023: IMERG 1 607 · ERA5 1 505 · POWER 943 mm/año; r mensual IMERG–ERA5 = 0,58; IMERG–POWER = 0,28). Ver `DATA_VALIDATION.md`.
2. POWER `PRECTOTCORR` cae a 548 mm en 2023 mientras IMERG da 2 394: no se usa como fuente primaria. La causa no se investigó (**[PV]**).
3. POWER `WS2M` (media 0,05 m/s) no es utilizable tal cual.
4. SoilGrids: intervalo 5–95 % de pH 4,0–7,2 y C orgánico 5–74 g/kg en el punto demo → casi no informativo; se muestra el rango y el criterio tiene peso bajo.
5. **No verificado:** la página oficial del reto «Field Shift» ni los criterios de evaluación 2026 (el sitio `spaceappschallenge.org` falló con error TLS desde esta máquina y no se omitió la validación del certificado). Solo se confirmó por búsqueda que los criterios de 2025 son Impacto, Creatividad, Validez, Relevancia y Presentación. **Acción: comprobar manualmente.**

## Referencias (verificar DOI/enlaces antes de citar en la presentación)

- Allen R.G., Pereira L.S., Raes D., Smith M. (1998). *Crop evapotranspiration*. FAO Irrigation and Drainage Paper 56. https://www.fao.org/4/x0490e/x0490e00.htm
- Doorenbos J., Kassam A.H. (1979). *Yield response to water*. FAO Irrigation and Drainage Paper 33.
- Stackhouse P. et al. NASA POWER. https://power.larc.nasa.gov/docs/
- Huffman G.J. et al. *GPM IMERG*. https://gpm.nasa.gov/data/imerg
- Farr T.G. et al. (2007). The Shuttle Radar Topography Mission. *Rev. Geophys.* 45, RG2004.
- Poggio L. et al. (2021). SoilGrids 2.0. *SOIL* 7, 217–240.
- Peoples M.B. et al. (2009). The contributions of nitrogen‑fixing crop legumes… *Symbiosis* 48, 1–17. (verificar)
- ClimateSERV API: https://climateserv.servirglobal.net/develop-api

## Sentinel-2 L2A (verificación del terreno; añadido en la rama `bajo-piura-arroz`)
- **Qué es:** imágenes satelitales de reflectancia de superficie, 10 m, revisita ~5 días (ESA/Copernicus). Acceso abierto vía [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a): búsqueda STAC y lectura de valores de un punto (`B04` rojo, `B08` infrarrojo cercano, `SCL` clasificación de escena).
- **Cálculo:** NDVI = (NIR − Rojo)/(NIR + Rojo), con reflectancia (DN − 1000)/10000 por el offset de la línea base ≥ 04.00 (las escenas actuales son 05.12). Se descartan pixeles con nubes, sombras, cirros y saturación (SCL ∉ {4, 5, 6}).
- **Verificado:** consulta real en Morropón (−5,1944; −79,9867), 31 escenas de nov‑2025 a jul‑2026, 20 válidas. Código en `src/satellite.js`, script `scripts/check_satellite.js`, instantánea en `data/demo_morropon/`.
- **Qué NO hace:** no identifica la especie (no distingue arroz de otro cultivo anual), no mide rendimiento, estado hídrico ni inundación; un pixel de 10 m puede caer en un camino o canal. En Piura casi cualquier vegetación sigue las lluvias, así que «patrón estacional» discrimina poco. Los umbrales de clasificación (p90 < 0,25; amplitud ≥ 0,30; p10 ≥ 0,55 con amplitud < 0,20) son de diseño, no validados.
- **No se usa MapBiomas Perú** (cobertura/uso del suelo): no se consultó ni se integró.
