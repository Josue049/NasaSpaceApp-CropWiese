# Field Shift

Herramienta de apoyo a decisiones para **comparar estrategias de rotación de cultivos por parcela** con datos de observación terrestre NASA, suelos, características de cultivos y prioridades del agricultor. Proyecto para el *NASA Space Apps Challenge 2026 – Field Shift: Adapting Farms with NASA Data*.

> **Estado: prototipo funcional v0.1 (demostración).** Los resultados son índices relativos calculados con datos de baja resolución y reglas agronómicas **provisionales, aún no validadas por un agrónomo**. No son predicciones de rendimiento ni prueba de mejora del suelo.

## Qué hace

1. El agricultor ubica su parcela, declara sus últimos cultivos, riego y prioridades.
2. El sistema consulta datos reales (NASA POWER, NASA GPM IMERG, SRTM, SoilGrids, ERA5 como control).
3. Calcula ET₀ (FAO‑56 Penman‑Monteith) y simula un **balance hídrico diario** por cultivo y campaña.
4. Aplica **reglas eliminatorias** y una **evaluación multicriterio explicable** sobre ~5 000 secuencias de 4 campañas.
5. Muestra 3 estrategias (la actual proyectada + 2 alternativas) con riesgos, supuestos, incertidumbre y **robustez frente a las distintas fuentes de lluvia**.

## Ejecutar

Requisitos: Node.js ≥ 20 (probado con 22.12). **Sin dependencias npm.**

```bash
npm start                 # http://localhost:3000
# Caso demo con un clic:  http://localhost:3000/?demo=1
npm test                  # 25 pruebas, sin red (usan data/demo)
npm run validate-data     # regenera docs/DATA_VALIDATION.md
```

El caso demo (Moyobamba, −6.034, −76.971) funciona **sin conexión** gracias a la instantánea real de `data/demo` (fechas de consulta en cada archivo). Para otras ubicaciones se necesita internet: POWER, ERA5, SRTM y SoilGrids tardan segundos; **IMERG tarda ~2–4 min** (el servidor lo descarga en segundo plano y la interfaz se actualiza sola; mientras tanto usa ERA5/POWER y lo avisa).

## Estructura

| Ruta | Contenido |
|---|---|
| `src/climate.js` | ET₀ FAO‑56, Kc por etapas, balance hídrico diario (ETa/ETc) |
| `src/engine.js` | Reglas eliminatorias, criterios, pesos, robustez, sensibilidad, explicaciones |
| `src/datasources.js`, `src/imerg.js` | Acceso a datos con caché, procedencia y degradación controlada |
| `src/pipeline.js` | Orquestación datos → climas por fuente → motor |
| `data/crops.json` | Base de conocimiento de 10 cultivos (**provisional**) |
| `data/demo/` | Instantánea real reproducible del caso demo |
| `server.js`, `public/` | API + app móvil (web, sin framework) |
| `test/` | Pruebas automatizadas |
| `docs/` | Metodología, fuentes, decisiones, validación de datos, estado, guion |

## Documentación

- [`docs/ESTADO.md`](docs/ESTADO.md) — **qué está hecho, limitaciones conocidas y siguiente acción**
- [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md) — modelo científico y fórmulas
- [`docs/FUENTES.md`](docs/FUENTES.md) — productos de datos verificados, cómo se consultan y referencias
- [`docs/DATA_VALIDATION.md`](docs/DATA_VALIDATION.md) — validación cruzada de lluvia (generada)
- [`docs/DECISIONES.md`](docs/DECISIONES.md) — registro de decisiones
- [`docs/PRESENTACION.md`](docs/PRESENTACION.md) — guion y preguntas críticas del jurado
