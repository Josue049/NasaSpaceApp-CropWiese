# Cierre del MVP: auditoría de parámetros y modos Instantánea / Precisa

Rama `feat/fieldshift-morropon-validation`. **Regla fundamental:** podemos trabajar con estimaciones científicas justificadas, pero nunca fabricar datos para completar el modelo ni presentar hipótesis como hechos.

Documentos generados (reproducibles):
- `docs/AUDITORIA_PARAMETROS.md` — inventario de 59 parámetros con categoría A–E, fuente, método, incertidumbre, efecto y si lo puede dar el agricultor (`node scripts/auditar_parametros.js`).
- `docs/PRECISA_SENSIBILIDAD.md` — cada campo de Precisa modificado de forma aislada (`node scripts/sensibilidad_precisa.js`).
- `docs/COMPARACION_MOTORES.md` — antes/después y sensibilidades (`node scripts/comparar_motores.js`).
- `docs/MOTOR_V2.md` — arquitectura del motor.

## Qué cambió en esta auditoría

| Hallazgo (valor asumido en silencio) | Corrección |
|---|---|
| El servidor y la interfaz **asumían riego** (`irrigation !== false`, casilla marcada) | Riego de tres estados: sí / no / **no lo sé**. «No lo sé» se evalúa como **escenario** (con riego sin límite) y se marca como condicionado lo que depende del riego; ambos escenarios se rotulan como escenarios, no como condiciones de la parcela |
| Área = 1 ha, cultivo actual = arroz y campaña anterior = arroz preseleccionados | Área vacía (opcional); cultivo actual «— elige —» (obligatorio); campaña anterior «No lo sé» (solo se usa el cultivo actual y se rotula «proyectado») |
| Campaña inicial fija (grande) | Por defecto la próxima campaña de referencia según la fecha de hoy |
| Ciclo del Loctao = 59 d y umbral de calor = 35 °C como valores únicos | **Hipótesis (E)** propagadas como rango (ciclo 59/75/90 d; umbral 32/35/38 °C); el ciclo declarado fija el valor. Se muestran rangos en la línea de tiempo |
| Umbral de calor del arroz = 35 °C | Hipótesis (E) propagada 33/35/37 °C |
| Percolación 5 mm/d como valor central único | Rango FAO 2–8 propagado; con textura declarada se usa el valor FAO de esa textura; con percolación declarada, la del agricultor |
| Umbrales metodológicos (ETa/ETc < 0,5; pendiente > 25 %) podían volver «inviable» una campaña | «Inviable» **solo por límites documentados** (ciclo que no cabe, altitud/pH fuera del rango absoluto, arroz sin riego). Los umbrales metodológicos dan «condicionada» de riesgo alto y esa campaña no se propone como alternativa mientras exista otra |
| Pesos de las fuentes de lluvia (IMERG 0,65…) tratados como definitivos | Se rotulan **estimados** (validados 2001–2014, no 2015–2023); la clasificación se recalcula con pesos iguales y, si cambia, se muestra la más cautelosa y se avisa |
| Prioridades neutras contaban como «declaradas» | Solo se consideran declaradas si alguna difiere de la neutra |
| Campos sin efecto en cálculos (variedad, método de establecimiento, tipo de riego) | Eliminados del formulario (el backend aún los acepta como informativos) |

## Comportamiento de Instantánea

- Funciona sin formulario extenso: ubicación + cultivo actual.
- No inventa riego, volumen de agua, fecha de siembra distinta de la de referencia, rendimiento, costo, textura, variedad ni manejo.
- Con datos faltantes: escenarios explícitos (agua), rangos (ciclo, calor, percolación), omisión de lo no evaluable (economía, fitosanidad) y clasificación «condicionada» con la razón. Cada tarjeta muestra «Resultado condicionado» si el resultado depende de datos no declarados o de supuestos con rango.
- Cada respuesta incluye `provenance` (categorías A–E de los datos realmente usados), `inputs_used`, `water_scenarios` y `engine_params`. La interfaz los muestra en «¿Cómo calculamos esta recomendación?».

## Parámetros del modo Precisa (opcionales, «No lo sé» = vacío = no declarado, nunca cero)

Fecha prevista de siembra (1.ª campaña) · cultivo principal a conservar · riego (sí/no/no sé) · agua por campaña (m³/ha) · percolación del arroz medida · ciclo observado (arroz, Loctao) · fechas observadas del arroz ya sembrado · textura del suelo · pH medido · rendimiento, precio y costos.
Todos cambian al menos un componente del análisis (ver `PRECISA_SENSIBILIDAD.md`). Las únicas variantes sin efecto tienen explicación: la economía incompleta no puntúa por diseño (se informa lo que falta) y «Loctao en ≥ 3 campañas» no es restrictiva cuando el ganador ya la cumple.

## Parámetros que NO se piden al agricultor
Kc, umbrales térmicos de los cultivos, pesos de confiabilidad de las fuentes, umbrales de viabilidad, percolación sin medición y penalizaciones de rotación. Se conservan como valores bibliográficos, estimaciones o rangos explícitos, o se omiten.

## Qué sigue pendiente de validación (no activar como definitivo)
1. **Umbral de calor del Loctao y del arroz** (E, decisivo: cambia el porcentaje de días de calor de 4 % a 67 % y el puntaje).
2. **Ciclo del Loctao** (E): 54–90 d hasta contar con la ficha de la variedad (INIA/DRAP).
3. **Percolación del arroz** (B, sin medición local; decisiva con agua limitada).
4. **Penalización por repetir cultivo** (E, decisiva: cambia el ganador con ×0 o ×2).
5. **Pesos de las fuentes de lluvia** para 2015–2023 y la **calibración de temperatura** (hipótesis de sesgo estable).
6. **Ordinales** de cobertura, biomasa y nitrógeno; **riesgos fitosanitarios** (no investigados).
7. **Pendiente máxima del arroz inundado** (desactivada, sin valor citable).
8. **Fecha de las campañas** como referencia, no calendario fijo.

Cuando alguno de estos cambia el resultado, la recomendación se marca **«condicionada / sensible a supuestos»** y no se presenta como definitiva.
