# CROPWISE — revisión de integración con climate.js
Fecha: 14-11-2026. Revisión estática y prueba de integración con escenario SINTÉTICO, no validación agronómica.

## Hallazgos priorizados

**CRÍTICO — riego no se incorpora al balance diario.** `climate.js` (`evaluateSeason`, líneas aprox. 142–195) recibe `irrigated`, pero las actualizaciones de `Dr` usan lluvia y ETa, sin un término explícito de agua aportada por riego. La variable `irrigated` reduce `drought_frac` por 0,3 después de simular. `engine.js` además modifica `sat` como `1 - 0.3*(1-s.sat)`. Esto produce una puntuación hídrica superior al activar riego sin cuantificar su aporte físico. No presentar como riego calculado ni aplicar a arroz inundado sin módulo de lámina, percolación y drenaje.

**ALTO — condición de datos NASA POWER.** `buildClimate` transmite `ALLSKY_SFC_SW_DWN` directamente como radiación `rs` a `et0Day`, que espera **MJ/m²/día**. POWER puede presentar unidades diferentes según comunidad/solicitud. Leer `raw.parameters.ALLSKY_SFC_SW_DWN.units` (o metadatos equivalentes) y convertir **kWh/m²/día ×3,6** únicamente cuando corresponda. No realizar conversión doble si AG ya entrega MJ/m²/día. Fallar con advertencia si no se identifica la unidad. Referencia: FAO-56 capítulo 2, https://www.fao.org/4/x0490e/x0490e06.htm y documentación POWER.

**ALTO — observación de cultivos:** `climate.js` genera solo cuatro fases funcionales de curva Kc; no predice macollaje, floración u otros hitos observados. Agregar módulo específico para evaluación fenológica con fecha personalizada y correspondencias justificadas, sin calcular MAE de fases no equivalentes.

**ALTO — balance radicular estandarizado en arroz inundado.** La ecuación Dr y el déficit ETa/ETc modelan el estrés radicular simplificado; no incluyen almacenamiento en lámina de agua, percolación, filtración, preparación del suelo ni modalidad de riego. Para el MVP rotular ETc como evapotranspiración y mostrar las limitaciones antes de recomendar riego.

**ALTO — periodos de campaña.** `SLOTS`: A = 1-nov, B = 15-abr. La campaña SENAMHI de Morropón se sembró 21-ene-2026; requiere modo de evaluación con fecha libre y meteorología 2026. Las simulaciones históricas 2015–2023 no son validación fenológica 2026.

**MEDIO — promedio de humedad relativa.** `ea = (rh/100)*esMean` usa RH media como aproximación de presión de vapor, cuyo sesgo requiere cuantificación. Confirmar posibilidades de RH máxima/mínima o temperatura de rocío; consultar FAO-56 capítulo 3.

**MEDIO — parámetros sin calibrar.** `awcFromSoil` determina 70, 110 o 120 mm/m por umbrales de textura, y mantiene `root_m` y `p_depletion` constantes. Es una clasificación provisional, no una medida del almacenamiento efectivo de la parcela.

**MEDIO — temperatura:** la corrección por altitud y los parámetros EcoCrop son supuestos; la métrica de incertidumbre entre POWER/ERA5 no es una incertidumbre validada con estaciones.

**MEDIO — robustez Monte Carlo:** el `seasonCache` reutiliza resultados cuando la clave del clima/cultivo/slot/desplazamiento coincide. Las perturbaciones existentes (`cover`, `biomass`, `n_balance`, `cost`, `waterlog_sens`) se calculan en `campaignMetrics` y `scoreSequence`, fuera de `evaluateSeason`, por lo que el caché **no invalida esas cinco perturbaciones actuales**. Solo habrá que cambiar la clave o invalidarlo si se empiezan a perturbar `kc`, `cycle`, `root_m`, `eco`, `p_depletion` u otros atributos usados dentro de `evaluateSeason`.

## Integración ejecutada
- Ambos motores (`engine.js` original y `engine_grouped_experimental.js`) se ejecutaron con `climate.js` real, 3 cultivos del `crops.json` y 1 fuente de clima **SINTÉTICA** con 2020 y reglas de Morropón simuladas.
- Resultado del modo original: 60 candidatos, alternativa A `maiz–frijol–maiz–frijol` (75,0 puntos); B `frijol–maiz–frijol–maiz` (70,0).
- Resultado experimental: 60 candidatos, alternativa A igual (77,4); B `arroz–maiz–frijol–maiz` (69,4).
- La satisfacción hídrica devuelta por `evaluateSeason` fue igual con riego activado y desactivado (≈0,449) en este fixture: demuestra que el aporte de riego no está incorporado a la ecuación diaria.
- La prueba **NO** verifica exactitud física, parámetros locales, unidades NASA ni rankings reales. Revisar `test_integration.js` y `test_results.json`.

## Próximos pasos recomendados a Josué
1. Preservar el motor original y comparar los dos modelos con el mismo fixture NASA/SoilGrids del piloto.
2. Agregar validación de unidades y rangos de metadatos antes de ET0.
3. Cambiar el riego de factor de puntuación a aporte explícito documentado (o dejarlo como escenario declarado, no balance físico).
4. Habilitar simulación fenológica con fecha 21-01-2026 para evaluación SENAMHI, sin forzar equivalencia de etapas.
5. Incorporar pruebas específicas de reglas y criterios para rangos de valores ausentes, umbrales, y sensibilidad de ranking.

## Alcance
No se modifican los originales `engine.js`, `climate.js`, `crops.json`. El motor experimental modifica pesos, no hace correcciones físicas ni posee validación para recomendaciones de campo.
