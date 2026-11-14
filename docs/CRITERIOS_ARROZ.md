# Criterios y subcriterios de ponderación: arroz, Bajo Piura (Cura Morí)

Rama `bajo-piura-arroz`. Documento de **diseño**: define la estructura de criterios y de qué dato sale cada subcriterio. **Ningún peso de este documento está calibrado con datos de campo.**

**Etiquetas de estado**
- ✅ **En el motor:** ya se calcula en `src/engine.js` / `src/climate.js`.
- 🟡 **Evidencia parcial:** hay un dato, pero de una temporada, otra zona o fuente sin verificar.
- ⛔ **Sin fuente:** no existe dato en el proyecto; hoy sería un supuesto.
- **[H]** hecho citado · **[C]** calculado · **[S]** supuesto de diseño · **[PV]** pendiente de validación.

---

## 1. Estructura

| # | Criterio | Qué responde | Criterio equivalente hoy |
|---|---|---|---|
| C1 | Agua | ¿Habrá agua suficiente y a qué costo hídrico? | `water`, `resilience` |
| C2 | Fenología y riesgo térmico | ¿El ciclo cabe en la campaña y escapa al calor/frío en fases sensibles? | `thermal` |
| C3 | Productividad y mercado | ¿Cuánto y a qué precio? | `market` |
| C4 | Costo de producción | ¿Cuánto cuesta producirlo? | `low_cost` |
| C5 | Suelo | ¿El suelo es apto (salinidad, textura, pH, N)? | `soil_fit`, `organic_n` |
| C6 | Sanidad | ¿Qué presión de plagas y enfermedades? | `pest` |
| C7 | Rotación y sostenibilidad | ¿Qué deja a la campaña siguiente? | rotación, `erosion` |
| M | Confianza de los datos | *No es criterio; modifica la confianza reportada.* | `confidenceFor` |

---

## 2. Subcriterios

### C1. Agua
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 1.1 Demanda hídrica del cultivo | ETc = Kc·ET₀ del ciclo (mm) | FAO‑56 Penman‑Monteith, NASA POWER | ✅ [C] |
| 1.2 Lámina total de riego | ETc + percolación + saturación de suelo (mm o m³/ha) | Hoy: factor ×0,3; falta modelo de lámina | ⛔ [S] |
| 1.3 Disponibilidad del canal | Dotación/turnos de la junta de usuarios por campaña | Junta de usuarios, ANA, proyecto Chira‑Piura | ⛔ |
| 1.4 Suficiencia hídrica | Índice ponderado 0,4·ciclo + 0,6·etapa media | `climate.js` | ✅ [C] (ponderación [PV]) |
| 1.5 Riesgo de déficit | Fracción de años con índice < 0,8 | `climate.js` | ✅ [C] |
| 1.6 Aporte de lluvia | Lluvia en el ciclo; IMERG/ERA5/POWER | ERA5 292 vs POWER 177 mm/año en Cura Morí | 🟡 conflicto entre fuentes |

### C2. Fenología y riesgo térmico
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 2.1 Duración del ciclo por variedad | Días a maduración (p. ej. 114 DAS observado en Morropón, Tinajones) | SENAMHI 2026; modelo actual usa 150 d genéricos y **sobreestima ~32 %** | 🟡 una temporada, variedad ambigua |
| 2.2 Ajuste del ciclo a la campaña | Fracción de años que completa el ciclo con T y T−δ | `climate.js` | ✅ [C] |
| 2.3 Temperatura nocturna en floración | Tmin en floración (observado 20,4 °C en Morropón) | SENAMHI: Tmin alta puede retrasar floración | 🟡 cualitativo [H]; umbral ⛔ |
| 2.4 Calor diurno en floración/panoja | Fracción de días con Tmax > umbral en etapa media | `heat_frac` con umbral genérico 35 °C | ✅ [C] (umbral [PV]) |
| 2.5 Ventana de siembra | Viable / marginal / no viable cada 15 días | `sowingWindows` | ✅ [C]; campañas reales de Piura ⛔ |
| 2.6 Incertidumbre térmica δ | √(1,9² + (1,5·Δz/1000)²) °C | POWER vs ERA5 | ✅ [C]; Δz ≈ 930 m en Morropón |

### C3. Productividad y mercado
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 3.1 Rendimiento esperado | kg/ha por variedad y campaña | Solo referencia en selva: 7750–8500 kg/ha (SENAMHI, San Martín) | ⛔ Piura; no transferible |
| 3.2 Precio / margen | S/ por kg o ingreso bruto | MIDAGRI, mercado local | ⛔ |
| 3.3 Preferencia declarada | Escala 1–5 del agricultor | Entrada del usuario | ✅ declarado |

### C4. Costo de producción
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 4.1 Costo de insumos y mano de obra | S/ por ha | MIDAGRI/INIA, junta de usuarios | ⛔ hoy ordinal 1–3 [PV] |
| 4.2 Costo del agua | Tarifa por m³ o por campaña | Junta de usuarios | ⛔ |
| 4.3 Costo de mecanización/cosecha | S/ por ha | Local | ⛔ |

### C5. Suelo
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 5.1 Salinidad / sodicidad | CE del suelo y del agua de riego | Análisis de suelo (no está en SoilGrids) | ⛔ **hipótesis a verificar** en el Bajo Piura |
| 5.2 Textura y drenaje | Arena/arcilla, percolación | SoilGrids (modelado, ~250 m) | ✅ [C] resolución gruesa |
| 5.3 pH | Ajuste al rango del cultivo (5–7,5) | SoilGrids; rango EcoCrop no verificado | 🟡 |
| 5.4 Nitrógeno y materia orgánica | Balance ordinal | Escala provisional, sin kg N/ha | ✅ ordinal [PV] |

### C6. Sanidad
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 6.1 Repetición de cultivo | −0,45 si repite cultivo | Regla de diseño | ✅ [S] |
| 6.2 Repetición de familia | −0,30 | Regla de diseño | ✅ [S] |
| 6.3 Plagas y enfermedades propias del arroz | Presión por humedad y temperatura nocturna | Literatura local | ⛔ |

### C7. Rotación y sostenibilidad
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 7.1 Efecto precultivo | +0,08 por leguminosa previa | Regla de diseño | ✅ [S] |
| 7.2 Descanso / barbecho | Campañas sin cultivo | Estaciones SENAMHI reportan «descanso» (Bernal) | 🟡 |
| 7.3 Erosión | Pendiente, lluvia intensa, cobertura | `engine.js` | ✅ [C]; poco relevante en terreno plano |
| 7.4 Cultivos alternos propios del Bajo Piura | Lista local de cultivos | Por definir con agrónomo | ⛔ |

---

## 3. Pesos: propuesta inicial (supuesto de diseño)

> **No derivada de datos.** Solo ordena la discusión; debe sustituirse por una ponderación por pares (AHP) con un agrónomo local o la junta de usuarios, y sometida al análisis de sensibilidad del motor (400 sorteos, σ = 0,35).

| Criterio | Peso propuesto | Subcriterios dentro del grupo |
|---|---:|---|
| C1 Agua | 25 % | reparto igual entre los subcriterios con dato; 1.3 y 1.2 suben cuando existan |
| C2 Fenología y riesgo térmico | 20 % | igual |
| C3 Productividad y mercado | 20 % | pasa a 3.1 + 3.2 cuando haya dato de Piura |
| C4 Costo | 15 % | igual |
| C5 Suelo | 10 % | 5.1 pasa a ser eliminatorio si se confirma salinidad alta |
| C6 Sanidad | 5 % | igual |
| C7 Rotación y sostenibilidad | 5 % | igual |
| **Total** | **100 %** | |

Reglas de aplicación:
1. Los pesos de **C1 a C4 y C6** pueden ser prioridades del agricultor (0–5), normalizadas como ahora; C2 y C5 son pesos fijos de diseño.
2. Si un subcriterio no tiene dato (⛔), **se omite y el grupo se renormaliza**; el criterio se marca de confianza baja. No se rellena con un valor inventado.
3. Los subcriterios ⛔ en C1 (1.2, 1.3) son **críticos**: sin ellos el análisis de arroz no distingue estrategias por agua, que es el factor dominante en la zona.

---

## 4. Datos que faltan, por prioridad
1. **Disponibilidad y tarifa del agua** por campaña (junta de usuarios del Bajo Piura / ANA). Cierra 1.2, 1.3, 4.2.
2. **Rendimientos y costos de arroz en Piura** (MIDAGRI, INIA, junta de usuarios). Cierra 3.1, 3.2, 4.1, 4.3.
3. **Serie diaria SENAMHI (Bernal)**: lluvia, temperatura y viento. Resuelve el conflicto entre fuentes (C1.6, 2.6).
4. **Análisis de suelo/salinidad** de parcelas de Cura Morí. Cierra 5.1.
5. **Ciclos y calendario por variedad** (Tinajones, Ferón, El Valor, IR 43) y campañas reales. Cierra 2.1, 2.5.
6. **Umbrales térmicos de floración** (literatura arrocera). Cierra 2.3.
7. **Validación del agrónomo local** de toda la tabla.

## 5. Fuentes en el repositorio
- `docs/evidence/senamhi_boletin_arroz_2026-03.md`
- `docs/evidence/morropon_2026_backtest.md`
- `docs/METODOLOGIA.md` (criterios actuales y fórmulas)
