# Guion de presentación (≈ 3 min) y preguntas del jurado

> Todo lo dicho debe coincidir con `ESTADO.md`. No afirmar mejoras de rendimiento ni de suelo.

## Guion
1. **Problema (20 s).** Un agricultor decide qué sembrar con costumbre y precio. Repetir cultivos acumula plagas y agota nutrientes, y el clima cambia las ventanas. Decidir con evidencia es difícil porque los datos satelitales no coinciden.
2. **Demo (90 s)** en `/?demo=1`: Moyobamba, maíz cuatro campañas seguidas. Mostrar (a) diagnóstico con etiquetas Satélite/Reanálisis/Estimado/Declarado, (b) **banner: las fuentes de lluvia discrepan (1 607 / 1 505 / 943 mm)**, (c) tres estrategias, (d) por qué, riesgos y supuestos, (e) tabla «¿qué tan firme es la conclusión?».
3. **Ciencia (40 s).** ET₀ FAO‑56 con datos NASA POWER; lluvia IMERG; balance hídrico diario; reglas agronómicas; pesos del agricultor; 300 perturbaciones de pesos; evaluación bajo cada fuente de lluvia.
4. **Honestidad (20 s).** Índices comparativos, no predicciones; reglas pendientes de validación agronómica; próximo paso: pluviómetro SENAMHI y un técnico local.

## Preguntas críticas y respuesta sincera
- **¿Los datos NASA son indispensables?** Sí: sin radiación/temperatura/humedad POWER no hay ET₀, y sin IMERG la lluvia primaria cambia. Cambiar el dato cambia la recomendación (prueba de escenarios y de fuentes).
- **¿Por qué no usó POWER para la lluvia?** Porque en este punto da 59 % de IMERG y diverge desde 2020; lo documentamos (`DATA_VALIDATION.md`). No sabemos la causa.
- **¿Cuál lluvia es la correcta?** No lo sabemos: ninguna se validó con pluviómetro. Por eso mostramos la conclusión bajo las tres.
- **¿Dónde está la IA?** No la usamos a propósito: sin datos de campo no hay entrenamiento ni validación posibles, y el motor de reglas es auditable.
- **¿Cuánto N fija la leguminosa / cuánto mejora el suelo?** No lo estimamos. Usamos escalas ordinales declaradas.
- **¿Funciona a nivel de parcela?** No: los datos son de 10–55 km; solo la pendiente y el suelo tienen resolución mayor, y el suelo es modelado con incertidumbre alta.
- **¿Está validado agronómicamente?** No. Es la prioridad inmediata.
- **¿Qué lo diferencia de MapBiomas u otras herramientas?** No hemos hecho una revisión exhaustiva de competidores (pendiente). Nuestro aporte propuesto: comparación explicable de secuencias por parcela con robustez entre productos de datos y trazabilidad por dato.
- **¿Y el café y cacao de la zona?** Quedan fuera: son perennes.
