# Cropi — asistente conversacional de Field Shift

> **La IA interpreta y explica. El motor agrícola calcula.**

Cropi explica a los agricultores los análisis que ya generó el motor de Field Shift (rotaciones de arroz Tinajones y frijol Loctao en Morropón). No calcula rotaciones, no estima rendimientos y no inventa datos.

## Estado de la validación (leer primero)

| Componente | Estado |
|---|---|
| Servidor, herramientas, contexto, sesiones, límites, interfaz | Implementado y probado (134 pruebas automáticas, revisión visual en escritorio/tableta/móvil). |
| Modo limitado (sin clave): respuestas deterministas con datos reales del motor | Verificado de extremo a extremo. |
| **Conversación real con Groq (`openai/gpt-oss-120b`)** | **NO validada.** No había credenciales. Las pruebas usan *dobles* (cliente simulado y SDK simulado): comprueban la construcción de solicitudes, el bucle de herramientas y el mapeo de errores con las clases reales del SDK, pero **no demuestran** que el modelo responda bien ni que llame a las herramientas. Ejecutar `node scripts/probar_groq.js` con una clave real para verificarlo. |

La documentación de Groq (consultada, no contrastada con la API en vivo) lista `openai/gpt-oss-120b` como modelo de producción con soporte de herramientas; la disponibilidad real depende de la cuenta (`GET /api/assistant/status` la consulta cuando hay clave).

## Arquitectura

```
Navegador (public/fieldi.js)  ──►  server.js /api/assistant/*  ──►  AssistantService (src/assistant/chat.js)
   cookie HttpOnly fs_sid              sesión + origen + límites          │
                                                                          ├─ Store (en memoria): análisis activo + chat de la sesión
                                                                          ├─ Herramientas de solo lectura (tools.js) ─► resultado del motor
                                                                          └─ groq-sdk (groqClient.js)  ─► Groq (solo servidor)
```

Archivos: `config.js` (entorno, `.env`), `prompt.js` (prompt versionado `cropi-1.3.0`), `store.js` (sesiones y límite de solicitudes), `validate.js` (validación estricta de argumentos), `context.js` (resúmenes compactos del motor), `tools.js` (lista blanca), `groqClient.js` (SDK oficial y errores), `chat.js` (servicio), `index.js` (ensamblado).

El motor agrícola **no se modificó**: `server.js` solo guarda en memoria el resultado de `/api/rotation/analyze` y le añade `analysis_id`.

## Endpoints

| Método y ruta | Función |
|---|---|
| `POST /api/assistant/chat` `{message}` | Responde sobre el análisis **activo de la sesión**. El cuerpo no admite identificadores de análisis (se ignoran). Mensaje máx. 1000 caracteres. |
| `GET /api/assistant/status` | `configured`, `mode` (`ai` o `limited`), `model`, `has_analysis` y, si hay clave, `reachable` y `model_available`. **Nunca** devuelve la clave ni parte de ella. |
| `GET /api/assistant/suggestions` | Preguntas sugeridas construidas del análisis real. |
| `POST /api/assistant/reset` | Borra la conversación de la sesión. |

Códigos de error: 400 mensaje inválido/largo · 403 origen distinto · 429 límite (con `Retry-After`) · 502 clave inválida / modelo no disponible / error de Groq · 504 tiempo agotado.

## Contexto y memoria

- Cada solicitud a Groq lleva: prompt del sistema + **resumen compacto** del análisis activo (máx. ~7000 caracteres: entradas declaradas, 3 rotaciones con puntaje relativo, riesgos principales, sensibilidad, procedencia A–E, límites) + últimos 12 mensajes (máx. 9000 caracteres) + la pregunta.
- **Nunca** se envían series meteorológicas, bases de datos, archivos del SENAMHI ni el resultado completo del motor.
- Al generarse un análisis nuevo, la conversación previa se descarta y se avisa; Cropi usa solo el análisis nuevo.
- Sin almacenamiento permanente: todo vive en memoria del servidor, caduca a las 2 h de inactividad y se pierde al reiniciar. No se guarda el chat en disco.

## Herramientas (solo lectura)

`get_current_analysis`, `get_rotation_details`, `compare_rotations`, `get_water_requirements`, `get_climate_evidence`, `get_parameter_provenance`, `simulate_scenario`.

- Lista blanca cerrada; argumentos validados con esquema estricto (propiedad no declarada = rechazo); ninguna acepta ids de análisis, rutas ni código; operan sobre el análisis que el **servidor** asocia a la sesión.
- Máximo 4 vueltas modelo⇄herramientas (la última sin herramientas), 6 llamadas por vuelta, 15 s por herramienta; resultados acotados a 6000 caracteres y marcados como *datos, no instrucciones*.
- `simulate_scenario` re-ejecuta el motor real sobre una **copia** de la entrada con cambios permitidos (riego, volumen de agua, percolación, textura/pH, fecha de siembra, ciclos, campaña inicial, cultivo a conservar), máx. 2 por mensaje, y **no altera** el análisis activo (verificado por prueba).

## Estilo de las respuestas

Cropi habla a alto nivel y con palabras cotidianas: máximo ~70 palabras, sin jerga (nada de «demanda neta», «incertidumbre», «puntaje relativo»…), sin tablas salvo que la persona las pida, con 1–2 cifras redondeadas y una pregunta final corta. Las reglas están en `src/assistant/prompt.js` (versión `cropi-1.3.0`). Es una instrucción al modelo: en pruebas reales se cumple casi siempre, pero no está garantizada (aún puede colarse alguna palabra técnica). Para `gpt-oss` el esfuerzo de razonamiento es «low» por defecto; con un esfuerzo mayor el modelo gastaba el límite de salida razonando y no llegaba a responder. Si Groq rechaza una solicitud, se reintenta una vez y después se responde sin herramientas.

## Seguridad

- Groq solo desde el servidor con el SDK oficial `groq-sdk`; la clave solo se lee de `GROQ_API_KEY` (entorno o `.env`). `.env` está en `.gitignore`; no hay variables `VITE_`; el navegador no recibe la clave en ningún endpoint (prueba incluida).
- Sesión anónima por cookie `fs_sid` (aleatoria, HttpOnly, SameSite=Lax). Un navegador no puede leer el análisis de otro. Los POST con `Origin` distinto se rechazan.
- Límites: 12 mensajes/min y 150/día por sesión; 40/min por IP.
- Registros técnicos solo con código/estado/duración; sin contenido de conversaciones ni claves.
- Salidas del chat se escapan antes de mostrarse (Markdown mínimo seguro).
- Limitación honesta: es una demo sin cuentas de usuario; la cookie identifica un navegador, no a una persona.

## Modelo y configuración

`.env.example`: `GROQ_API_KEY=`, `GROQ_MODEL=openai/gpt-oss-120b`, `GROQ_TIMEOUT_MS=30000`, `GROQ_MAX_OUTPUT_TOKENS=1200`, opcional `GROQ_REASONING_EFFORT` (`low|medium|high`). El modelo se cambia solo por entorno. Temperatura 0,3 (la guía de Groq sugiere 0–0,5 para herramientas).

## Modo limitado (sin clave)

Sin `GROQ_API_KEY` Cropi **no simula una IA**: contesta con plantillas deterministas construidas con los números reales del motor (puntajes, riesgos, demanda de agua, procedencia) y lo declara en un aviso visible. Ante preguntas de rendimiento o ganancia explica que Field Shift no las estima (el margen existe solo si el agricultor declaró rendimiento, precio y costos de ambos cultivos).

## Pruebas

`npm test` → `test/assistant.test.js` (18 pruebas): configuración y ausencia de filtración de la clave, validador, lista blanca y rechazo de argumentos, coincidencia de las herramientas con el motor, simulación aislada, modo limitado, preguntas de rendimiento, bucle con herramientas (doble de Groq), tope de iteraciones, errores 401/429/timeout/conexión/modelo con clases reales del SDK, solicitud al SDK (modelo, tokens, tools), cambio de análisis, historial acotado, límites, aislamiento entre sesiones, sugerencias y flujo HTTP completo. `test/helpers.js` fuerza `GROQ_API_KEY=''` para que **ninguna prueba use una clave real**.

## Limitaciones

- Calidad conversacional y uso correcto de herramientas por `gpt-oss-120b`: sin validar (ver arriba). Algunos modelos ignoran las herramientas; el prompt y el contexto compacto mitigan, pero hay que probarlo.
- El prompt reduce, pero no elimina, la posibilidad de que el modelo se exceda; por eso el contexto y las herramientas devuelven solo datos del motor y el prompt prohíbe cifras propias.
- Estado solo en memoria: reiniciar el servidor borra análisis y chats (hay que volver a generar la recomendación).
- Con varias instancias del servidor (balanceo) las sesiones no se comparten.

## Activación

1. Crea una clave en <https://console.groq.com/keys>.
2. `copy .env.example .env` y escribe la clave en `GROQ_API_KEY=` (no la subas a git).
3. `node scripts/probar_groq.js` → debe confirmar modelo disponible, texto y llamada a herramienta.
4. `npm start`; abre el chat de Cropi: el aviso de «modo limitado» debe desaparecer (`GET /api/assistant/status` → `mode: "ai"`).
5. Si el modelo no está en tu cuenta o ignora las herramientas, cambia `GROQ_MODEL`.
