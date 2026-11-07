'use strict';
// Sensibilidad del resultado a supuestos físicos: AWC, piso de viento u2, profundidad radicular y Kc_mid.
// Uso: node scripts/sensitivity.js   (modo padre; lanza un proceso hijo por variante)
// Escribe docs/SENSIBILIDAD.md. Cada fila reporta la estrategia A (mejor) y la similitud con la base.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

if (process.argv[2] === '--one') {
  const { gatherData, analyze, CROPS } = require('../src/pipeline');
  const rootF = Number(process.env.S_ROOT || 1), kcF = Number(process.env.S_KC || 1);
  for (const c of CROPS.crops) { c.root_m *= rootF; c.kc = { ...c.kc, mid: c.kc.mid * kcF }; }
  if (process.env.S_ORD) { const [k, d] = process.env.S_ORD.split(':'); const lim = { cover: [0, 1], biomass: [0, 1], waterlog_sens: [0, 1], n_balance: [-2, 2], cost: [1, 3] }[k]; for (const c of CROPS.crops) c[k] = Math.max(lim[0], Math.min(lim[1], c[k] + Number(d))); }
  const input = { lat: -6.034, lon: -76.971, area_ha: 1.5, irrigation: false, start_slot: 'A', history: ['maiz', 'maiz', 'maiz', 'maiz'],
    priorities: { protect_soil: 4, water: 3, resilience: 4, pests: 3, income: 3, low_cost: 3 }, excluded_crops: [], market_pref: {} };
  gatherData(-6.034, -76.971).then((g) => {
    const r = analyze(input, g, require('../src/pipeline').SCENARIOS.base);
    console.log(JSON.stringify(r.strategies.map((s) => ({ l: s.label, seq: s.sequence, score: s.score, bys: s.totals_by_source }))));
  });
} else {
  const variants = [
    ['Base', {}], ['AWC 70 mm/m (arenoso)', { FIELDSHIFT_AWC: 70 }], ['AWC 150 mm/m', { FIELDSHIFT_AWC: 150 }],
    ['Piso viento u2=0,8 (≈ERA5)', { FIELDSHIFT_U2MIN: 0.8 }], ['Piso viento u2=1,5', { FIELDSHIFT_U2MIN: 1.5 }],
    ['Profundidad radicular ×0,7', { S_ROOT: 0.7 }], ['Profundidad radicular ×1,3', { S_ROOT: 1.3 }],
    ['Kc_mid ×0,9', { S_KC: 0.9 }], ['Kc_mid ×1,1', { S_KC: 1.1 }],
    ...[['cover', 0.15], ['biomass', 0.15], ['n_balance', 0.5], ['cost', 0.5], ['waterlog_sens', 0.15]].flatMap(([k, d]) => [[`Ordinal ${k} +${d} (todos los cultivos)`, { S_ORD: `${k}:${d}` }], [`Ordinal ${k} −${d} (todos los cultivos)`, { S_ORD: `${k}:${-d}` }]]),
  ];
  const res = variants.map(([name, env]) => {
    const out = execFileSync(process.execPath, [__filename, '--one'], { env: { ...process.env, ...env }, encoding: 'utf8' });
    return { name, s: JSON.parse(out.trim().split('\n').pop()) };
  });
  const base = res[0].s;
  const sim = (a, b) => a.filter((x, i) => x === b[i]).length;
  let md = '# Sensibilidad a supuestos físicos (caso Moyobamba, datos demo)\n\nGenerado por `node scripts/sensitivity.js`. Mide si la recomendación cambia al variar supuestos; **no** valida los supuestos.\n\n| Variante | Estrategia A (secuencia) | Puntaje A | Campañas iguales a Base (A) | Estrategia B igual a Base |\n|---|---|---|---|---|\n';
  for (const { name, s } of res) {
    const a = s[1] || s[0], A0 = base[1] || base[0];
    md += `| ${name} | ${a.seq.join(' → ')} | ${a.score} | ${sim(a.seq, A0.seq)}/4 | ${s[2] && base[2] && s[2].seq.join() === base[2].seq.join() ? 'sí' : 'no'} |\n`;
  }
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'SENSIBILIDAD.md'), md);
  console.log(md);
}
