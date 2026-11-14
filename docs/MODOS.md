# Modos de análisis: Instantánea y Precisa

Rama `bajo-piura-arroz`. Demo reducida: arroz Tinajones en Morropón (Alto Piura).

## Instantánea (por defecto)
Usa **solo** datos satelitales y de reanálisis de la zona (NASA POWER, IMERG, ERA5, SRTM, SoilGrids) y el ciclo de Tinajones observado por SENAMHI en 2026 (114 días a maduración córnea). No necesita nada del agricultor. El agua (C1) **no se puntúa** por falta de dotación de riego.

## Precisa
Agrega datos **declarados por el agricultor** (todos opcionales; cada uno se aplica por separado y la pantalla informa qué se usó y qué no). No se guardan en el servidor y **no se verifican**.

| Dato in situ | Qué cambia | Si falta |
|---|---|---|
| Siembra real (fecha) | Fija «su fecha de siembra» en el análisis | Se usa la fecha prevista o ninguna |
| Fechas de fases observadas (macollaje, panoja, floración, maduración córnea) | **Recalibra el ciclo de su parcela** (duración observada en vez de 114 días) y centra la ventana de floración en su fecha observada. Requiere la siembra real | No se usan y se avisa |
| Manejo del agua + agua recibida en la campaña (m³/ha) | **C1 pasa a calcularse**: cociente agua recibida ÷ agua requerida (exploratorio, no es lámina verificada) | C1 sigue sin puntuar |
| Filtración/percolación (mm/día) | Se suma al requerimiento de agua | Requerimiento subestimado: C1 optimista (se avisa) |
| Método (directa/trasplante), variedad | Informativos. Una variedad distinta de Tinajones se advierte: el ciclo se toma de sus fechas, no de la variedad | — |

### Qué calcula en cada módulo
- **Fechas de siembra** (`/api/rice/analyze`): el índice es el diagnóstico parcial de los criterios con dato (C2 siempre; C1 solo con dotación), con pesos de diseño 50/40/10 renormalizados sobre los conocidos. **Nunca es recomendación.**
- **Comparación no circular de fases:** muestra lo observado frente a lo que habría estimado el modo Instantánea (ciclo SENAMHI). Las mismas fechas se usan aparte para recalibrar.
- **Rotación** (`/api/rotation/analyze`): solo se usa el ciclo recalibrado del arroz. La dotación de riego **no** entra, porque el motor genérico no incorpora el riego como aporte físico.

## Límites
- Todo lo declarado es autorreportado y no verificado; una sola parcela y una sola campaña.
- C1 exige comparar dotación y requerimiento de **la misma campaña y área**. Faltan eficiencia de riego, pérdidas y requerimiento neto/bruto.
- Con pocas fases o sin madurez observada, la calibración es parcial.
- El modo Precisa no valida el modelo: lo ajusta a lo que el agricultor informa.

## Datos que aún no se aceptan (mejoras posibles)
Registros diarios de un pluviómetro propio, análisis de suelo, rendimientos, fechas de riego individuales, y comparación de NDVI con la fecha de siembra declarada.
