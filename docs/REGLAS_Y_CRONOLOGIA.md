# Reglas del concurso y cronología del trabajo (registro de cumplimiento)

**Estado: desarrollo REANUDADO el 2026‑11‑06 como proyecto independiente de I+D** (ver §7). El texto de las secciones 1–6 se conserva como registro histórico de la congelación breve.

## 1. Regla verificada

Fuente oficial: Participant FAQ de NASA Space Apps 2026 — https://www.spaceappschallenge.org/resources/participant-faqs/
(texto guardado en `docs/evidence/faqs.txt`, leído el 2026‑11‑06 con Edge; `curl`/WebFetch fallan con error TLS desde esta máquina y **no se desactivó la validación de certificados**).

> «A summary of each challenge will be released on September 17, followed by challenge statements on October 28, which include the full details and requirements. Resources for each challenge will be published on November 13. **Teams are not allowed to begin working on the challenges prior to the hackathon.**»

Otros datos del mismo FAQ:
- Evento: 14–15 de noviembre de 2026. Los recursos de cada reto se publican el 13 de nov.
- El uso de herramientas de IA («Super Intelligence» en la redacción del FAQ) **está permitido**, y el envío **debe incluir una descripción de cómo se usaron** en el desarrollo.
- Para optar al Global Judging hay que registrarse y enviar el proyecto desde la página del equipo.

## 2. Lo que NO se pudo verificar
- Los *Participant Terms & Conditions* 2026 (enlazados desde el FAQ): **no leídos**. Pueden contener reglas adicionales sobre trabajo previo, código reutilizado o licencias.
- La página del reto `.../2026/challenges/field-shift-adapting-farms-with-nasa-data/` devolvió «Page Not Found» al abrirla con Edge headless; el texto oficial del reto y los criterios 2026 siguen **sin leerse**.
- La interpretación exacta de «begin working on the challenges» (¿incluye preparación general o reutilizar código genérico?) **no está aclarada**. Debe preguntarse al *Local Lead* o por la página Contact Us antes de decidir.

## 3. Cronología (todo el trabajo previo fue en una sola jornada, antes del evento)
| Fecha | Hecho |
|---|---|
| 2026‑11‑06 | Se construyó el prototipo **Field Shift v0.1** (pipeline de datos, motor de rotación, app web, 25 pruebas, documentación). Commit local `81e936c`. |
| 2026‑11‑06 | Al revisar las reglas del FAQ se detecta la prohibición. Se detiene el desarrollo. Esta nota se agrega después, sin modificar el código. |

**El prototipo v0.1 es trabajo PREVIO al hackathon.** No debe presentarse como realizado durante el evento.

## 4. Consecuencias y opciones (decisión del equipo, no tomada aquí)
1. **Recomendado:** consultar al organizador local / Contact Us si trabajo previo está tolerado y, si lo está, declararlo expresamente en el envío.
2. Si no hay confirmación, **no reutilizar** el código de v0.1 en el envío: el equipo debe empezar de cero durante el 14–15 de noviembre.
3. Hasta entonces, solo actividades **generales y no específicas del reto** (formar equipo, inscribirse, instalar herramientas, estudiar fundamentos): cualquier duda se consulta primero.

## 5. Divulgación del uso de herramientas de IA (para el formulario de envío)
Pendiente de redactar por el equipo antes de cualquier envío oficial: las reglas exigen describir cómo se usaron estas herramientas en el desarrollo.

## 6. Congelación
- Etiqueta git `pre-event-prototype-2026-11-06` marca el último estado del código.
- Solo se admiten commits de **documentación** hasta el evento.
- Pendientes técnicos conocidos y no ejecutados por esta regla: ver `docs/ESTADO.md` (incluye la duda sobre la versión de IMERG en ClimateSERV).

## 7. Reanudación como proyecto independiente (2026‑11‑06)
Decisión del usuario: Field Shift es, por ahora, un **proyecto independiente de investigación y desarrollo tecnológico**; **no se prepara ni realiza una entrega oficial** al NASA Space Apps Challenge. Se retira la congelación.
- El historial git y las fechas se conservan sin alteración (`81e936c` prototipo; `8e9cb8d` congelación; tag `pre-event-prototype-2026-11-06`).
- La regla del FAQ sigue siendo un hecho verificado. **Si en el futuro el equipo decide participar oficialmente**, la elegibilidad del trabajo previo se evaluará por separado (consultar al Local Lead / Contact Us, leer los T&C 2026) y no debe presentarse este trabajo como realizado durante el evento.
- Los datos NASA usados son públicos y su uso en un proyecto independiente no depende del concurso.
