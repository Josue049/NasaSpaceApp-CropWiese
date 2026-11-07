# Guion de presentación (≈ 3 min) y preguntas del jurado

> Todo lo dicho debe coincidir con `ESTADO.md`. No afirmar mejoras de rendimiento ni de suelo.

## Guion (v0.2)
1. **Problema (20 s).** Un agricultor decide qué sembrar por costumbre y precio. Repetir cultivos acumula plagas y agota nutrientes, el clima cambia las ventanas, y los datos satelitales no coinciden entre sí. Una herramienta que recomienda sin decir cuándo **no** debe recomendar es peligrosa.
2. **Innovación (30 s).** (a) Cada rotación se evalúa con **tres productos de lluvia** y se comunica la discrepancia; (b) la temperatura se corrige por altitud y su **incertidumbre se propaga** al ciclo del cultivo (tiempo térmico EcoCrop); (c) el sistema declara si dos estrategias son **prácticamente equivalentes** y se **niega a recomendar** donde los datos no son fiables (Rioja, Tingo María, Cusco, Lima).
3. **Demo (90 s).** (i) `/?demo=1`: Moyobamba, maíz cuatro campañas seguidas → banner de soporte «limitado» (lluvias 943/1407/1505 mm), tres estrategias, veredicto «A y B prácticamente equivalentes; ambas claramente preferibles a la actual», tabla de ventanas de siembra. (ii) `/?lat=-6.23&lon=-77.87` (Chachapoyas, 2353 m): frijol es el único cultivo viable → «sin alternativa». (iii) `/?lat=-6.00&lon=-77.25` (Rioja): «no es responsable recomendar», con la causa (celda POWER 1234 m distinta).
4. **Honestidad (30 s).** Índices comparativos, no rendimientos. Escalas ordinales (N, biomasa, costo) sin fuente; parámetros térmicos por especie, no por variedad; ningún sitio validado con pluviómetro local ni con agrónomo. Próximo paso: pluviómetro SENAMHI (descarga manual) y la hoja de validación `HOJA_AGRONOMO.md`.

## Preguntas críticas y respuesta sincera
- **¿Los datos NASA son indispensables?** Sí: sin radiación/temperatura/humedad POWER no hay ET₀, y sin IMERG la lluvia primaria cambia. Cambiar el dato cambia la recomendación (prueba de escenarios y de fuentes).
- **¿Por qué no usó POWER para la lluvia?** En este punto da 67 % de IMERG V07 y diverge desde 2020 (`DATA_VALIDATION.md`). Ojo: POWER `PRECTOTCORR` está corregida con pluviómetros, así que su buen acuerdo con estaciones lejanas no es una comparación independiente (AUDITORIA §3). No sabemos cuál cifra es la correcta en Moyobamba.
- **¿Cuál lluvia es la correcta?** No lo sabemos: solo hay dos estaciones GHCN lejanas y con huecos, ninguna en Moyobamba. Por eso mostramos la conclusión bajo las tres.
- **¿Qué pasa en clima frío?** El frío alarga el ciclo (tiempo térmico EcoCrop) y excluye cultivos que no lo completan; con el 15,9 °C de Chachapoyas solo el frijol es viable. El gradiente −6,5 °C/km y los rangos por especie son supuestos con incertidumbre explícita (±1,9 °C o más).
- **¿Dónde está la IA?** No la usamos a propósito: sin datos de campo no hay entrenamiento ni validación posibles, y el motor de reglas es auditable.
- **¿Cuánto N fija la leguminosa / cuánto mejora el suelo?** No lo estimamos. Usamos escalas ordinales declaradas.
- **¿Funciona a nivel de parcela?** No: los datos son de 10–55 km; solo la pendiente y el suelo tienen resolución mayor, y el suelo es modelado con incertidumbre alta.
- **¿Está validado agronómicamente?** No. Es la prioridad inmediata.
- **¿Qué lo diferencia de MapBiomas u otras herramientas?** No hemos hecho una revisión exhaustiva de competidores (pendiente). Nuestro aporte propuesto: comparación explicable de secuencias por parcela con robustez entre productos de datos y trazabilidad por dato.
- **¿Y el café y cacao de la zona?** Quedan fuera: son perennes.
