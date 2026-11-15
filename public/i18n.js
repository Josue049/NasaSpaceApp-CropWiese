'use strict';
/* Idioma de la web: inglés por defecto, con selector EN / ES (se recuerda en el navegador).
   El texto fuente de la web está en español; este módulo lo traduce al inglés en el DOM (texto y atributos),
   incluido el contenido que app.js genera dinámicamente (MutationObserver). Al volver a ES se restaura el original.
   Lo que no esté en el diccionario (p. ej. explicaciones generadas por el servidor) se muestra tal cual, en español. */
(function () {
  const KEY = 'fs_lang';
  let lang = 'en';
  try { const s = localStorage.getItem(KEY); if (s === 'es' || s === 'en') lang = s; } catch { /* sin almacenamiento */ }
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'es' || q === 'en') lang = q; } catch { /* sin URL */ }

  const N = (s) => s.replace(/\s+/g, ' ').trim();

  // ---------- diccionario exacto (texto normalizado → inglés) ----------
  const EXACT = {
    // cabecera / navegación
    'Field Shift · Rotación de cultivos': 'Field Shift · Crop rotation',
    'Field Shift, inicio': 'Field Shift, home', 'Abrir menú': 'Open menu', 'Cerrar menú': 'Close menu', 'Secciones': 'Sections',
    'Inicio': 'Home', 'Recomendación': 'Recommendation', 'Indicadores': 'Indicators', 'Aprende': 'Learn',
    'Ayuda: ¿qué es esta demo?': 'Help: what is this demo?',
    'Demo · Instantánea': 'Demo · Instant', 'Demo · Precisa': 'Demo · Precise',
    'Descargar la app': 'Download the app', 'Descargar app': 'Download app', 'Idioma': 'Language',
    'Cropwise · Field Shift': 'Cropwise · Field Shift',
    // hero
    'Tu aliado para una rotación de cultivos más': 'Your ally for crop rotation that is more',
    'informada y sostenible': 'informed and sustainable',
    'Combinamos datos satelitales, clima y suelo de la zona para comparar rotaciones de': 'We combine satellite, climate and soil data from the area to compare rotations of',
    'arroz': 'rice', 'y': 'and', 'frijol Loctao': 'Loctao bean', 'en': 'in',
    'Cropi, la llama guía, saluda: «¡Hola! Soy Cropi, tu guía en el campo. Te ayudo a elegir la mejor rotación para tu parcela.»': 'Cropi, the guide llama, says: “Hi! I’m Cropi, your guide in the field. I’ll help you choose the best rotation for your plot.”',
    // 1. parcela
    '1. Define tu parcela': '1. Define your plot', 'Toca el mapa e indica el cultivo actual.': 'Tap the map and pick the current crop.', 'obligatorio.': 'required.',
    'Mapa para ubicar la parcela en Morropón': 'Map to locate the plot in Morropón',
    'Ubicación': 'Location', 'Área (ha)': 'Area (ha)', 'opcional': 'optional', 'Área en hectáreas': 'Area in hectares',
    'Cultivo actual': 'Current crop', 'Obligatorio': 'Required', '— elige —': '— choose —', 'Arroz': 'Rice', 'Frijol Loctao': 'Loctao bean', 'Frijol común': 'Common bean',
    // 2. recomendación
    '2. Obtén tu recomendación': '2. Get your recommendation',
    'Elige cómo quieres analizar tu parcela y te mostramos las opciones viables.': 'Choose how to analyze your plot and we will show you the viable options.',
    'Modo de análisis': 'Analysis mode', 'Instantánea': 'Instant', 'Precisa': 'Precise',
    'Datos satelitales y de estación de la zona': 'Satellite and weather-station data for the area', 'Suma datos de tu parcela': 'Adds data from your plot',
    'Primera campaña a evaluar': 'First season to evaluate', 'Primera campaña a sembrar': 'First season to plant',
    'Grande': 'Large', 'Chica': 'Small', 'Campaña anterior': 'Previous season', 'No lo sé': 'I don’t know',
    'Disponibilidad de riego': 'Irrigation availability', '¿Dispones de riego?': 'Do you have irrigation?', 'Sí': 'Yes', 'No': 'No', 'se evalúa como escenario': 'evaluated as a scenario',
    'Completar los datos de mi parcela': 'Fill in my plot data',
    'Aún no has indicado datos: se usan solo los datos de la zona.': 'You haven’t entered any data yet: only the area’s data is used.',
    'Generar recomendación': 'Generate recommendation',
    'Rotaciones recomendadas para tu parcela': 'Recommended rotations for your plot',
    'Primero comprobamos qué cultivos son viables en cada campaña de tu parcela; después comparamos las secuencias.': 'First we check which crops are viable in each season on your plot; then we compare the sequences.',
    '¿Qué sigue?': 'What’s next?',
    'Puedes ajustar tus datos, explorar los indicadores o aprender más sobre la rotación de cultivos.': 'You can adjust your data, explore the indicators or learn more about crop rotation.',
    'Ajustar datos': 'Adjust data', 'Ver indicadores': 'View indicators', 'Aprender': 'Learn more',
    // vistas
    'Recomendación en detalle': 'Recommendation in detail', 'Fechas de siembra, fenología y agua de tu parcela.': 'Sowing dates, phenology and water for your plot.',
    'Aún no hay resultados. Ve a': 'No results yet. Go to', 'y pulsa «Generar recomendación».': 'and press “Generate recommendation”.',
    'Qué tan confiable es el análisis y de dónde salen los datos.': 'How reliable the analysis is and where the data comes from.',
    'Genera una recomendación en Inicio para ver los indicadores de tu parcela.': 'Generate a recommendation on Home to see your plot’s indicators.',
    'Cómo funciona Field Shift y qué debes tener en cuenta.': 'How Field Shift works and what to keep in mind.',
    // diálogo Precisa
    'Datos de mi parcela': 'My plot data', 'Cerrar': 'Close',
    'Todo es opcional. Déjalo vacío si no lo sabes:': 'Everything is optional. Leave it empty if you don’t know:',
    'nunca se completa por ti': 'it is never filled in for you', 'ni se toma como cero. Lo que ingreses no se guarda y no se verifica.': 'nor treated as zero. What you enter is not saved or verified.',
    'Tu campaña': 'Your season',
    'Fecha prevista de siembra de la primera campaña': 'Planned sowing date of the first season',
    'Cultivo principal que deseas conservar': 'Main crop you want to keep', '— ninguno —': '— none —',
    '¿En qué campañas?': 'In which seasons?', 'Todas las campañas grandes': 'All large seasons', 'Todas las campañas chicas': 'All small seasons', 'Todas las campañas': 'All seasons',
    'Al menos 2 de 4 campañas': 'At least 2 of 4 seasons', 'Al menos 3 de 4 campañas': 'At least 3 of 4 seasons',
    'Sin fecha usamos la de referencia de la campaña. Conservar un cultivo es una decisión tuya: no se fuerza ninguno.': 'Without a date we use the season’s reference date. Keeping a crop is your decision: none is forced.',
    'Agua y riego': 'Water and irrigation',
    'Agua disponible por campaña (m³/ha)': 'Water available per season (m³/ha)', 'Pérdida por filtración del arroz (mm/día)': 'Rice seepage loss (mm/day)',
    'No lo sé: déjalo vacío': 'I don’t know: leave empty', 'Solo si la mediste': 'Only if you measured it',
    'Con tu dotación evaluamos si cada cultivo completa su ciclo. Sin ella informamos cuánta agua necesita cada uno. Para la filtración usamos el rango de la FAO (2–8 mm/día) mientras no tengas una medición.': 'With your water allocation we check whether each crop completes its cycle. Without it we report how much water each one needs. For seepage we use the FAO range (2–8 mm/day) until you have a measurement.',
    'Tus cultivos': 'Your crops',
    'Ciclo observado del arroz (días de siembra a cosecha)': 'Observed rice cycle (days from sowing to harvest)', 'Ciclo observado del Loctao (días de siembra a cosecha)': 'Observed Loctao cycle (days from sowing to harvest)',
    'Sin tu dato usamos 114 días para el arroz (observado por SENAMHI en 2026) y un rango de 59 a 90 días para el Loctao, porque aún no hay una cifra única confirmada.': 'Without your figure we use 114 days for rice (observed by SENAMHI in 2026) and a range of 59 to 90 days for Loctao, because there is no single confirmed figure yet.',
    'Arroz ya sembrado': 'Rice already sown', '(opcional; calibra el ciclo con tus fechas)': '(optional; calibrates the cycle with your dates)',
    'Fecha de siembra real': 'Actual sowing date', 'Macollaje': 'Tillering', 'Panoja': 'Panicle', 'Floración': 'Flowering', 'Maduración córnea': 'Hard ripening',
    'Suelo': 'Soil', 'Textura del suelo': 'Soil texture', 'Arenosa': 'Sandy', 'Franca / media': 'Loam / medium', 'Arcillosa': 'Clayey',
    'pH medido (análisis de suelo)': 'Measured pH (soil analysis)', 'Si no tienes análisis, déjalo vacío': 'If you have no analysis, leave empty',
    'Consultando la estimación de SoilGrids en tu punto…': 'Checking the SoilGrids estimate at your point…',
    'Lo que te cuesta y lo que esperas ganar': 'What it costs you and what you expect to earn',
    'Se usa solo si completas rendimiento, precio y algún costo para': 'Used only if you fill in yield, price and at least one cost for', 'ambos': 'both', 'cultivos. No usamos cifras de otras zonas.': 'crops. We do not use figures from other areas.',
    'Rendimiento esperado (t/ha)': 'Expected yield (t/ha)', 'Precio de venta (S/ por kg)': 'Selling price (S/ per kg)', 'Costo de establecimiento (S/ ha)': 'Establishment cost (S/ ha)',
    'Costo de riego (S/ ha)': 'Irrigation cost (S/ ha)', 'Otros costos (S/ ha)': 'Other costs (S/ ha)', 'Listo': 'Done',
    'Field Shift · rotación de cultivos con datos satelitales y de estación.': 'Field Shift · crop rotation with satellite and weather-station data.',
    'Alcance, metodología, fuentes e incertidumbre': 'Scope, methodology, sources and uncertainty',
    // mensajes de la demo
    'Elige tu cultivo actual (obligatorio).': 'Choose your current crop (required).', 'Escribe un área válida (≥ 0).': 'Enter a valid area (≥ 0).',
    'Entre 0 y 40 000 m³/ha.': 'Between 0 and 40,000 m³/ha.', 'Entre 0 y 30 mm/día.': 'Between 0 and 30 mm/day.', 'Entre 40 y 200 días.': 'Between 40 and 200 days.', 'Entre 3,5 y 9,5.': 'Between 3.5 and 9.5.',
    'Escribe un número ≥ 0.': 'Enter a number ≥ 0.', 'Las fechas observadas requieren la fecha de siembra real.': 'Observed dates require the actual sowing date.', 'Debe ser posterior a la fecha anterior.': 'Must be later than the previous date.',
    'Revisa los campos marcados en rojo en «Datos de mi parcela».': 'Check the fields marked in red in “My plot data”.', 'Completa los campos obligatorios marcados en rojo.': 'Complete the required fields marked in red.',
    'Calculando con los datos de tu punto…': 'Calculating with your point’s data…', 'Error': 'Error', 'No disponible': 'Unavailable',
    'No se pudo consultar SoilGrids.': 'Could not query SoilGrids.',
    'Ese punto está fuera de la zona de la demo (recuadro verde).': 'That point is outside the demo area (green box).',
    'Cambiaste la ubicación: pulsa «Generar recomendación» para recalcular con los datos de este punto.': 'You changed the location: press “Generate recommendation” to recalculate with this point’s data.',
    'Parcela ubicada. Pulsa «Generar recomendación».': 'Plot located. Press “Generate recommendation”.',
    'Zona de la demo (Morropón, aprox.)': 'Demo area (Morropón, approx.)', 'Estación SENAMHI Morropón': 'SENAMHI Morropón station',
    'No se pudo cargar el mapa. Escribe las coordenadas:': 'The map could not be loaded. Enter the coordinates:',
    // modo / tarjetas
    'Elegiste Precisa pero no aportaste datos utilizables: el resultado es el de la modalidad Instantánea.': 'You chose Precise but gave no usable data: the result is the Instant mode’s.',
    'incorpora datos que tú declaraste.': 'includes data you declared.', 'solo datos satelitales y de reanálisis de la zona.': 'only satellite and reanalysis data for the area.',
    'Se usó:': 'Used:', 'No se usó:': 'Not used:',
    'Rotación actual': 'Current rotation', 'Alternativa A (mayor puntaje)': 'Alternative A (highest score)', 'Alternativa A': 'Alternative A', 'Alternativa B': 'Alternative B',
    'Ver análisis detallado': 'View detailed analysis',
    'Puntaje relativo (0–100)': 'Relative score (0–100)', 'Riego neto, 4 campañas': 'Net irrigation, 4 seasons', 'Margen declarado por ha': 'Declared margin per ha', 'Días de calor, etapa media': 'Hot days, mid stage',
    'Tu rotación actual proyectada: sirve de punto de comparación.': 'Your projected current rotation: used as a baseline for comparison.',
    'Incluye campañas que los datos consideran no viables.': 'It includes seasons the data considers not viable.',
    'La leguminosa aporta nitrógeno y rompe la repetición del mismo cultivo.': 'The legume adds nitrogen and breaks the repetition of the same crop.',
    'Todas las campañas son de leguminosa: sin alternancia, la repetición del cultivo acumula plagas y enfermedades.': 'All seasons are legumes: without alternation, repeating the crop builds up pests and diseases.',
    'Opción viable con puntaje relativo distinto al de tu rotación actual.': 'Viable option with a relative score different from your current rotation.',
    'Resultado condicionado: depende de datos no declarados o de supuestos con rango. Mira «¿Cómo calculamos esta recomendación?».': 'Conditional result: it depends on undeclared data or assumptions with a range. See “How do we calculate this recommendation?”.',
    'sin evidencia local directa': 'no direct local evidence', 'depende del riego (no declarado)': 'depends on irrigation (not declared)', 'depende de la fuente de lluvia': 'depends on the rainfall source', 'fecha declarada por ti': 'date declared by you',
    'Viable': 'Viable', 'Condicionada': 'Conditional', 'No viable': 'Not viable', 'Riesgo alto': 'High risk',
    'Sin impedimento térmico': 'No thermal constraint', 'Dudosa': 'Doubtful', 'Incompatible': 'Incompatible',
    'No indicaste si tienes riego.': 'You did not say whether you have irrigation.',
    'Mostramos el': 'We show the', 'escenario con riego': 'irrigated scenario', 'y marcamos lo que depende de él: sin riego el arroz no es viable. Ambos son escenarios, no condiciones de tu parcela.': 'and flag what depends on it: without irrigation rice is not viable. Both are scenarios, not conditions of your plot.',
    'Indicar mi riego': 'Set my irrigation', 'Abrir modo Precisa': 'Open Precise mode', 'Abrir el modo Precisa': 'Open Precise mode',
    'Esta comparación considera agua, calor, suelo y rotación, pero': 'This comparison considers water, heat, soil and rotation, but', 'no incluye tu cultivo principal ni tus márgenes': 'it does not include your main crop or your margins',
    '; por eso puede favorecer al cultivo que menos agua necesita. Indícalos en el modo Precisa para afinarla.': '; so it may favor the crop that needs the least water. Enter them in Precise mode to refine it.',
    'No hay una rotación que proponer con estos datos': 'There is no rotation to propose with this data', 'Qué permitiría evaluarlo': 'What would allow evaluating it',
    'Campaña': 'Season', 'Cultivo': 'Crop', 'Estado': 'Status', 'Motivo principal': 'Main reason',
    'Cómo se puntúa esta secuencia': 'How this sequence is scored', 'Criterio': 'Criterion', 'Valor (0–100)': 'Value (0–100)', 'Peso': 'Weight',
    'Antes de puntuar se comprobó la viabilidad de cada campaña; las opciones no viables no compiten.': 'Before scoring, each season’s viability was checked; non-viable options do not compete.',
    'Por qué se propone': 'Why it is proposed', 'Riesgos y condiciones': 'Risks and conditions', 'Campaña por campaña': 'Season by season',
    'Puntaje relativo (0–100); compara opciones, no es rendimiento': 'Relative score (0–100); compares options, not a yield', 'Riego neto en cuatro campañas': 'Net irrigation over four seasons',
    // acordeones
    'Conoce cómo interpretamos tu recomendación': 'How we interpret your recommendation', '¿Cómo calculamos esta recomendación?': 'How do we calculate this recommendation?',
    'Qué datos trabajan por ti': 'What data works for you', 'Cómo verificamos los datos': 'How we verify the data', 'Cómo leer tu puntaje': 'How to read your score',
    'Qué puedes aportar para afinar el resultado': 'What you can add to refine the result', 'Parámetros en calibración': 'Parameters under calibration',
    'Lo que declaraste y cómo se usó': 'What you declared and how it was used', 'Escenarios de agua (no son condiciones de tu parcela)': 'Water scenarios (not conditions of your plot)',
    'No declaraste datos de tu parcela: el análisis usa solo información geográfica, meteorológica, satelital y bibliográfica.': 'You did not declare any plot data: the analysis uses only geographic, weather, satellite and literature information.',
    'Dato': 'Item', 'Valor': 'Value', 'Tipo': 'Type', 'De dónde sale': 'Where it comes from', 'Fuente': 'Source', 'Verificación / estado': 'Verification / status', 'Parámetro': 'Parameter', 'Rol': 'Role', 'Lluvia': 'Rainfall',
    'Lluvia por fuente (media anual 2015–2023)': 'Rainfall by source (annual mean 2015–2023)', 'principal': 'primary', 'control': 'control',
    'Un valor de tipo': 'A value of type', 'hipótesis': 'hypothesis', 'se propaga como rango y nunca se presenta como hecho; los datos': 'is propagated as a range and never presented as fact; data marked as', 'estimados': 'estimated', 'llevan su incertidumbre.': 'carry their uncertainty.',
    'Respaldo aplicado en este punto:': 'Fallback applied at this point:', 'Temperatura': 'Temperature', 'Días de calor': 'Hot days', 'Relieve y suelo': 'Terrain and soil',
    'Frecuencia observada en la estación SENAMHI Morropón (1981–2014)': 'Frequency observed at the SENAMHI Morropón station (1981–2014)', 'Serie corregida de reanálisis': 'Bias-corrected reanalysis series',
    'Los reanálisis corregidos subestiman 2–5 veces los días ≥ 35 °C; por eso usamos lo observado.': 'Corrected reanalyses underestimate days ≥ 35 °C by 2–5 times; that is why we use observations.',
    'Sin calibración mensual disponible.': 'No monthly calibration available.', 'SRTM (30 m) y SoilGrids (250 m) en tu punto': 'SRTM (30 m) and SoilGrids (250 m) at your point', 'sin dato de relieve': 'no terrain data',
    'GPM IMERG V07 (0,1°) como fuente principal; ERA5 y POWER como escenarios alternativos': 'GPM IMERG V07 (0.1°) as the primary source; ERA5 and POWER as alternative scenarios',
    'Fuente de lluvia': 'Rainfall source', 'Error mensual (mm)': 'Monthly error (mm)', 'Sesgo': 'Bias', 'Correlación (temporada ene–abr)': 'Correlation (Jan–Apr season)',
    'Comparamos cada fuente con la estación SENAMHI Morropón y usamos esa verificación para elegir y corregir los datos.': 'We compare each source with the SENAMHI Morropón station and use that check to choose and correct the data.',
    'Valores que todavía se calibran. Se informan para que veas qué puede mover una decisión; se probaron en rangos y los resultados clave se mantienen salvo la percolación del arroz cuando el agua es limitada.': 'Values still being calibrated. They are reported so you can see what could move a decision; they were tested across ranges and the key results hold except for rice percolation when water is limited.',
    // mosaicos
    'Tu siembra declarada': 'Your declared sowing', 'Clima de la zona': 'Area climate', 'Vegetación del punto (NDVI)': 'Vegetation at the point (NDVI)',
    'Consultando el clima reciente…': 'Checking recent weather…', 'No se pudo consultar el clima reciente.': 'Could not query recent weather.',
    'Último dato guardado (sin conexión, no es actual)': 'Last saved data (offline, not current)', 'Último dato disponible (desactualizado)': 'Last available data (outdated)',
    'media': 'mean', 'lluvia': 'rain',
    'Genera la recomendación para consultar el verdor de tu punto.': 'Generate the recommendation to check the greenness at your point.', 'Consultando imágenes Sentinel‑2.': 'Checking Sentinel‑2 images.',
    'No se pudo consultar Sentinel‑2.': 'Could not query Sentinel‑2.', 'Sin imágenes despejadas en el periodo.': 'No clear images in the period.', 'Qué significa': 'What it means', 'Sentinel‑2, píxel de 10 m.': 'Sentinel‑2, 10 m pixel.',
    'Fecha que ingresaste en modo Precisa (dato declarado, no verificado).': 'Date you entered in Precise mode (declared, not verified).', '¿Por qué esta fecha?': 'Why this date?',
    // detalle
    'No se pudo calcular el detalle de fechas de siembra.': 'Could not compute the sowing-date detail.', 'Fase': 'Stage', 'Días tras siembra': 'Days after sowing', 'Fecha típica': 'Typical date',
    'Observada': 'Observed', 'Diferencia (días)': 'Difference (days)', '¿Qué tan bien acertó el modo Instantánea con tu campaña?': 'How well did Instant mode match your season?',
    'Rotaciones en detalle': 'Rotations in detail', 'Todas las fechas': 'All dates', 'Tu fecha de siembra:': 'Your sowing date:',
    // indicadores
    'Confianza de los datos de tu parcela': 'Confidence in your plot’s data', 'Sin advertencias.': 'No warnings.', 'Las fuentes discrepan y no hay pluviómetro local para saber cuál acierta.': 'The sources disagree and there is no local rain gauge to tell which is right.',
    'Criterios del análisis (esquema 50 / 40 / 10)': 'Analysis criteria (50 / 40 / 10 scheme)', 'Fuentes de datos': 'Data sources', 'Qué obtiene': 'What it provides', 'Temperatura frente a SENAMHI': 'Temperature vs. SENAMHI',
    'Retroprueba del modelo': 'Model backtest', 'Fenología fuera de muestra (días)': 'Out-of-sample phenology (days)', 'Estación': 'Station', 'Observado': 'Observed', 'Modelo': 'Model', 'Variable': 'Variable',
    'Sesgo sin corregir': 'Uncorrected bias', 'RMSE validación cruzada': 'Cross-validation RMSE', 'RMSE línea base constante': 'Constant-baseline RMSE',
    'SENAMHI Morropón (estación)': 'SENAMHI Morropón (station)', 'Observaciones diarias 1963–2014: referencia para validar y corregir temperatura y lluvia, y frecuencia observada de días calurosos': 'Daily observations 1963–2014: reference to validate and correct temperature and rainfall, and observed frequency of hot days',
    'Precipitación estimada por satélite (0,1°): fuente principal de lluvia': 'Satellite-estimated precipitation (0.1°): primary rainfall source', 'Reanálisis: temperatura (modelo fijado) y lluvia como escenario alternativo': 'Reanalysis: temperature (fixed model) and rainfall as an alternative scenario',
    'Radiación, humedad, viento, y temperatura/lluvia recientes (casi tiempo real)': 'Radiation, humidity, wind, and recent temperature/rainfall (near real time)', 'Elevación y pendiente del punto (30 m)': 'Elevation and slope at the point (30 m)',
    'Propiedades estimadas del suelo en el punto (250 m, modelado)': 'Estimated soil properties at the point (250 m, modeled)', 'NDVI del punto marcado (10 m)': 'NDVI at the marked point (10 m)', 'Mapa de fondo': 'Base map',
    'Son series numéricas de baja resolución (celdas de decenas de km), salvo Sentinel‑2 (10 m): describen la zona, no la parcela.': 'These are low-resolution numeric series (cells of tens of km), except Sentinel‑2 (10 m): they describe the area, not the plot.',
    // aprende
    'Cómo funciona': 'How it works', 'Ubica tu parcela': 'Locate your plot', 'en el mapa (dentro de la zona de Morropón) y elige el cultivo actual.': 'on the map (inside the Morropón area) and choose the current crop.',
    'Reunimos datos de tu punto:': 'We gather data for your point:', 'Comprobamos la viabilidad': 'We check viability', 'Comparamos rotaciones': 'We compare rotations',
    'Conceptos': 'Concepts', 'Puntaje relativo (0–100) ': 'Relative score (0–100)', 'Sirve para comparar opciones entre sí. No es un rendimiento ni una probabilidad de éxito.': 'Used to compare options with each other. It is not a yield or a probability of success.',
    'Agua que el cultivo evapora y transpira durante su ciclo (milímetros).': 'Water the crop evaporates and transpires during its cycle (millimeters).', 'Índice de verdor medido por satélite: valores altos indican vegetación densa y activa.': 'Greenness index measured by satellite: high values indicate dense, active vegetation.',
    'Viabilidad': 'Viability', 'Primera etapa del análisis: favorable, condicionada o no viable según temperatura, agua, suelo y pendiente, propagando el desacuerdo entre fuentes de datos.': 'First stage of the analysis: favorable, conditional or not viable depending on temperature, water, soil and slope, propagating the disagreement between data sources.',
    'Campaña grande y chica': 'Large and small season', 'La grande (siembra ≈ 21 ene) y la chica (≈ 15 jul) son fechas de referencia documentadas; cambian con el año y con el agua de los canales.': 'The large season (sowing ≈ 21 Jan) and the small one (≈ 15 Jul) are documented reference dates; they change with the year and canal water.',
    'Modo Instantánea': 'Instant mode', 'Usa solo datos satelitales y de reanálisis de la zona.': 'Uses only satellite and reanalysis data for the area.', 'Modo Precisa': 'Precise mode',
    'Suma datos de tu parcela: siembra real, fechas de fases, agua disponible, cultivo principal a conservar y datos económicos. Se aplican solo los que ingreses y no se guardan.': 'Adds data from your plot: actual sowing, stage dates, available water, main crop to keep and economic data. Only what you enter is applied, and nothing is saved.',
    'Qué debes tener en cuenta': 'What to keep in mind',
    'Alcance:': 'Scope:', 'la herramienta compara opciones con arroz y frijol Loctao en el valle de Morropón.': 'the tool compares options with rice and Loctao bean in the Morropón valley.', 'No estima rendimiento ni ganancia': 'It does not estimate yield or profit', 'por sí misma: el margen solo se calcula con los datos que tú declares.': 'by itself: the margin is only calculated with the data you declare.',
    // Cropi
    'Abrir el chat con Cropi': 'Open the chat with Cropi', 'Chat con Cropi': 'Chat with Cropi', 'Te explico tu análisis': 'I’ll explain your analysis', 'Nueva conversación': 'New conversation', 'Cerrar el chat': 'Close the chat',
    'Escribe tu pregunta…': 'Type your question…', 'Tu pregunta para Cropi': 'Your question for Cropi', 'Enviar': 'Send', 'Reintentar': 'Retry',
    'Cropi explica los resultados del motor; no inventa datos ni garantiza cosechas.': 'Cropi explains the engine’s results; it does not invent data or guarantee harvests.',
    'Cropi está escribiendo': 'Cropi is typing',
    '¡Hola! Soy Cropi. Ya tengo los resultados de tu parcela. Puedo explicarte por qué el motor recomienda cada opción, los riesgos, el agua y qué datos son hipótesis. ¿Qué te gustaría entender?': 'Hi! I’m Cropi. I already have your plot’s results. I can explain why the engine recommends each option, the risks, the water and which data are hypotheses. What would you like to understand?',
    '¡Hola! Soy Cropi. Primero genera tu recomendación (elige el punto en el mapa y pulsa el botón de generar) y luego te ayudo a entenderla paso a paso.': 'Hi! I’m Cropi. First generate your recommendation (pick the point on the map and press the generate button) and then I’ll help you understand it step by step.',
    'Actualicé la conversación con tu nuevo análisis.': 'I updated the conversation with your new analysis.',
    'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.': 'No connection to the server. Check your network and try again.', 'No pude responder ahora.': 'I could not answer right now.',
    'Modo limitado: la IA (Groq) aún no está activada en este servidor; respondo con los resultados del motor.': 'Limited mode: the AI (Groq) is not yet enabled on this server; I answer with the engine’s results.',
    'No pude verificar la conexión con la IA ahora mismo; si falla, intenta de nuevo.': 'I could not verify the AI connection right now; if it fails, try again.',
    'El modelo de IA configurado no está disponible en la cuenta de Groq.': 'The configured AI model is not available in the Groq account.',
    'Escribe una pregunta.': 'Type a question.',
  };

  // ---------- patrones con números (texto completo) ----------
  const cropTr = (s) => s.replace(/Frijol Loctao/g, 'Loctao bean').replace(/Frijol común/g, 'Common bean').replace(/\bArroz\b/g, 'Rice');
  const PATTERNS = [
    [/^(\d+) dato indicado: se usan en el análisis y no se guardan\.$/, (m) => `${m[1]} item entered: used in the analysis and not saved.`],
    [/^(\d+) datos indicados: se usan en el análisis y no se guardan\.$/, (m) => `${m[1]} items entered: used in the analysis and not saved.`],
    [/^Necesita unos ([\d.,\s]+) mm menos de riego en cuatro campañas que tu rotación actual\.$/, (m) => `Needs about ${m[1]} mm less irrigation over four seasons than your current rotation.`],
    [/^Pide unos ([\d.,\s]+) mm más de riego que tu rotación actual\.$/, (m) => `Needs about ${m[1]} mm more irrigation than your current rotation.`],
    [/^Respeta (.+) como cultivo principal\.$/, (m) => `Respects ${cropTr(m[1])} as the main crop.`],
    [/^(.+) continuo$/, (m) => `${cropTr(m[1])} continuous`],
    [/^Alterna (.+) y (.+)$/, (m) => `Alternates ${cropTr(m[1])} and ${cropTr(m[2])}`],
    [/^(.+) y (.+) combinados$/, (m) => `${cropTr(m[1])} and ${cropTr(m[2])} combined`],
    [/^Alternativa ([AB])$/, (m) => `Alternative ${m[1]}`],
    [/^Secuencia \((\d+) campañas\):$/, (m) => `Sequence (${m[1]} seasons):`],
    [/^Próxima campaña (grande|chica)$/, (m) => `Next ${m[1] === 'grande' ? 'large' : 'small'} season`],
    [/^Fecha de referencia de la campaña (grande|chica); cambia con el año y con el agua de los canales\.$/, (m) => `Reference date of the ${m[1] === 'grande' ? 'large' : 'small'} season; it changes with the year and canal water.`],
    [/^Últimos (\d+) días registrados$/, (m) => `Last ${m[1]} days recorded`],
    [/^Descargando la lluvia satelital IMERG de la celda de tu punto \((\d+)\/(\d+) años\)\. Mientras tanto la lluvia sale de ERA5\/POWER y el resultado se actualizará solo\.$/, (m) => `Downloading IMERG satellite rainfall for your point’s cell (${m[1]}/${m[2]} years). Meanwhile rainfall comes from ERA5/POWER and the result will update by itself.`],
    [/^No se pudo conectar con el servidor: (.*)$/, (m) => `Could not connect to the server: ${m[1]}`],
    [/^Siembra hacia el (.+)$/, (m) => `Sowing around ${m[1]}`],
    [/^Última imagen sin nubes: (.+)$/, (m) => `Latest cloud-free image: ${m[1]}`],
  ];

  // ---------- glosario por frases (se aplica a texto compuesto, de mayor a menor) ----------
  const MONTHS_L = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', setiembre: 'September', septiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December' };
  const MONTHS_S = { ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };
  const GLOSS = [
    [/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre) de (\d{4})/g, (_, d, mo, y) => `${MONTHS_L[mo]} ${d}, ${y}`],
    [/\b(\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/g, (_, d, mo) => `${d} ${MONTHS_S[mo]}`],
    [/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\b/g, (_, mo) => MONTHS_L[mo]],
    [/(\d) días\b/g, '$1 days'], [/(\d) d\b/g, '$1 d'],
    [/Riego neto/g, 'Net irrigation'], [/riego neto/g, 'net irrigation'], [/días de calor/g, 'hot days'], [/Días de calor/g, 'Hot days'], [/lluvia/g, 'rain'], [/Lluvia/g, 'Rain'],
    [/Frijol Loctao/g, 'Loctao bean'], [/\bArroz\b/g, 'Rice'], [/Frijol común/g, 'Common bean'],
    [/Grande/g, 'Large'], [/Chica/g, 'Small'],
    [/Modo Precisa/g, 'Precise mode'], [/Modo Instantánea/g, 'Instant mode'], [/\bPrecisa\b/g, 'Precise'], [/\bInstantánea\b/g, 'Instant'],
    [/\bciclo\b/g, 'cycle'], [/\brango\b/g, 'range'], [/\bpendiente\b/g, 'slope'],
    [/Tmáx/g, 'Tmax'], [/Tmín/g, 'Tmin'], [/Referencia histórica, estación SENAMHI Morropón/g, 'Historical reference, SENAMHI Morropón station'], [/en el mes/g, 'in the month'],
    [/Del (.+?) al (.+?) ·/g, 'From $1 to $2 ·'], [/último dato válido/g, 'last valid data'], [/Puntaje relativo/g, 'Relative score'],
    [/índice (\d)/g, 'index $1'], [/neto (\d)/g, 'net $1'], [/agua (\d)/g, 'water $1'], [/calor (\d)/g, 'heat $1'],
  ];

  // Si tras el glosario aún quedan palabras funcionales del español, es prosa que no sabemos traducir: se deja entera.
  const STILL_ES = /(^|[^a-záéíóúñ])(de|del|la|el|los|las|que|con|para|una|un|por|se|es|al|su|sus|tu|tus|como|más|menos)(?![a-záéíóúñ])/i;
  function tr(text) {
    const lead = /^\s*/.exec(text)[0], trail = /\s*$/.exec(text)[0], core = N(text);
    if (!core) return text;
    let out;
    if (Object.prototype.hasOwnProperty.call(EXACT, core)) out = EXACT[core];
    else {
      const parts = core.split(/(?<=[.!?]) +/);
      if (parts.length > 1) { const ts = parts.map((p) => (Object.prototype.hasOwnProperty.call(EXACT, p) ? EXACT[p] : (PATTERNS.map(([re, fn]) => { const m = re.exec(p); return m ? fn(m) : null; }).find(Boolean) || null))); if (ts.every((x) => x != null)) out = ts.join(' '); }
      if (out == null) for (const [re, fn] of PATTERNS) { const m = re.exec(core); if (m) { out = fn(m); break; } }
      if (out == null) { let s = core; for (const [re, rep] of GLOSS) s = s.replace(re, rep); out = STILL_ES.test(s) ? core : s; }
    }
    return out === core ? text : lead + out + trail;
  }
  const T = (s) => (lang === 'en' ? tr(String(s)) : String(s));

  // ---------- aplicación al DOM ----------
  const ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];
  const SKIP = 'script,style,textarea,code,pre,.fi-me,[data-no-i18n],.leaflet-control-attribution';
  const skip = (el) => !el || (el.closest && el.closest(SKIP));
  function textNode(n) {
    if (skip(n.parentElement)) return;
    if (n.__en !== undefined && n.data === n.__en) return; // ya traducido
    const es = n.data; if (!es.trim()) return;
    const en = tr(es);
    n.__es = es; n.__en = en; if (en !== es) n.data = en; else n.__en = es;
  }
  function attrs(el) {
    if (!el.getAttribute || el.closest('[data-no-i18n]')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (v == null) continue;
      const rec = el.__esAttr || (el.__esAttr = {});
      if (rec[a] && rec[a].en === v) continue;
      const en = tr(v); rec[a] = { es: v, en }; if (en !== v) el.setAttribute(a, en);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1) return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  function restore(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.__es !== undefined && n.data === n.__en) n.data = n.__es; delete n.__es; delete n.__en; }
      else if (n.__esAttr) { for (const [a, r] of Object.entries(n.__esAttr)) if (n.getAttribute(a) === r.en) n.setAttribute(a, r.es); delete n.__esAttr; }
    }
  }

  let obs = null, busy = false;
  const OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  function onMut(records) {
    if (lang !== 'en' || busy) return;
    busy = true; obs.disconnect();
    try {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach((n) => walk(n));
        else if (r.type === 'characterData') { const n = r.target; if (n.__en !== n.data) { delete n.__en; textNode(n); } }
        else if (r.type === 'attributes') { const el = r.target, a = r.attributeName, rec = el.__esAttr && el.__esAttr[a]; if (!rec || rec.en !== el.getAttribute(a)) { if (rec) delete el.__esAttr[a]; attrs(el); } }
      }
    } finally { obs.observe(document.documentElement, OPTS); busy = false; }
  }

  function setTitle() {
    if (lang === 'en') { if (document.__esTitle === undefined) document.__esTitle = document.title; document.title = tr(document.__esTitle); }
    else if (document.__esTitle !== undefined) { document.title = document.__esTitle; }
  }
  function syncImages() { // imágenes con texto incrustado: versión en inglés
    document.querySelectorAll('img[data-src-en]').forEach((im) => { if (!im.dataset.srcEs) im.dataset.srcEs = im.getAttribute('src'); im.setAttribute('src', lang === 'en' ? im.dataset.srcEn : im.dataset.srcEs); });
  }
  function syncSelector() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-lang]').forEach((b) => { const on = b.dataset.lang === lang; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); });
  }
  function apply() {
    busy = true; if (obs) obs.disconnect();
    try { if (lang === 'en') walk(document.body); else restore(document.body); setTitle(); syncSelector(); syncImages(); }
    finally { if (obs) obs.observe(document.documentElement, OPTS); busy = false; }
  }
  function setLang(l) {
    if (l !== 'en' && l !== 'es') return;
    lang = l; try { localStorage.setItem(KEY, l); } catch { /* sin almacenamiento */ }
    apply();
    window.dispatchEvent(new CustomEvent('fieldshift:lang', { detail: { lang } }));
  }

  window.FSI18N = { T, get lang() { return lang; }, setLang, translate: tr };

  function start() {
    obs = new MutationObserver(onMut);
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
