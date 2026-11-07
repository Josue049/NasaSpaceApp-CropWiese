# Sensibilidad a supuestos físicos (caso Moyobamba, datos demo)

Generado por `node scripts/sensitivity.js`. Mide si la recomendación cambia al variar supuestos; **no** valida los supuestos.

| Variante | Estrategia A (secuencia) | Puntaje A | Campañas iguales a Base (A) | Estrategia B igual a Base |
|---|---|---|---|---|
| Base | mucuna → zapallo → camote → caupi | 81.9 | 4/4 | sí |
| AWC 70 mm/m (arenoso) | mucuna → zapallo → camote → caupi | 79.2 | 4/4 | no |
| AWC 150 mm/m | mucuna → zapallo → camote → caupi | 83.1 | 4/4 | no |
| Piso viento u2=0,8 (≈ERA5) | mucuna → zapallo → camote → caupi | 81.9 | 4/4 | sí |
| Piso viento u2=1,5 | mucuna → zapallo → camote → caupi | 81.2 | 4/4 | sí |
| Profundidad radicular ×0,7 | mucuna → zapallo → camote → caupi | 80.4 | 4/4 | no |
| Profundidad radicular ×1,3 | mucuna → zapallo → camote → caupi | 83 | 4/4 | no |
| Kc_mid ×0,9 | mucuna → zapallo → camote → caupi | 82.4 | 4/4 | no |
| Kc_mid ×1,1 | mucuna → zapallo → camote → caupi | 80.7 | 4/4 | sí |
