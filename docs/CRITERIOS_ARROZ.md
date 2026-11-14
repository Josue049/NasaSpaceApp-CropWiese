# Criterios y subcriterios de ponderación: arroz Tinajones, Morropón (Alto Piura)

Rama `bajo-piura-arroz`. Documento de **diseño**: define la estructura de criterios y de qué dato sale cada subcriterio. **Ningún peso de este documento está calibrado con datos de campo.**

**Historial de cambios**
- Se **eliminaron** los criterios C3 (Productividad y mercado), C4 (Costo de producción), C5 (Suelo) y C6 (Sanidad), por decisión del equipo. La numeración original se conserva (C1, C2, C7) para no romper referencias.
- El dominio pasó de «Bajo Piura (Cura Morí)» a **Morropón, Alto Piura**.

**Etiquetas de estado**
- ✅ **En el motor:** ya se calcula en `src/engine.js` / `src/climate.js` / `src/rice.js`.
- 🟡 **Evidencia parcial:** hay un dato, pero de una temporada, otra zona o fuente sin verificar.
- ⛔ **Sin fuente:** no existe dato en el proyecto; hoy sería un supuesto.
- **[H]** hecho citado · **[C]** calculado · **[S]** supuesto de diseño · **[PV]** pendiente de validación.

---

## 1. Estructura

| # | Criterio | Qué responde |
|---|---|---|
| C1 | Agua | ¿Habrá agua suficiente y cuánta se demanda? |
| C2 | Fenología y riesgo térmico | ¿El ciclo cabe en la campaña y escapa al calor/frío en fases sensibles? |
| C7 | Rotación y sostenibilidad | ¿Qué deja a la campaña siguiente? |
| M | Confianza de los datos | *No es criterio; modifica la confianza reportada.* |

---

## 2. Subcriterios

### C1. Agua
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 1.1 Demanda hídrica del cultivo | ETc = Kc·ET₀ del ciclo (mm) | FAO‑56 Penman‑Monteith, NASA POWER | ✅ [C] |
| 1.2 Lámina total de riego | ETc + percolación + saturación de suelo (mm o m³/ha) | Hoy: factor ×0,3 en el motor genérico; en la demo, ETc − lluvia sin percolación | ⛔ [S] |
| 1.3 Disponibilidad del canal | Dotación/turnos por campaña. El Alto Piura no tiene riego regulado y el agua superficial se redujo (Mesa de Concertación, 2020) | Junta de usuarios, ANA | ⛔ |
| 1.4 Suficiencia hídrica | Índice ponderado 0,4·ciclo + 0,6·etapa media | `climate.js` | ✅ [C] (ponderación [PV]) |
| 1.5 Riesgo de déficit | Fracción de años con índice < 0,8 | `climate.js` | ✅ [C] |
| 1.6 Aporte de lluvia | Lluvia en el ciclo; IMERG/ERA5/POWER | ERA5 y POWER discrepan mucho en Morropón (908 vs 336 mm/año) | 🟡 conflicto entre fuentes |

### C2. Fenología y riesgo térmico
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 2.1 Duración del ciclo por variedad | Días a maduración (114 DAS observado en Morropón, Tinajones) | SENAMHI 2026; el ciclo genérico de 150 d sobreestimaba ~32 % | 🟡 una temporada, variedad ambigua (Tinajones vs. Mallares) |
| 2.2 Ajuste del ciclo a la campaña | Fracción de años que completa el ciclo con T y T−δ | `climate.js`, `rice.js` | ✅ [C] |
| 2.3 Temperatura nocturna en floración | Tmin en floración (observado 20,4 °C) | SENAMHI: Tmin alta puede retrasar floración | 🟡 cualitativo [H]; umbral ⛔ (se muestra, no se puntúa) |
| 2.4 Calor diurno en floración/panoja | Fracción de días con Tmax > 35 °C en la ventana de floración | `rice.js` con umbral genérico | ✅ [C] (umbral [PV]) |
| 2.5 Ventana de siembra | Viable / marginal / no viable cada 10 días | `rice.js` | ✅ [C]; calendario de campañas reales ⛔ |
| 2.6 Incertidumbre térmica | δ = √(1,9² + (1,5·Δz/1000)²) °C; sesgo medido contra SENAMHI | POWER vs ERA5 y SENAMHI Morropón | ✅ [C]; corrección empírica de una temporada |

### C7. Rotación y sostenibilidad
| Subcriterio | Indicador | Fuente / método | Estado |
|---|---|---|---|
| 7.1 Efecto precultivo | +0,08 por leguminosa previa | Regla de diseño | ✅ [S] |
| 7.2 Repetición de cultivo/familia | Penalización por repetir | Regla de diseño | ✅ [S] |
| 7.3 Descanso / barbecho | Campañas sin cultivo | Estaciones SENAMHI reportan «descanso» | 🟡 |
| 7.4 Cultivos alternos propios del Alto Piura | Lista local de cultivos | Evidencia parcial: frijol (SENAMHI 2024), caupí (regional), maíz (nota 2015); **lista pendiente de confirmar** | 🟡 |

---

## 3. Pesos: propuesta inicial (supuesto de diseño)

> **No derivada de datos.** Solo ordena la discusión; debe sustituirse por una ponderación por pares (AHP) con un agrónomo local o la junta de usuarios, y someterse al análisis de sensibilidad del motor.

Se conservan las proporciones de la propuesta anterior (agua 25 : fenología 20 : rotación 5) renormalizadas a 100 %:

| Criterio | Peso propuesto |
|---|---:|
| C1 Agua | 50 % |
| C2 Fenología y riesgo térmico | 40 % |
| C7 Rotación y sostenibilidad | 10 % |
| **Total** | **100 %** |

Reglas de aplicación:
1. Si un subcriterio no tiene dato (⛔), **se omite y el grupo se renormaliza**; el criterio se marca de confianza baja. No se rellena con un valor inventado.
2. Los subcriterios ⛔ de C1 (1.2 y 1.3) son **críticos**: sin ellos el análisis no distingue estrategias por agua.
3. **Sin los criterios económicos eliminados (productividad, mercado, costo) y sin suelo ni sanidad, la herramienta no estima ganancia, rendimiento, costo ni aptitud del suelo:** solo compara agua, fenología/riesgo térmico y rotación.

---

## 4. Datos que faltan, por prioridad
1. **Disponibilidad del agua** por campaña (junta de usuarios del Alto Piura / ANA). Cierra 1.2 y 1.3.
2. **Serie diaria SENAMHI** de la estación Morropón: lluvia, temperatura y viento. Resuelve el conflicto entre fuentes (1.6, 2.6).
3. **Ciclos y calendario por variedad** (Tinajones, Mallares, otras) y campañas reales. Cierra 2.1 y 2.5.
4. **Umbrales térmicos de floración** (literatura arrocera). Cierra 2.3.
5. **Lista confirmada de cultivos alternos** del Alto Piura con parámetros y fuente. Cierra 7.4.
6. **Validación del agrónomo local** de toda la tabla.

## 5. Fuentes en el repositorio
- `docs/evidence/senamhi_boletin_arroz_2026-03.md`
- `docs/evidence/morropon_2026_backtest.md`
- `docs/METODOLOGIA.md` (criterios actuales del motor genérico y fórmulas)
- `docs/revision_externa/` (revisión de pesos y de integración con `climate.js`)
