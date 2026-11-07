# Sensibilidad a supuestos físicos (caso Moyobamba, datos demo)

Generado por `node scripts/sensitivity.js`. Mide si la recomendación cambia al variar supuestos; **no** valida los supuestos.

| Variante | Estrategia A (secuencia) | Puntaje A | Campañas iguales a Base (A) | Estrategia B igual a Base |
|---|---|---|---|---|
| Base | camote → zapallo → mucuna → zapallo | 82 | 4/4 | sí |
| AWC 70 mm/m (arenoso) | camote → zapallo → mucuna → zapallo | 78.4 | 4/4 | no |
| AWC 150 mm/m | camote → zapallo → mucuna → zapallo | 82.2 | 4/4 | sí |
| Piso viento u2=0,8 (≈ERA5) | camote → zapallo → mucuna → zapallo | 81.4 | 4/4 | no |
| Piso viento u2=1,5 | mucuna → zapallo → camote → caupi | 80.4 | 1/4 | no |
| Profundidad radicular ×0,7 | camote → zapallo → mucuna → zapallo | 79.8 | 4/4 | no |
| Profundidad radicular ×1,3 | camote → zapallo → mucuna → zapallo | 82.2 | 4/4 | sí |
| Kc_mid ×0,9 | camote → zapallo → mucuna → zapallo | 82.1 | 4/4 | sí |
| Kc_mid ×1,1 | camote → zapallo → mucuna → zapallo | 80.1 | 4/4 | no |
| Ordinal cover +0.15 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 82 | 4/4 | sí |
| Ordinal cover −0.15 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 81.7 | 4/4 | sí |
| Ordinal biomass +0.15 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 82.7 | 4/4 | sí |
| Ordinal biomass −0.15 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 81 | 4/4 | sí |
| Ordinal n_balance +0.5 (todos los cultivos) | camote → zapallo → mucuna → camote | 82 | 3/4 | sí |
| Ordinal n_balance −0.5 (todos los cultivos) | camote → zapallo → mucuna → camote | 81.3 | 3/4 | sí |
| Ordinal cost +0.5 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 79.2 | 4/4 | sí |
| Ordinal cost −0.5 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 82 | 4/4 | sí |
| Ordinal waterlog_sens +0.15 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 82 | 4/4 | sí |
| Ordinal waterlog_sens −0.15 (todos los cultivos) | camote → zapallo → mucuna → zapallo | 82 | 4/4 | sí |
