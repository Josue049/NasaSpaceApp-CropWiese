# Fenología de arroz en Morropón 2026 (SENAMHI) y retroprueba del modelo térmico

Datos: `rice_morropon_2026_senamhi.csv` + `rice_morropon_2026_metadata.json` (aportados por el usuario; origen: reporte SENAMHI 26 may–1 jun 2026, **texto indexado, sin verificación visual del PDF**).

## Reservas declaradas en los propios metadatos
- La tabla dice **Tinajones**, la narrativa **Mallares**: variedad sin resolver.
- Las fechas son inicio de fase, no cosecha.
- Las cifras de T/lluvia por fila son reportadas por SENAMHI; **no son una serie diaria** para el modelo.
- Sin polígono de parcela; sin calibración por genotipo; las etapas Kc de FAO‑56 no equivalen a fases botánicas.
- **Morropón es Alto Piura (141 m), no Bajo Piura**; una sola temporada.

## Fenología observada (días después de siembra, DAS; siembra 2026‑01‑21)
emergencia 5 · plántula 24 · macollaje 33 · elongación 64 · panoja 79 · desarrollo de panoja 86 · **floración 93** · lechosa 102 · pastosa 107 · **córnea 114**.
Coherente con el boletín anterior (macollaje 23‑feb = 33 DAS).
Temperaturas reportadas en floración: Tmax 32,0 / Tmin 20,4 °C; en todo el ciclo Tmedia 25–28,5 °C.

## Retroprueba (`node scripts/backtest_morropon.js`, requiere red)
Modelo actual (ciclo base 150 días efectivos, EcoCrop arroz TOPMN 20–TOPMX 30 °C), siembra 21‑ene, climatología 2015–2023:

| Escenario térmico | Duración simulada |
|---|---|
| T − 1,9 °C | 150 d |
| T | **151 d** |
| T + 1,9 °C | 171 d (completa solo 56 % de los años) |

**Observado: 114 DAS a maduración córnea.** El modelo **sobreestima ~37 días (~32 %)**. Como la temperatura de la temporada (25–28 °C) está dentro del óptimo EcoCrop, la diferencia viene del **ciclo base genérico de 150 d (FAO‑56 Tabla 11)**, no de la temperatura. Además la celda POWER está a 1051 m frente a 118 m del sitio (Δ ≈ 930 m): la corrección térmica por altitud es muy incierta ahí.

**Conclusión:** para arroz en la costa norte el ciclo genérico no es adecuado; hace falta un perfil por variedad. Esto es **un solo dato** (una temporada, variedad ambigua): no justifica fijar el ciclo en 114, solo muestra el sesgo.

## Qué NO aporta
Ningún peso de criterio, rendimiento, lámina de riego ni costo. Es evidencia de **fenología/ciclo** y de **temperaturas en floración** (insumo del criterio térmico), no de ponderación.
