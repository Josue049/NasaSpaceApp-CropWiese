# Hoja de validación para un agrónomo local (Alto Mayo / San Martín)

Objetivo: que una persona con conocimiento agronómico local revise, en ≈ 1 hora, lo que el modelo **supone** y no ha podido verificar. Marcar cada fila: ✔ correcto / ✎ corregir (anotar valor y fuente) / ? no sé.

## A. Ciclos y campañas (data/crops.json → `cycle`)
| Cultivo | Ciclo del modelo (días) | Origen | ✔/✎/? | Valor local y fuente |
|---|---|---|---|---|
| Maíz amarillo duro | 135 | Sin fuente (FAO‑56 da 180 d) | | |
| Arroz | 150 | FAO‑56 Tabla 11 | | |
| Frijol | 110 | FAO‑56 Tabla 11 | | |
| Caupí | 85 | Sin fuente (FAO 100 d) | | |
| Soya | 110 | Sin fuente | | |
| Maní | 130 | FAO‑56 Tabla 11 | | |
| Camote | 150 | FAO‑56 Tabla 11 | | |
| Tomate | 145 | Sin fuente (FAO 135 d) | | |
| Zapallo | 100 | FAO‑56 Tabla 11 | | |
| Mucuna (abono verde) | 120 | Sin fuente | | |

¿Las campañas modeladas (siembra 1 nov y 15 abr) corresponden a las campañas reales de la zona?

## B. Reglas eliminatorias (docs/METODOLOGIA.md §3–4)
1. ¿Es correcto que **dos solanáceas seguidas** se descarten, y que el **mismo cultivo 3 veces seguidas** se descarte?
2. ¿Es razonable **máx. 1 campaña de abono verde en 4**? ¿Qué abonos verdes usa realmente la zona (mucuna, canavalia, otros)?
3. Con **pendiente > 25 %** el modelo exige cobertura ≥ 0,5. ¿Qué umbral usaría en la zona?
4. El arroz sin riego se descarta. ¿Hay arroz de secano/altura que deba permitirse?

## C. Escalas ordinales (juicio del equipo, SIN fuente) — la mayor debilidad
Para cada cultivo: **cobertura del suelo**, **biomasa/rastrojo**, **balance de N** (−2…+2), **costo** (1–3), **sensibilidad a encharcamiento** (0–1). ¿Estás de acuerdo con el orden relativo entre cultivos? Señalar los que ordenarías distinto.

## D. Suelo y agua
- Capacidad de agua disponible usada: 110 mm/m (70 si arenoso, 120 si arcilloso). ¿Sirve para suelos de Moyobamba/Alto Mayo? ¿Profundidad efectiva típica de raíces?
- ¿Suelos con pH 4–5 son comunes? (SoilGrids da pH 4,0–7,2 como intervalo, muy amplio). ¿Qué encalado se hace?

## E. Mercado
Las preferencias de mercado y los costos se declaran por el agricultor; el modelo no tiene precios. ¿Qué cultivos de esta lista no tienen demanda real local?

## F. Lluvia
Moyobamba: IMERG 1407, ERA5 1503, POWER 943 mm/año (2015–2023). ¿Cuál se acerca a lo que registra la estación local o a lo que observa el agricultor?

*Esta hoja no valida nada por sí misma; recoge correcciones que luego se incorporan a `data/crops.json` con su fuente.*
