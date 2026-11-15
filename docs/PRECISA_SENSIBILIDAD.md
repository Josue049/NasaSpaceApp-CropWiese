# ¿Precisa es realmente más preciso? Sensibilidad de cada campo

> Generado por `node scripts/sensibilidad_precisa.js`. Base = modo Instantánea en el centro (nada declarado: riego «no lo sé», campaña grande, historial arroz–arroz).

**Base:** ganador LLAL (61), «claramente_preferible», sensible a supuestos: sí; estabilidad del ganador 0. Viabilidad: arroz.A condicionada:moderada · arroz.B condicionada:moderada · loctao.A condicionada:moderada · loctao.B condicionada:moderada

| Campo | Valor | Qué cambia respecto de la base |
|---|---|---|
| Riego | sí (sin volumen) | viabilidad: arroz.A condicionada:moderada→favorable, arroz.B condicionada:moderada→favorable, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; estabilidad del ganador: 0→0.05; procedencia: riego E→C |
| Riego | no (secano) | viabilidad: arroz.A condicionada:moderada→inviable, arroz.B condicionada:moderada→inviable, loctao.B condicionada:moderada→condicionada:alta; ganador: LLAL→—; puntaje de la actual: 34→35.2; sensibilidad a supuestos: sí→no; veredicto: claramente_preferible→—; pasa a «sin alternativa recomendable»; procedencia: riego E→C |
| Agua por campaña | 15 000 m³/ha | viabilidad: arroz.A condicionada:moderada→favorable, arroz.B condicionada:moderada→favorable, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; ganador: LLAL→LALA; puntaje de la actual: 34→45.2; sensibilidad a supuestos: sí→no; procedencia: riego E→C |
| Agua por campaña | 9 000 m³/ha | viabilidad: loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; ganador: LLAL→LLLL; puntaje de la actual: 34→38.7; sensibilidad a supuestos: sí→no; veredicto: claramente_preferible→probablemente_preferible; procedencia: riego E→C |
| Agua por campaña | 4 000 m³/ha | viabilidad: arroz.A condicionada:moderada→condicionada:alta, arroz.B condicionada:moderada→condicionada:alta, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; ganador: LLAL→LLLL; puntaje de la actual: 34→35.2; sensibilidad a supuestos: sí→no; veredicto: claramente_preferible→probablemente_preferible; procedencia: riego E→C |
| Percolación del arroz | 2 mm/d | viabilidad: arroz.A condicionada:moderada→favorable, arroz.B condicionada:moderada→favorable, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; demanda de agua: arroz.A 1067→722 mm, arroz.B 1350→1008 mm; puntaje de la alternativa: 61→60.8; puntaje de la actual: 34→35; estabilidad del ganador: 0→0.08; procedencia: riego E→C, percolacion B→C; criterios del puntaje |
| Percolación del arroz | 8 mm/d | viabilidad: arroz.A condicionada:moderada→favorable, arroz.B condicionada:moderada→favorable, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; demanda de agua: arroz.A 1067→1412 mm, arroz.B 1350→1692 mm; puntaje de la alternativa: 61→61.1; puntaje de la actual: 34→33.5; estabilidad del ganador: 0→0.08; procedencia: riego E→C, percolacion B→C; criterios del puntaje |
| Textura del suelo | arenosa | viabilidad: arroz.A condicionada:moderada→favorable, arroz.B condicionada:moderada→favorable, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; demanda de agua: arroz.A 1067→1412 mm, arroz.B 1350→1692 mm; puntaje de la alternativa: 61→61.1; puntaje de la actual: 34→33.5; estabilidad del ganador: 0→0.08; procedencia: riego E→C, textura D→C; criterios del puntaje |
| Textura del suelo | arcillosa | viabilidad: arroz.A condicionada:moderada→favorable, arroz.B condicionada:moderada→favorable, loctao.A condicionada:moderada→favorable, loctao.B condicionada:moderada→favorable; demanda de agua: arroz.A 1067→814 mm, arroz.B 1350→1108 mm; puntaje de la alternativa: 61→60.5; puntaje de la actual: 34→35; estabilidad del ganador: 0→0.08; procedencia: riego E→C, textura D→C; criterios del puntaje |
| pH medido | 5,0 | puntaje de la alternativa: 61→59.6; procedencia: ph D→C; criterios del puntaje |
| pH medido | 7,0 | puntaje de la alternativa: 61→61.5; procedencia: ph D→C; criterios del puntaje |
| pH medido | 8,8 (sobre el absoluto del Loctao) | viabilidad: loctao.A condicionada:moderada→inviable, loctao.B condicionada:moderada→inviable; ganador: LLAL→—; puntaje de la actual: 34→29; sensibilidad a supuestos: sí→no; veredicto: claramente_preferible→—; pasa a «sin alternativa recomendable»; procedencia: ph D→C |
| Fecha prevista de siembra | 1 mar | puntaje de la alternativa: 61→61.9; puntaje de la actual: 34→35.9; procedencia: campanas B→C; criterios del puntaje |
| Fecha prevista de siembra | 1 jun | puntaje de la alternativa: 61→66.1; puntaje de la actual: 34→35.7; procedencia: campanas B→C; criterios del puntaje |
| Fecha prevista de siembra | 15 oct | puntaje de la alternativa: 61→62; puntaje de la actual: 34→30.2; procedencia: campanas B→C; criterios del puntaje |
| Ciclo del Loctao | 54 d | demanda de agua: loctao.B 232→157 mm; duración: loctao.A 75→54 d, loctao.B 75→54 d; puntaje de la alternativa: 61→61.2; procedencia: ciclo_loctao E→C; criterios del puntaje |
| Ciclo del Loctao | 90 d | demanda de agua: loctao.B 232→287 mm; duración: loctao.A 75→90 d, loctao.B 75→90 d; ganador: LLAL→LALA; procedencia: ciclo_loctao E→C |
| Ciclo del arroz | 100 d | demanda de agua: arroz.A 1067→939 mm, arroz.B 1350→1196 mm; duración: arroz.A 115→101 d, arroz.B 114→100 d; puntaje de la alternativa: 61→59.3; puntaje de la actual: 34→31.8; procedencia: ciclo_arroz A→C; criterios del puntaje |
| Ciclo del arroz | 130 d | demanda de agua: arroz.A 1067→1218 mm, arroz.B 1350→1518 mm; duración: arroz.A 115→131 d, arroz.B 114→130 d; puntaje de la alternativa: 61→62; puntaje de la actual: 34→35.3; procedencia: ciclo_arroz A→C; criterios del puntaje |
| Cultivo principal | arroz en las grandes | ganador: LLAL→ALAL; veredicto: claramente_preferible→probablemente_preferible |
| Cultivo principal | Loctao en ≥ 3 campañas | **sin cambios** |
| Economía | completa | puntaje de la alternativa: 61→63.8; puntaje de la actual: 34→27.2; criterios del puntaje |
| Economía | incompleta (solo arroz) | **sin cambios** |
| Historial | campaña anterior desconocida | **sin cambios** |
| Historial | Loctao antes | puntaje de la actual: 34→59.4; veredicto: claramente_preferible→equivalentes |
| Prioridad de agua | 5 | puntaje de la alternativa: 61→62.6; puntaje de la actual: 34→30.7; procedencia: prioridades E→C; criterios del puntaje |
| Prioridad de plagas | 5 | ganador: LLAL→LALA; puntaje de la actual: 34→29.2; procedencia: prioridades E→C |

## Resumen

- Campos que cambian algún componente: Riego, Agua por campaña, Percolación del arroz, Textura del suelo, pH medido, Fecha prevista de siembra, Ciclo del Loctao, Ciclo del arroz, Cultivo principal, Economía, Historial, Prioridad de agua, Prioridad de plagas.
- Campos sin efecto en ninguna variante: ninguno.
- Que un campo no cambie siempre al ganador es aceptable: lo importante es que intervenga en viabilidad, agua, calor, puntaje o incertidumbre cuando es relevante.
