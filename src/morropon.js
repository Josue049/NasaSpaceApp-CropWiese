'use strict';
/**
 * Configuración de la demo reducida: Morropón (Alto Piura), arroz Tinajones + frijol.
 * Todo lo de aquí es PROVISIONAL; ver data/rice_tinajones.json y docs/CRITERIOS_ARROZ.md.
 * No depende de pipeline.js (evita ciclos): pipeline.js y rice.js lo importan.
 */
const fs = require('fs');
const path = require('path');
const { canopyCoverMean } = require('./climate');

const PROFILE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rice_tinajones.json'), 'utf8'));
const OBS_CSV = path.join(__dirname, '..', 'docs', 'evidence', 'rice_morropon_2026_senamhi.csv');

// Cultivos de la rotación: SOLO los dos con base y referencias (decisión del equipo, 2026-11-14). Se ampliará después.
const ROTATION_CROPS = ['arroz', 'frijol'];
// Campañas de Morropón. SUPUESTO de diseño con evidencia débil: la campaña grande se sembró el 21‑ene‑2026 (SENAMHI, Morropón);
// la chica se ubica a mediados de julio por el reporte regional de SENAMHI 2024 (instalación de arroz en julio–agosto, 8 224 ha en Piura).
// Los ids 'A' y 'B' se conservan para no tocar el motor.
const SLOTS = [
  { id: 'A', label: 'Campaña grande (siembra ≈ 21 ene)', start: { m: 1, d: 21 }, window_days: 165 },
  { id: 'B', label: 'Campaña chica (siembra ≈ 15 jul)', start: { m: 7, d: 15 }, window_days: 165 },
];

/** Cultivos de la rotación: el arroz usa el perfil Tinajones (ciclo observado de 114 días); el resto, la base común. */
function rotationCrops(allCrops) {
  return ROTATION_CROPS.map((id) => {
    const c = allCrops.find((x) => x.id === id);
    if (!c) throw new Error(`Cultivo ${id} no está en la base`);
    if (id !== 'arroz') return c;
    const t = { ...c, name: 'Arroz Tinajones', cycle: { ...PROFILE.cycle }, kc: { ...PROFILE.kc }, eco: { ...c.eco, ...PROFILE.eco } };
    t.param_status = { ...c.param_status, cycle: 'OBSERVACIÓN: SENAMHI Morropón 2026 (114 días a maduración córnea), una temporada; asignación a etapas Kc = supuesto', kc: c.param_status && c.param_status.kc };
    t.canopy_cover = canopyCoverMean(t);
    return t;
  });
}

const ymd = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** Contraste del modelo de temperatura con las temperaturas reportadas por SENAMHI (clima 2026 vs climatología 2015–2023, ±3 días). */
function temperatureCheck(clim) {
  if (!fs.existsSync(OBS_CSV)) return null;
  const lines = fs.readFileSync(OBS_CSV, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(','); const ix = (n) => head.indexOf(n);
  const rows = lines.slice(1).map((l) => l.split(',')).filter((c) => c.length >= head.length).map((c) => ({ date: c[ix('event_date')], ev: c[ix('event_name_es')], tmean: Number(c[ix('reported_tmean_c')]), tmax: Number(c[ix('reported_tmax_c')]), tmin: Number(c[ix('reported_tmin_c')]) }));
  const out = [];
  for (const r of rows) {
    const [, mm, dd] = r.date.split('-').map(Number); const sel = [];
    for (const y of clim.years) for (let k = -3; k <= 3; k++) { const day = clim.byKey.get(ymd(Date.UTC(y, mm - 1, dd + k))); if (day) sel.push(day); }
    if (!sel.length) continue;
    out.push({ event: r.ev, date: r.date, reported_tmean_c: r.tmean, model_tmean_c: r1(mean(sel.map((x) => x.T))), reported_tmax_c: r.tmax, model_tmax_c: r1(mean(sel.map((x) => x.Tx))), reported_tmin_c: r.tmin, model_tmin_c: r1(mean(sel.map((x) => x.Tn))) });
  }
  const bias = (a, b) => r1(mean(out.map((o) => o[a] - o[b])));
  return { n: out.length, rows: out, bias_tmean_c: bias('model_tmean_c', 'reported_tmean_c'), bias_tmax_c: bias('model_tmax_c', 'reported_tmax_c'), bias_tmin_c: bias('model_tmin_c', 'reported_tmin_c'),
    note: 'Compara climatología 2015–2023 (±3 días) con valores reportados de una sola temporada (2026): sirve para detectar un sesgo grande, no para validar.' };
}

/** Desplazamientos que anulan el sesgo medido (SUPUESTO: sesgo estacionario; una temporada, 11 valores). */
const offsetsFrom = (chk) => (chk ? { T: -chk.bias_tmean_c, Tx: -chk.bias_tmax_c, Tn: -chk.bias_tmin_c } : null);

module.exports = { PROFILE, ROTATION_CROPS, SLOTS, rotationCrops, temperatureCheck, offsetsFrom };
