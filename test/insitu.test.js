'use strict';
// Modo Precisa: validación y calibración de los datos in situ del agricultor, y efecto en el análisis (instantánea real, sin red).
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const { gatherData } = require('../src/pipeline');
const { analyzeRice, DOMAIN, PROFILE } = require('../src/rice');
const { validateInsitu, calibratedProfile } = require('../src/insitu');

const withDomain = async (fn) => { const prev = process.env.FIELDSHIFT_DOMAIN; process.env.FIELDSHIFT_DOMAIN = 'morropon'; try { return await fn(); } finally { process.env.FIELDSHIFT_DOMAIN = prev; } };
const full = { sowing_date: '2026-01-21', establishment: 'trasplante', variety: 'Tinajones', observed_dates: { tillering: '2026-02-18', panicle: '2026-04-05', flowering: '2026-04-15', hard_ripening: '2026-05-05' }, irrigation: { management: 'inundacion_continua', supply_m3_ha: 12000, percolation_mm_day: 6 } };
const run = (extra) => withDomain(async () => analyzeRice({ ...DOMAIN.center, area_ha: 1, ...extra }, await gatherData(DOMAIN.center.lat, DOMAIN.center.lon)));

test('Validación: acepta lo válido y rechaza fechas, rangos y orden incorrectos', () => {
  assert.deepEqual(validateInsitu(full).errors, []);
  assert.equal(validateInsitu(null).insitu, null);
  assert.equal(validateInsitu({}).insitu, null, 'sin datos útiles → null');
  assert.ok(validateInsitu({ sowing_date: '21/01/2026' }).errors.length);
  assert.ok(validateInsitu({ irrigation: { supply_m3_ha: -1 } }).errors.length);
  assert.ok(validateInsitu({ irrigation: { percolation_mm_day: 99 } }).errors.length);
  assert.ok(validateInsitu({ sowing_date: '2026-01-21', observed_dates: { panicle: '2026-03-01', tillering: '2026-04-01' } }).errors.length, 'orden de fases');
  assert.ok(validateInsitu({ sowing_date: '2026-01-21', observed_dates: { hard_ripening: '2026-02-01' } }).errors.length, 'madurez no plausible');
  assert.ok(validateInsitu({ sowing_date: '2026-02-30' }).errors.length, 'fecha inexistente');
});

test('Calibración: el ciclo observado reemplaza al de SENAMHI y suma exactamente los días de madurez', () => {
  const c = calibratedProfile(PROFILE, validateInsitu(full).insitu);
  const sum = c.profile.cycle.ini + c.profile.cycle.dev + c.profile.cycle.mid + c.profile.cycle.late;
  assert.equal(c.profile.calibrated, true);
  assert.equal(sum, 104); // 21-ene → 5-may
  assert.equal(c.profile.phenology_das.flowering, 84);
  assert.deepEqual(c.profile.flowering_window_das, [77, 93]);
  assert.equal(PROFILE.cycle.ini + PROFILE.cycle.dev + PROFILE.cycle.mid + PROFILE.cycle.late, 114, 'el perfil base no se modifica');
});

test('Fases observadas sin siembra real no se usan y se informa', () => {
  const c = calibratedProfile(PROFILE, validateInsitu({ observed_dates: { hard_ripening: '2026-05-05' } }).insitu);
  assert.equal(c.profile.calibrated, false);
  assert.ok(c.ignored.some((x) => /fecha de siembra real/.test(x)));
});

test('Una variedad distinta de Tinajones se advierte', () => {
  const c = calibratedProfile(PROFILE, validateInsitu({ variety: 'IR 43' }).insitu);
  assert.ok(c.ignored.some((x) => /IR 43/.test(x)));
});

test('Precisa cambia el análisis; Instantánea no cambia', async () => {
  const base = await run({}), same = await run({ mode: 'instantanea' }), p = await run({ mode: 'precisa', insitu: validateInsitu(full).insitu });
  assert.equal(base.mode, 'instantanea'); assert.equal(same.chosen, null);
  assert.equal(p.mode, 'precisa'); assert.equal(p.profile.calibrated, true);
  assert.ok(Math.abs(p.chosen.dur_days - 104) <= 2, `duración recalibrada ≈ 104 d (depende del método de temperatura; obtenida ${p.chosen.dur_days})`);
  assert.ok(base.windows.every((w) => w.c1_score == null), 'sin dotación C1 no se puntúa');
  assert.ok(p.windows.every((w) => w.c1_score != null), 'con dotación C1 se puntúa en todas las fechas');
  assert.ok(p.insitu.phase_comparison.length === 4);
  assert.ok(Math.abs(p.insitu.phase_comparison.find((x) => x.phase === 'hard_ripening').diff_days - 10) <= 2, 'modelo instantáneo ≈ 114 d frente a 104 observados (±2 d según el método de temperatura)');
  assert.ok(p.criteria_diagnostic.criteria.C1.score != null);
  assert.equal(p.criteria_diagnostic.may_label_as_recommendation, false);
});

test('Precisa sin percolación declarada avisa que el requerimiento está subestimado', async () => {
  const ins = validateInsitu({ irrigation: { supply_m3_ha: 8000 } }).insitu;
  const r = await run({ mode: 'precisa', insitu: ins });
  assert.ok(r.insitu.notes.some((n) => /subestimado/.test(n)));
  assert.equal(r.windows[0].requirement_includes_percolation, false);
});

test('Precisa vacío cae a Instantánea y lo dice', async () => {
  const r = await run({ mode: 'precisa', insitu: null });
  assert.equal(r.mode, 'instantanea'); assert.equal(r.mode_requested, 'precisa');
});
