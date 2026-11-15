'use strict';
// Field Shift · demo reducida (arroz Tinajones + frijol, Morropón). Todo texto dinámico pasa por esc().
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const CROP = { arroz: { name: 'Arroz' }, loctao: { name: 'Frijol Loctao' }, frijol: { name: 'Frijol común' } };
const ico = (n) => '<svg class="i" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
const fmtMD = (m, d) => `${d} ${MES[m - 1]}`;
const fmtISO = (md) => { const [m, d] = md.split('-').map(Number); return fmtMD(m, d); };
const fmtLong = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MES_LARGO[m - 1]} de ${y}`; };
// Etiquetas prudentes: sin respaldo local ninguna fecha se declara «viable» de forma concluyente.
const STATUS = { viable: ['Sin impedimento térmico', 'ok'], marginal: ['Dudosa', 'warn'], no_viable: ['Incompatible', 'bad'] };
const LEVEL = { claramente_preferible: 'claramente preferible', probablemente_preferible: 'probablemente preferible', practicamente_equivalentes: 'prácticamente equivalentes', indistinguibles: 'indistinguibles' };
const state = { rot: null, rice: null, sat: null, valid: null, meta: null, recent: null, senamhi: null };
let pollTimer = null;

// ---------- vistas ----------
function showView(name) {
  if (!['inicio', 'recomendacion', 'indicadores', 'aprende'].includes(name)) name = 'inicio';
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === name));
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  if (name === 'indicadores') loadValidation();
  if (name === 'aprende') renderLearn();
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { showView(t.dataset.view); setMenu(false); }));
function setMenu(open) { document.body.classList.toggle('menu-open', open); const b = $('btnMenu'); b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); }
$('btnMenu').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
$('dlgRot').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === $('dlgRot')) $('dlgRot').close(); });
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); showView(g.dataset.go); } });
$('btnHelp').addEventListener('click', () => showView('aprende'));
document.addEventListener('click', (e) => { if (e.target.closest('[data-open-precisa]')) { e.preventDefault(); $('btnAdjust').click(); } });

// ---------- modos: Instantánea / Precisa (dentro del bloque 2) ----------
const getMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || 'instantanea';
const getSlot = () => (document.querySelector('input[name="slot"]:checked') || {}).value || 'A';
const numOrNull = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
function insituPayload() {
  if (getMode() !== 'precisa') return null;
  const od = {}; for (const k of ['tillering', 'panicle', 'flowering', 'hard_ripening']) if ($('od_' + k).value) od[k] = $('od_' + k).value;
  return { sowing_date: $('sow').value || null, observed_dates: od, irrigation: { supply_m3_ha: numOrNull('supply'), percolation_mm_day: numOrNull('perc') } };
}
// Lo que el agricultor NO escribe queda como «no declarado»: no se envía y nunca se convierte en cero.
function declaredPayload() {
  if (getMode() !== 'precisa') return {};
  const o = {};
  if ($('first_sow').value) o.first_sowing_date = $('first_sow').value;
  const cy = {}; for (const c of ['arroz', 'loctao']) { const v = numOrNull('cyc_' + c); if (v != null) cy[c] = v; } if (Object.keys(cy).length) o.cycle_days = cy;
  const soil = {}; if ($('soil_tex').value) soil.texture = $('soil_tex').value; const ph = numOrNull('soil_ph'); if (ph != null) soil.ph = ph; if (Object.keys(soil).length) o.soil = soil;
  return o;
}
// Riego: sí / no / no lo sé (null). «No lo sé» NO se interpreta como «sí».
const getIrr = () => { const v = (document.querySelector('input[name="irr"]:checked') || {}).value; return v === 'si' ? true : v === 'no' ? false : null; };
// La primera campaña a evaluar por defecto es la que empieza antes a partir de hoy (no una elección fija).
function defaultSlot() { const a = new Date(firstYear('A'), 0, 21), b = new Date(firstYear('B'), 6, 15); return a <= b ? 'A' : 'B'; }
// Economía y cultivo principal: solo en modo Precisa, solo lo que el agricultor escribe (nada se rellena por defecto).
function economicsPayload() {
  if (getMode() !== 'precisa') return null;
  const out = {};
  for (const c of ['arroz', 'loctao']) {
    const g = (k) => numOrNull(`e_${c}_${k}`);
    const o = { yield_t_ha: g('yield'), price_s_per_kg: g('price'), cost_establishment_s_ha: g('est'), cost_irrigation_s_ha: g('irr'), cost_other_s_ha: g('oth') };
    if (Object.values(o).some((v) => v != null)) out[c] = o;
  }
  return Object.keys(out).length ? out : null;
}
function keepPayload() {
  if (getMode() !== 'precisa' || !$('keepCrop').value) return null;
  const w = $('keepWhere').value, crop = $('keepCrop').value;
  if (w === 'A' || w === 'B') return { crop, campaigns: [w] };
  if (w === 'AB') return { crop, campaigns: ['A', 'B'] };
  return { crop, min_campaigns: w === 'min3' ? 3 : 2 };
}
function syncMode() {
  const p = getMode() === 'precisa';
  $('precisaBox').hidden = !p;
  $('chipMode').textContent = 'Demo · ' + (p ? 'Precisa' : 'Instantánea');
}
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', syncMode));
document.querySelectorAll('input[name="slot"]').forEach((r) => r.addEventListener('change', () => { renderTiles(); }));
$('btnAdjust').addEventListener('click', () => { document.querySelector('input[name="mode"][value="precisa"]').checked = true; syncMode(); openPrecisa(); });
// ---------- modal de datos de la parcela (modo Precisa) ----------
const dlgP = $('dlgPrecisa');
function openPrecisa() { if (dlgP.showModal) { if (!dlgP.open) dlgP.showModal(); } else dlgP.setAttribute('open', ''); }
$('btnPrecisa').addEventListener('click', openPrecisa);
dlgP.addEventListener('click', (e) => { if (e.target === dlgP) dlgP.close(); });
dlgP.addEventListener('close', () => updatePrecisaSummary());
const PRECISA_FIELDS = ['first_sow', 'keepCrop', 'supply', 'perc', 'cyc_arroz', 'cyc_loctao', 'sow', 'od_tillering', 'od_panicle', 'od_flowering', 'od_hard_ripening', 'soil_tex', 'soil_ph', 'e_arroz_yield', 'e_arroz_price', 'e_arroz_est', 'e_arroz_irr', 'e_arroz_oth', 'e_loctao_yield', 'e_loctao_price', 'e_loctao_est', 'e_loctao_irr', 'e_loctao_oth'];
function updatePrecisaSummary() {
  const n = PRECISA_FIELDS.filter((id) => $(id) && $(id).value !== '').length;
  $('precisaSummary').textContent = n ? n + (n === 1 ? ' dato indicado' : ' datos indicados') + ': se usan en el análisis y no se guardan.' : 'Aún no has indicado datos: se usan solo los datos de la zona.';
}
PRECISA_FIELDS.forEach((id) => { const el = $(id); if (el) el.addEventListener('input', updatePrecisaSummary); });

// ---------- validación: campos obligatorios y rangos, señalados en rojo ----------
function markInvalid(el, msg, inModal) {
  el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true');
  const holder = el.closest('label, dd, .econ-row') || el.parentElement;
  let small = holder.querySelector(':scope > .err'); if (!small) { small = document.createElement('small'); small.className = 'err'; small.setAttribute('role', 'alert'); holder.appendChild(small); }
  small.textContent = msg;
  return { el, inModal };
}
function clearInvalid() {
  document.querySelectorAll('.invalid').forEach((e) => { e.classList.remove('invalid'); e.removeAttribute('aria-invalid'); });
  document.querySelectorAll('.err').forEach((e) => e.remove());
}
document.addEventListener('input', (e) => { const el = e.target; if (el.classList && el.classList.contains('invalid')) { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); const h = el.closest('label, dd, .econ-row') || el.parentElement; const sm = h.querySelector(':scope > .err'); if (sm) sm.remove(); } });
function validateForm() {
  clearInvalid();
  const errs = [], add = (r) => errs.push(r);
  if (!$('h1').value) add(markInvalid($('h1'), 'Elige tu cultivo actual (obligatorio).', false));
  if (!Number.isFinite(Number($('lat').value)) || !Number.isFinite(Number($('lon').value)) || $('lat').value === '') { $('map').classList.add('invalid'); add({ el: $('map'), inModal: false }); }
  const a = $('area').value; if (a !== '' && !(Number(a) >= 0)) add(markInvalid($('area'), 'Escribe un área válida (≥ 0).', false));
  if (getMode() === 'precisa') {
    const rng = (id, lo, hi, txt) => { const v = $(id).value; if (v !== '' && !(Number(v) >= lo && Number(v) <= hi)) add(markInvalid($(id), txt, true)); };
    rng('supply', 0, 40000, 'Entre 0 y 40 000 m³/ha.'); rng('perc', 0, 30, 'Entre 0 y 30 mm/día.'); rng('cyc_arroz', 40, 200, 'Entre 40 y 200 días.'); rng('cyc_loctao', 40, 200, 'Entre 40 y 200 días.'); rng('soil_ph', 3.5, 9.5, 'Entre 3,5 y 9,5.');
    for (const id of ['e_arroz_yield', 'e_arroz_price', 'e_arroz_est', 'e_arroz_irr', 'e_arroz_oth', 'e_loctao_yield', 'e_loctao_price', 'e_loctao_est', 'e_loctao_irr', 'e_loctao_oth']) rng(id, 0, 1e6, 'Escribe un número ≥ 0.');
    const obs = ['od_tillering', 'od_panicle', 'od_flowering', 'od_hard_ripening'].filter((id) => $(id).value);
    if (obs.length && !$('sow').value) add(markInvalid($('sow'), 'Las fechas observadas requieren la fecha de siembra real.', true));
    const ds = [$('sow'), ...['od_tillering', 'od_panicle', 'od_flowering', 'od_hard_ripening'].map($)].filter((x) => x.value); for (let i = 1; i < ds.length; i++) if (ds[i].value < ds[i - 1].value) { add(markInvalid(ds[i], 'Debe ser posterior a la fecha anterior.', true)); break; }
  }
  return errs;
}

const modeBadge = (j) => {
  if (!j || !j.mode) return '';
  const p = j.mode === 'precisa', ins = j.insitu || {};
  const li = (a) => (a || []).map((x) => '<li>' + esc(x) + '</li>').join('');
  const ap = li(ins.applied), ig = li(ins.ignored), nt = li(ins.notes);
  const fell = j.mode_requested === 'precisa' && !p ? '<p>Elegiste Precisa pero no aportaste datos utilizables: el resultado es el de la modalidad Instantánea.</p>' : '';
  return '<div class="note ' + (p ? '' : 'warn') + '"><b>Modo ' + (p ? 'Precisa' : 'Instantánea') + '</b> — ' + (p ? 'incorpora datos que tú declaraste.' : 'solo datos satelitales y de reanálisis de la zona.') + fell
    + (ap ? '<p class="hint"><b>Se usó:</b></p><ul>' + ap + '</ul>' : '') + (ig ? '<p class="hint"><b>No se usó:</b></p><ul>' + ig + '</ul>' : '') + (nt ? '<ul>' + nt + '</ul>' : '') + '</div>';
};

// ---------- llamadas a la API ----------
const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); return { ok: r.ok, j }; };
function setMsg(text, kind) { const m = $('msg'); m.hidden = !text; m.textContent = text || ''; m.className = 'status' + (kind ? ' ' + kind : ''); }

async function generate() {
  const errs = validateForm();
  if (errs.length) { // se señalan en rojo; el botón NO se bloquea
    const first = errs.find((e) => !e.inModal) || errs[0];
    setMsg(first.inModal ? 'Revisa los campos marcados en rojo en «Datos de mi parcela».' : 'Completa los campos obligatorios marcados en rojo.', 'bad');
    if (first.inModal) { openPrecisa(); const sec = first.el.closest('details'); if (sec) sec.open = true; setTimeout(() => first.el.scrollIntoView({ block: 'center' }), 50); } else { first.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.el.focus && first.el.tagName !== 'DIV') first.el.focus({ preventScroll: true }); }
    return;
  }
  const lat = Number($('lat').value), lon = Number($('lon').value);
  $('btnGo').disabled = true; setMsg('Calculando con los datos de tu punto…');
  const mode = getMode(), insitu = insituPayload(), area = $('area').value, economics = economicsPayload(), keep_main = keepPayload(), declared = declaredPayload();
  const history = $('h0').value ? [$('h0').value, $('h1').value] : [$('h1').value]; // «No lo sé» en la campaña anterior: solo se usa el cultivo actual
  try {
    const [rot, rice] = await Promise.all([
      post('/api/rotation/analyze', { lat, lon, area_ha: area, history, start_slot: getSlot(), irrigation: getIrr(), mode, insitu, economics, keep_main, ...declared }),
      post('/api/rice/analyze', { lat, lon, area_ha: area, sowing_date: (insitu && insitu.sowing_date) || null, mode, insitu }),
    ]);
    if (!rot.ok) { setMsg((rot.j.error || 'Error') + (rot.j.details ? ': ' + rot.j.details.join('; ') : ''), 'bad'); return; }
    state.rot = rot.j; state.rice = rice.ok ? rice.j : null; state.sat = null;
    setMsg('');
    renderRot(); renderTiles(); renderDetail(); renderIndic();
    if (!rot.j.unsupported) { $('rotWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); fetchSat(lat, lon); }
    clearTimeout(pollTimer);
    const job = rot.j.imerg_job;
    if (job && job.state === 'downloading') { setMsg(`Descargando la lluvia satelital IMERG de la celda de tu punto (${job.done}/${job.total} años). Mientras tanto la lluvia sale de ERA5/POWER y el resultado se actualizará solo.`); pollTimer = setTimeout(generate, 20000); }
  } catch (e) { setMsg('No se pudo conectar con el servidor: ' + e.message, 'bad'); } finally { $('btnGo').disabled = false; }
}
$('btnGo').addEventListener('click', generate);

async function fetchSat(lat, lon) {
  try { const r = await post('/api/satellite/check', { lat, lon }); state.sat = r.ok ? r.j : { error: r.j.error || 'No disponible' }; } catch { state.sat = { error: 'No disponible' }; }
  renderTiles();
}

// ---------- tarjetas de rotación: línea de tiempo agrícola ----------
const cropName = (c) => (CROP[c] ? CROP[c].name : c);
const cropImg = (c) => 'images/crops/' + (c === 'arroz' ? 'arroz.png' : c === 'loctao' ? 'loctao.svg' : 'frijol.png');
const SLOT_START = { A: [1, 21], B: [7, 15] }, SLOT_NAME = { A: 'Grande', B: 'Chica' };
const VIAB = { favorable: ['Viable', 'ok'], condicionada: ['Condicionada', 'warn'], inviable: ['No viable', 'bad'] };
const nf = (n) => Number(n).toLocaleString('es-PE', { maximumFractionDigits: 0 });
// La primera campaña es la próxima aparición de su fecha de referencia; el resto sigue su desplazamiento de años.
function firstYear(slot) { const now = new Date(), [m, d] = SLOT_START[slot]; return new Date(now.getFullYear(), m - 1, d, 23, 59) >= now ? now.getFullYear() : now.getFullYear() + 1; }
const fmtDay = (dt) => `${dt.getUTCDate()} ${MES[dt.getUTCMonth()]}`;
function y0Of(r) { return r.context && r.context.first_sowing_date ? +r.context.first_sowing_date.slice(0, 4) : firstYear(r.context.start_slot || 'A'); }
function stepDates(t, y0) {
  const [m, d] = (t.sowing_md || '').split('-').map(Number), s = new Date(Date.UTC(y0 + t.year_offset, m - 1, d)), e = new Date(s.getTime() + (t.duration_days || 0) * 864e5);
  return `${fmtDay(s)} ${s.getUTCFullYear()} → ${fmtDay(e)}${e.getUTCFullYear() !== s.getUTCFullYear() ? ' ' + e.getUTCFullYear() : ''}`;
}
function stratTitle(seq) {
  const u = [...new Set(seq)];
  if (u.length === 1) return cropName(u[0]) + ' continuo';
  return seq.every((c, i) => i === 0 || c !== seq[i - 1]) ? 'Alterna ' + u.map(cropName).join(' y ') : u.map(cropName).join(' y ') + ' combinados';
}
const sumNeed = (s) => s.timeline.reduce((a, t) => a + (t.water_need_mm || 0), 0);
function whyText(s, cur, r) {
  if (s.id === 'current') return 'Tu rotación actual proyectada: sirve de punto de comparación.' + (s.timeline.some((t) => t.viability.status === 'inviable') ? ' Incluye campañas que los datos consideran no viables.' : '');
  const out = [], dW = sumNeed(cur) - sumNeed(s), leg = s.sequence.filter((c) => c === 'loctao').length;
  if (dW > 200) out.push(`Necesita unos ${nf(dW)} mm menos de riego en cuatro campañas que tu rotación actual.`);
  else if (dW < -200) out.push(`Pide unos ${nf(-dW)} mm más de riego que tu rotación actual.`);
  if (leg && s.sequence.length !== leg) out.push('La leguminosa aporta nitrógeno y rompe la repetición del mismo cultivo.');
  if (leg === s.sequence.length) out.push('Todas las campañas son de leguminosa: sin alternancia, la repetición del cultivo acumula plagas y enfermedades.');
  if (r.keep_main) out.push(`Respeta ${cropName(r.keep_main.crop)} como cultivo principal.`);
  return out.join(' ') || 'Opción viable con puntaje relativo distinto al de tu rotación actual.';
}
function timelineHtml(s, y0) {
  return '<ol class="tl">' + s.timeline.map((t) => {
    const hi = t.viability.status === 'condicionada' && t.viability.severity === 'alta', v = hi ? ['Riesgo alto', 'bad'] : (VIAB[t.viability.status] || VIAB.favorable);
    const notes = (t.viability.local_evidence === false ? '<span class="tl-note">sin evidencia local directa</span>' : '') + (t.viability.irrigation_dependent ? '<span class="tl-note">depende del riego (no declarado)</span>' : '') + (t.viability.source_dependent ? '<span class="tl-note">depende de la fuente de lluvia</span>' : '') + (t.sowing_declared ? '<span class="tl-note ok">fecha declarada por ti</span>' : '');
    const dur = t.duration_range_days && t.duration_range_days[0] !== t.duration_range_days[1] ? t.duration_range_days.join('–') : (t.duration_days ?? '—');
    const heat = t.heat_range && Math.abs(t.heat_range[1] - t.heat_range[0]) >= 0.03 ? Math.round(t.heat_range[0] * 100) + '–' + Math.round(t.heat_range[1] * 100) : Math.round(t.heat_stress_frac * 100);
    const local = notes;
    return '<li class="tl-step st-' + v[1] + '"><span class="tl-dot" aria-hidden="true"></span><img class="tl-img" src="' + cropImg(t.crop) + '" alt="" loading="lazy">'
      + '<div class="tl-body"><div class="tl-top"><b>' + esc(cropName(t.crop)) + '</b><span class="tl-chip">' + SLOT_NAME[t.slot] + '</span><span class="tl-state ' + v[1] + '">' + v[0] + '</span></div>'
      + '<small>' + esc(stepDates(t, y0)) + ' · ' + dur + ' días</small>'
      + '<small>Riego neto ≈ ' + nf(t.water_need_mm) + ' mm · días de calor ' + heat + ' %</small>' + local + '</div></li>';
  }).join('') + '</ol>';
}
function critList(s) { return Object.entries(s.criteria || {}).map(([k, c]) => '<tr><td>' + esc(c.label) + '</td><td class="num">' + Math.round(c.score * 100) + '</td><td class="num">' + Math.round(c.weight * 100) + ' %</td></tr>').join(''); }
function rotDetailHtml(s, v, r) {
  const li = (a, cls) => (a || []).map((x) => '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(x) + '</li>').join('');
  const y0 = y0Of(r);
  return '<div class="dlg-head"><h2 id="dlgRotT">' + esc(s.label) + '</h2><button class="icon-btn" data-close aria-label="Cerrar">' + ico('x') + '</button></div>'
    + '<p class="hint"><b>Secuencia (' + s.sequence.length + ' campañas):</b> ' + esc(s.sequence.map(cropName).join(' → ')) + '</p>' + timelineHtml(s, y0)
    + '<div class="rot-stats"><div>' + ico('chart') + '<span><b>' + s.score + '</b><small>Puntaje relativo (0–100); compara opciones, no es rendimiento</small></span></div><div>' + ico('cloud') + '<span><b>' + nf(sumNeed(s)) + ' mm</b><small>Riego neto en cuatro campañas</small></span></div></div>'
    + (v ? '<p class="verdict">Frente a la actual: <b>' + esc(LEVEL[v.level] || v.level) + '</b> (' + esc(v.text) + ')</p>' : '')
    + '<h3>Cómo se puntúa esta secuencia</h3><table class="tbl"><thead><tr><th>Criterio</th><th class="num">Valor (0–100)</th><th class="num">Peso</th></tr></thead><tbody>' + critList(s) + '</tbody></table>'
    + '<p class="hint">Antes de puntuar se comprobó la viabilidad de cada campaña; las opciones no viables no compiten.</p>'
    + ((s.reasons || []).length ? '<h3>Por qué se propone</h3><ul class="checks">' + li(s.reasons) + '</ul>' : '')
    + ((s.risks || []).length || (s.violations || []).length ? '<h3>Riesgos y condiciones</h3><ul class="checks">' + li(s.risks, 'warn') + li(s.violations, 'warn') + '</ul>' : '')
    + '<h3>Campaña por campaña</h3><ul class="kv">' + s.timeline.map((t) => '<li><b>' + esc(t.crop_name) + '</b> · ' + SLOT_NAME[t.slot] + ' · ' + (VIAB[t.viability.status] || ['—'])[0] + ' · ciclo ' + (t.duration_days ?? '—') + ' d · riego neto ' + nf(t.water_need_mm) + ' mm (rango ' + nf(t.water_need_range_mm[0]) + '–' + nf(t.water_need_range_mm[1]) + ') · ETc ' + nf(t.etc_mm) + ' mm · lluvia ' + nf(t.rain_mm) + ' mm</li>').join('') + '</ul>'
    + (s.economics && s.economics.complete ? '<p class="note">Margen acumulado según los datos que declaraste: <b>S/ ' + nf(s.economics.margin_s_ha_horizon) + ' por ha</b> en cuatro campañas (no verificado).</p>' : '');
}
function noViableHtml(nv) {
  return '<div class="panel noviable"><h3>' + ico('info') + ' No hay una rotación que proponer con estos datos</h3><p>' + esc(nv.summary) + '</p>'
    + '<table class="tbl"><thead><tr><th>Campaña</th><th>Cultivo</th><th>Estado</th><th>Motivo principal</th></tr></thead><tbody>'
    + nv.by_campaign.flatMap((c) => c.crops.map((x) => '<tr><td>' + (c.slot === 'A' ? 'Grande' : 'Chica') + '</td><td>' + esc(x.name) + '</td><td><span class="tl-state ' + (VIAB[x.status] || ['', 'warn'])[1] + '">' + (VIAB[x.status] || ['—'])[0] + '</span></td><td>' + esc(x.reasons[0] || '—') + '</td></tr>')).join('') + '</tbody></table>'
    + '<h4>Qué permitiría evaluarlo</h4><ul class="checks">' + nv.what_would_help.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
}
const acc = (icon, title, body, open) => '<details class="acc"' + (open ? ' open' : '') + '><summary>' + ico(icon) + '<span>' + title + '</span>' + ico('chev') + '</summary><div class="acc-body">' + body + '</div></details>';

const CAT_CLASS = { A: 'ok', B: 'ok', C: 'ok', D: 'warn', E: 'bad' };
function provenanceHtml(r) {
  const pv = r.provenance; if (!pv) return '';
  const chip = (c, n) => '<span class="tl-state ' + CAT_CLASS[c] + '" title="' + esc(pv.legend[c]) + '">' + c + ' · ' + esc(pv.legend[c]) + '</span>';
  const used = (r.inputs_used || []).length ? '<h4>Lo que declaraste y cómo se usó</h4><ul>' + r.inputs_used.map((u) => '<li><b>' + esc(u.field) + ':</b> ' + esc(String(u.value)) + ' → ' + esc(u.used_for) + '</li>').join('') + '</ul>' : '<p class="hint">No declaraste datos de tu parcela: el análisis usa solo información geográfica, meteorológica, satelital y bibliográfica.</p>';
  const scen = r.water_scenarios ? '<h4>Escenarios de agua (no son condiciones de tu parcela)</h4><ul>' + r.water_scenarios.map((x) => '<li><b>' + esc(x.label) + '</b> — ' + esc(x.used_for) + '</li>').join('') + '</ul>' : '';
  const table = '<table class="tbl prov"><thead><tr><th>Dato</th><th>Valor</th><th>Tipo</th><th>De dónde sale</th></tr></thead><tbody>' + pv.items.map((i) => '<tr><td>' + esc(i.label) + '</td><td>' + esc(String(i.value)) + '</td><td>' + chip(i.cat) + '</td><td>' + esc(i.source) + (i.note ? ' <small>' + esc(i.note) + '</small>' : '') + '</td></tr>').join('') + '</tbody></table>';
  const legend = '<p class="hint">' + Object.keys(pv.legend).map((c) => chip(c)).join(' ') + '</p><p class="hint">Un valor de tipo <b>hipótesis</b> se propaga como rango y nunca se presenta como hecho; los datos <b>estimados</b> llevan su incertidumbre.</p>';
  return legend + used + scen + table;
}
const pctW = (x) => Math.round(100 * x) + ' %';
function interpHtml(r) {
  const lr = r.location_report || {}, T = r.temperature || {}, W = r.source_weights || {}, V = state.senamhi, pt = lr.point || {};
  const stat = (id) => { const s = (lr.sources || []).find((x) => x.id === id); return s ? (s.status === 'no_disponible' ? 'no disponible' : s.status) : '—'; };
  const rows = [
    ['Lluvia', 'GPM IMERG V07 (0,1°) como fuente principal; ERA5 y POWER como escenarios alternativos', 'Pesos de confiabilidad: IMERG ' + pctW(W.imerg || 0) + ' · POWER ' + pctW(W.power || 0) + ' · ERA5 ' + pctW(W.era5 || 0) + ' (según su error frente a SENAMHI Morropón). IMERG: ' + stat('imerg') + '.'],
    ['Temperatura', esc(T.source || '—'), esc(T.validation || '')],
    ['Días de calor', T.method === 'senamhi_monthly' ? 'Frecuencia observada en la estación SENAMHI Morropón (1981–2014)' : 'Serie corregida de reanálisis', T.method === 'senamhi_monthly' ? 'Los reanálisis corregidos subestiman 2–5 veces los días ≥ 35 °C; por eso usamos lo observado.' : 'Sin calibración mensual disponible.'],
    ['Relieve y suelo', 'SRTM (30 m) y SoilGrids (250 m) en tu punto', (pt.elevation_m != null ? pt.elevation_m + ' m de altitud, ' + pt.slope_pct + ' % de pendiente' : 'sin dato de relieve') + (pt.soil_ph != null ? ', pH ≈ ' + pt.soil_ph : ', sin dato de suelo')],
  ];
  const t1 = '<table class="tbl"><thead><tr><th>Dato</th><th>Fuente</th><th>Verificación / estado</th></tr></thead><tbody>' + rows.map((x) => '<tr><td><b>' + x[0] + '</b></td><td>' + (x[0] === 'Temperatura' ? x[1] : esc(x[1])) + '</td><td>' + (x[0] === 'Temperatura' ? x[2] : esc(x[2])) + '</td></tr>').join('') + '</tbody></table>'
    + ((lr.fallbacks || []).length ? '<p class="hint"><b>Respaldo aplicado en este punto:</b></p><ul>' + lr.fallbacks.map((f) => '<li>' + esc(f.text) + '</li>').join('') + '</ul>' : '')
    + '<p class="hint">' + esc(lr.note || '') + '</p>';
  let t2;
  if (V && V.precipitacion) {
    const f = V.precipitacion.fuentes;
    t2 = '<p>Comparamos cada fuente con la estación <b>' + esc(V.estacion.nombre) + '</b> (' + esc(V.estacion.periodo_serie) + '; lluvia con ' + V.estacion.cobertura_pct.lluvia + ' % de días válidos) en el periodo que comparten, <b>' + esc(V.periodo_comparado.inicio) + ' → ' + esc(V.periodo_comparado.fin) + '</b>, separando calibración y validación en el tiempo.</p>'
      + '<table class="tbl"><thead><tr><th>Fuente de lluvia</th><th class="num">Error mensual (mm)</th><th class="num">Sesgo</th><th class="num">Correlación (temporada ene–abr)</th><th class="num">Peso</th></tr></thead><tbody>' + f.map((x) => '<tr><td>' + esc(x.id.toUpperCase()) + '</td><td class="num">' + x.rmse_mensual_mm.toFixed(0) + '</td><td class="num">' + (x.sesgo_pct > 0 ? '+' : '') + Math.round(x.sesgo_pct) + ' %</td><td class="num">' + x.r_temporada_ene_abr.toFixed(2) + '</td><td class="num">' + pctW(x.peso) + '</td></tr>').join('') + '</tbody></table>'
      + '<ul><li><b>IMERG</b> reproduce bien las temporadas de lluvia y es la fuente principal; no le aplicamos corrección porque no mejoró de forma estable fuera de muestra.</li>'
      + '<li><b>Temperatura:</b> el sesgo de los reanálisis cambia con la estación del año, así que lo corregimos mes a mes con la estación; el error fuera de muestra es de ' + (V.temperatura.rmse_fuera_de_muestra_c ? 'Tmax ' + V.temperatura.rmse_fuera_de_muestra_c.Tmax + ' °C, Tmin ' + V.temperatura.rmse_fuera_de_muestra_c.Tmin + ' °C' : '—') + '.</li>'
      + '<li>' + esc(V.supuesto) + '</li></ul>';
  } else t2 = '<p>Comparamos cada fuente con la estación SENAMHI Morropón y usamos esa verificación para elegir y corregir los datos.</p>';
  const t3 = '<ul><li>Primero comprobamos si cada cultivo <b>puede completar su ciclo</b> en cada campaña de tu parcela (temperatura, agua, suelo, pendiente). Lo que no es viable no compite.</li>'
    + '<li>El <b>puntaje relativo (0–100)</b> compara las opciones viables entre sí. No es un rendimiento ni una ganancia.</li>'
    + '<li>Cada resultado se prueba frente a cambios plausibles en pesos, agua y fuente de lluvia; «claramente preferible» significa que gana casi siempre, y «equivalentes» que no hay diferencia real.</li>'
    + '<li>El puntaje considera agua necesaria, calor, suelo, rotación' + (r.economics && r.economics.complete ? ' y tu margen económico declarado' : '') + '.</li></ul>';
  const falta = [];
  if (r.water && r.water.scenario) falta.push('si <b>dispones de riego</b>'); if (!(r.water && r.water.supply_mm_per_campaign != null)) falta.push('el <b>volumen de riego</b> disponible por campaña');
  if (!r.keep_main) falta.push('el <b>cultivo principal</b> que quieres conservar');
  if (!(r.economics && r.economics.complete)) falta.push('tus <b>costos, rendimiento y precio</b> esperados');
  falta.push('la <b>fecha prevista de siembra</b>, el <b>ciclo observado</b> de tus cultivos, la <b>textura y el pH</b> de tu suelo y la <b>pérdida por filtración</b> del arroz');
  const t4 = '<p>Con estos datos del modo Precisa el análisis se ajusta a tu parcela: ' + falta.join(', ') + '.</p><button type="button" class="link-btn" data-open-precisa>' + ico('sprout') + ' Abrir el modo Precisa</button>';
  const prov = (r.engine_params || []).filter((p) => p.cat === 'E');
  const t5 = '<p class="hint">Valores que todavía se calibran. Se informan para que veas qué puede mover una decisión; se probaron en rangos y los resultados clave se mantienen salvo la percolación del arroz cuando el agua es limitada.</p><table class="tbl"><thead><tr><th>Parámetro</th><th>Valor</th><th>Estado</th></tr></thead><tbody>'
    + (r.engine_params || []).map((p) => '<tr><td>' + esc(p.id) + '</td><td>' + (p.value == null ? '—' : esc(String(p.value))) + (p.range ? ' (rango ' + p.range.join('–') + ')' : '') + '</td><td><span class="tl-state ' + (CAT_CLASS[p.cat] || 'warn') + '">' + esc(p.cat + ' · ' + p.status.toLowerCase()) + '</span></td></tr>').join('') + '</tbody></table>';
  return '<section class="interp" aria-labelledby="interpT"><h2 id="interpT">' + ico('info') + ' Conoce cómo interpretamos tu recomendación</h2>'
    + acc('list', '¿Cómo calculamos esta recomendación?', provenanceHtml(r), false) + acc('database', 'Qué datos trabajan por ti', t1, true) + acc('check', 'Cómo verificamos los datos', t2, false) + acc('chart', 'Cómo leer tu puntaje', t3, false)
    + acc('sprout', 'Qué puedes aportar para afinar el resultado', t4, false) + (prov.length ? acc('clock', 'Parámetros en calibración', t5, false) : '') + '</section>';
}
function renderRot() {
  const r = state.rot, wrap = $('rotWrap'); wrap.hidden = false;
  if (r.unsupported) { $('rotCards').innerHTML = '<div class="panel" style="grid-column:1/-1">' + r.support.blockers.map((b) => '<p class="note bad">' + esc(b) + '</p>').join('') + '</div>'; $('rotNotes').innerHTML = ''; return; }
  const cur = r.strategies[0], y0 = y0Of(r), cmp = r.sensitivity && r.sensitivity.comparisons;
  const vOf = (s) => (s.id === 'alt_a' && cmp ? cmp.a_vs_current : s.id === 'alt_b' && cmp ? cmp.b_vs_current : null);
  const note = r.engine === 'v2' && !r.keep_main && !(r.economics && r.economics.complete) && r.strategies.length > 1
    ? '<p class="note value-note" style="grid-column:1/-1">' + ico('info') + ' <span>Esta comparación considera agua, calor, suelo y rotación, pero <b>no incluye tu cultivo principal ni tus márgenes</b>; por eso puede favorecer al cultivo que menos agua necesita. Indícalos en el modo Precisa para afinarla. <a href="#" data-open-precisa>Abrir modo Precisa</a></span></p>' : '';
  const scen = r.water && r.water.scenario ? '<p class="note scen-note" style="grid-column:1/-1">' + ico('info') + ' <span><b>No indicaste si tienes riego.</b> Mostramos el <b>escenario con riego</b> y marcamos lo que depende de él: sin riego el arroz no es viable. Ambos son escenarios, no condiciones de tu parcela. <a href="#" data-open-irr>Indicar mi riego</a></span></p>' : '';
  const cards = r.strategies.map((s, idx) => {
    const best = s.id === 'alt_a', name = s.id === 'alt_a' ? 'Alternativa A' : s.id === 'alt_b' ? 'Alternativa B' : 'Rotación actual';
    const tag = s.id === 'current' ? ico('clock') + ' Rotación actual' : best ? ico('star') + ' Alternativa A (mayor puntaje)' : ico('sprout') + ' ' + name;
    const eco = s.economics && s.economics.complete ? '<div>' + ico('chart') + '<span><b>S/ ' + nf(s.economics.margin_s_ha_horizon) + '</b><small>Margen declarado por ha</small></span></div>' : '<div>' + ico('thermo') + '<span><b>' + Math.round(100 * mean(s.timeline.map((t) => t.heat_stress_frac))) + ' %</b><small>Días de calor, etapa media</small></span></div>';
    return '<article class="rot ' + (best ? 'best' : s.id === 'current' ? '' : 'alt') + '"><span class="rot-tag">' + tag + '</span>'
      + '<h3 class="rot-name">' + esc(stratTitle(s.sequence)) + '</h3><p class="rot-sub">' + esc(whyText(s, cur, r)) + '</p>' + (s.sensitive_to_assumptions ? '<p class="sens-flag">' + ico('alert') + ' Resultado condicionado: depende de datos no declarados o de supuestos con rango. Mira «¿Cómo calculamos esta recomendación?».</p>' : '') + timelineHtml(s, y0)
      + '<div class="rot-stats"><div>' + ico('chart') + '<span><b>' + s.score + '</b><small>Puntaje relativo (0–100)</small></span></div><div>' + ico('cloud') + '<span><b>' + nf(sumNeed(s)) + ' mm</b><small>Riego neto, 4 campañas</small></span></div>' + (s.economics && s.economics.complete ? eco : '') + '</div>'
      + '<button type="button" class="link-btn" data-rot="' + idx + '">' + ico('list') + ' Ver análisis detallado</button></article>';
  }).join('');
  $('rotCards').innerHTML = scen + note + (r.no_viable ? noViableHtml(r.no_viable) : '') + cards;
  $('rotCards').onclick = (e) => {
    const o = e.target.closest('[data-open-precisa]'); if (o) { e.preventDefault(); $('btnAdjust').click(); return; }
    if (e.target.closest('[data-open-irr]')) { e.preventDefault(); document.querySelector('input[name="irr"][value="si"]').closest('fieldset').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const b = e.target.closest('[data-rot]'); if (!b) return;
    const st = r.strategies[+b.dataset.rot];
    $('dlgRotBody').innerHTML = rotDetailHtml(st, vOf(st), r);
    const d = $('dlgRot'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  };
  $('rotNotes').innerHTML = interpHtml(r);
  $('rotNotes').onclick = (e) => { if (e.target.closest('[data-open-precisa]')) $('btnAdjust').click(); };
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// ---------- mosaicos ----------
function nextCampaign(slot) {
  const [m, d] = SLOT_START[slot];
  return { text: `${d} de ${MES_LARGO[m - 1]} de ${firstYear(slot)}`, kind: slot === 'A' ? 'grande' : 'chica' };
}
async function fetchRecent() {
  const lat = Number($('lat').value), lon = Number($('lon').value);
  try { const r = await fetch(`/api/climate/recent?lat=${lat}&lon=${lon}`); state.recent = await r.json(); } catch { state.recent = { status: 'no_disponible' }; }
  renderTiles();
}
async function loadSenamhi() {
  try { const r = await fetch('/api/validation/senamhi'); if (r.ok) state.senamhi = await r.json(); } catch { /* opcional */ }
  renderTiles(); if (state.rot && !state.rot.unsupported) $('rotNotes').innerHTML = interpHtml(state.rot);
}
function climaTile() {
  const rec = state.recent, sen = state.senamhi, mi = new Date().getMonth();
  let a;
  if (!rec) a = '<p>Consultando el clima reciente…</p>';
  else if (rec.window) {
    const w = rec.window, c = rec.comparison, stale = rec.status === 'sin_conexion', old = rec.status === 'desactualizado';
    a = '<p class="lbl">' + (stale ? 'Último dato guardado (sin conexión, no es actual)' : old ? 'Último dato disponible (desactualizado)' : 'Últimos ' + w.n + ' días registrados') + '</p>'
      + '<p class="big2s">' + w.tmean_c.toFixed(1) + ' °C <small>media</small> · ' + Math.round(w.rain_mm) + ' mm <small>lluvia</small></p>'
      + '<p class="src">Del ' + esc(fmtLong(w.from)) + ' al ' + esc(fmtLong(w.to)) + ' · NASA POWER (último dato válido: ' + esc(fmtLong(rec.last_valid_date)) + ')</p>'
      + (c && c.differs ? '<p class="src warnline">ERA5 da ' + c.era5.tmean_c.toFixed(1) + ' °C y ' + Math.round(c.era5.rain_mm) + ' mm en esas fechas: las fuentes no coinciden y no hay estación en tiempo real para decidir.</p>' : '');
  } else a = '<p>No se pudo consultar el clima reciente.</p>';
  let b = '';
  const cl = sen && sen.climatologia_2001_2014 && sen.climatologia_2001_2014[mi];
  if (cl) b = '<p class="src">Referencia histórica, estación SENAMHI Morropón 2001–2014 (' + MES_LARGO[mi] + '): Tmáx ' + cl.tmax_c.mean + ' °C · Tmín ' + cl.tmin_c.mean + ' °C · lluvia ' + Math.round(cl.pr_total_mm.mean) + ' mm en el mes.</p>';
  return '<div class="tile cloud"><img class="tile-art" src="img/montana-clima.png" alt=""><div class="ico">' + ico('cloud') + '</div><div><h3>Clima de la zona</h3>' + a + b + '</div></div>';
}
function renderTiles() {
  const slot = getSlot(), nc = nextCampaign(slot), ins = state.rice && state.rice.insitu && state.rice.insitu.supplied, mine = ins && ins.sowing_date;
  const evid = ((state.meta && state.meta.slots) || []).find((s) => s.id === slot);
  let ndvi;
  if (!state.rot) ndvi = '<p class="big">—</p><p>Genera la recomendación para consultar el verdor de tu punto.</p>';
  else if (!state.sat) ndvi = '<p class="big">…</p><p>Consultando imágenes Sentinel‑2.</p>';
  else if (state.sat.error) ndvi = '<p class="big">—</p><p>No se pudo consultar Sentinel‑2.</p>';
  else {
    const last = [...state.sat.series].reverse().find((s) => s.valid && s.scl !== 6 && s.ndvi != null), c = state.sat.classification;
    ndvi = last ? '<p class="big">' + last.ndvi.toFixed(2) + ' <small style="font-size:14px;font-weight:700">NDVI</small></p><p>Última imagen sin nubes: ' + esc(fmtLong(last.date)) + '</p><details class="tile-why"><summary>Qué significa</summary><p class="src">' + esc(c.message) + '</p><p class="src">Sentinel‑2, píxel de 10 m.</p></details>' : '<p class="big">—</p><p>Sin imágenes despejadas en el periodo.</p>';
  }
  $('tiles').innerHTML =
    '<div class="tile sky"><img class="tile-art" src="img/brote-siembra.png" alt=""><div class="ico">' + ico('calendar') + '</div><div><h3>' + (mine ? 'Tu siembra declarada' : 'Próxima campaña ' + nc.kind) + '</h3><p class="big">' + esc(mine ? fmtLong(mine) : nc.text) + '</p>'
    + '<p>' + (mine ? 'Fecha que ingresaste en modo Precisa (dato declarado, no verificado).' : 'Fecha de referencia de la campaña ' + nc.kind + '; cambia con el año y con el agua de los canales.') + '</p>'
    + (!mine && evid ? '<details class="tile-why"><summary>¿Por qué esta fecha?</summary><p class="src">' + esc(evid.evidence) + '</p></details>' : '') + '</div></div>'
    + climaTile()
    + '<div class="tile leaf"><img class="tile-art" src="img/brote-suelo.png" alt=""><div class="ico">' + ico('heartleaf') + '</div><div><h3>Vegetación del punto (NDVI)</h3>' + ndvi + '</div></div>';
}

// ---------- gráfico y detalle (fechas de siembra) ----------
function chart(w) {
  const W = 720, H = 220, pl = 34, pb = 26, n = w.length, bw = (W - pl) / n;
  const col = { viable: 'var(--ok)', marginal: 'var(--accent)', no_viable: 'var(--bad)' };
  let bars = '', lab = '';
  w.forEach((x, i) => {
    const h = (H - pb - 10) * ((x.index || 0) / 100), xx = pl + i * bw;
    bars += `<rect x="${xx + 1}" y="${H - pb - h}" width="${Math.max(2, bw - 2)}" height="${h}" fill="${col[x.status]}" rx="2"><title>${esc(fmtMD(x.month, x.day))}: índice ${x.index} · ${esc(STATUS[x.status][0])} · neto ${x.net_range_by_source_mm[0]}–${x.net_range_by_source_mm[1]} mm</title></rect>`;
    if (x.day <= 10) lab += `<text x="${xx + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${MES[x.month - 1]}</text>`;
  });
  const grid = [0, 50, 100].map((v) => { const y = H - pb - (H - pb - 10) * v / 100; return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pl - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Índice por fecha de siembra" style="width:100%;height:auto">${grid}${bars}${lab}</svg>`;
}
function stageTable(das, labels, md) {
  const rows = Object.keys(das).map((k) => `<tr><td>${esc(labels[k] || k)}</td><td class="num">${das[k] ?? '—'}</td>${md ? `<td class="num">${md[k] ? esc(fmtISO(md[k])) : '—'}</td>` : ''}</tr>`).join('');
  return `<table class="tbl"><thead><tr><th>Fase</th><th>Días tras siembra</th>${md ? '<th>Fecha típica</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}
function phaseCmp(j) {
  const lbl = { tillering: 'Macollaje', panicle: 'Panoja', flowering: 'Floración', hard_ripening: 'Maduración córnea' };
  const rows = j.insitu.phase_comparison.map((p) => '<tr><td>' + esc(lbl[p.phase] || p.phase) + '</td><td class="num">' + p.observed_das + '</td><td class="num">' + (p.instantanea_model_das ?? '—') + '</td><td class="num">' + (p.diff_days == null ? '—' : (p.diff_days > 0 ? '+' : '') + p.diff_days) + '</td></tr>').join('');
  return '<h3>¿Qué tan bien acertó el modo Instantánea con tu campaña?</h3><p class="hint">Días tras la siembra: lo observado frente a lo que habría estimado el modelo Instantánea. No es circular: tus fechas se usan aparte para recalibrar.</p><table class="tbl"><thead><tr><th>Fase</th><th>Observada</th><th>Instantánea</th><th>Diferencia (días)</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function renderDetail() {
  const j = state.rice, r = state.rot;
  if (!j) { $('detail').innerHTML = '<p class="empty">No se pudo calcular el detalle de fechas de siembra.</p>'; return; }
  if (j.unsupported) { $('detail').innerHTML = '<div class="panel">' + j.support.blockers.map((b) => '<p class="note bad">' + esc(b) + '</p>').join('') + '</div>'; return; }
  const informative = j.c2_spread && j.c2_spread.informative, hasC1 = j.windows.some((w) => w.c1_score != null);
  const top = j.top.map((w, i) => `<li class="card2"><div class="cardhead"><strong>${informative ? (i + 1) + '. ' : ''}Siembra hacia el ${esc(fmtMD(w.month, w.day))}</strong><span class="pill ${STATUS[w.status][1]}">${esc(STATUS[w.status][0])}</span></div>
    <div class="big2">${w.index}<small> / 100 · diagnóstico parcial (${w.c1_score != null ? 'C1 + C2' : 'solo C2'})</small></div>
    <ul class="kv"><li>Madurez córnea a los <b>${w.stage_das.hard_ripening ?? '—'}</b> días; floración ≈ <b>${w.stage_dates_md.flowering ? esc(fmtISO(w.stage_dates_md.flowering)) : '—'}</b></li>
    ${w.c1_score != null ? `<li>C1 (agua), con la dotación que declaraste: requerimiento <b>${w.requirement_mm} mm</b> (${w.requirement_range_mm[0]}–${w.requirement_range_mm[1]} según la lluvia usada${w.requirement_includes_percolation ? '' : '; sin filtración declarada, subestimado'}) → cubre <b>${Math.round(w.c1_score * 100)} %</b></li>` : `<li>Informativo, NO puntuado — demanda (ETc − lluvia, sin percolación ni dotación del canal): <b>${w.net_range_by_source_mm[0]}–${w.net_range_by_source_mm[1]} mm</b></li>`}
    <li>Días de calor (&gt;35 °C) en floración: <b>${Math.round(w.heat_frac_flowering * 100)} %</b> · Tmín floración ${w.tmin_flowering_c ?? '—'} °C</li>
    <li>Ciclo completo en ${Math.round(w.complete_frac * 100)} % de los años (${Math.round(w.complete_frac_cold * 100)} % con T−δ)</li></ul></li>`).join('');
  const cd = j.criteria_diagnostic && j.criteria_diagnostic.criteria, c1m = cd && cd.C1 && cd.C1.missing ? cd.C1.missing.map((m) => `<li>${esc(m)}</li>`).join('') : '';
  const c = j.chosen;
  const chosen = c ? `<div class="panel"><h2>Tu fecha de siembra: ${esc(fmtMD(c.month, c.day))}</h2>
      <ul class="kv"><li>Ciclo estimado: <b>${c.dur_days ?? '—'}</b> días hasta maduración córnea</li>
      <li>ETc del ciclo: <b>${c.etc_mm} mm</b> · lluvia: ${Object.entries(c.by_source).map(([k, v]) => `${esc(k)} ${v.rain_mm} mm`).join(' · ')}</li>
      <li>Demanda neta (ETc − lluvia, sin percolación): <b>${c.net_range_by_source_mm ? c.net_range_by_source_mm.join('–') : '—'} mm</b> ≈ ${c.net_m3_per_ha} m³/ha${c.net_m3_total != null ? ` · ${c.net_m3_total} m³ en ${j.parcel.area_ha} ha` : ''}</li>
      ${c.requirement_mm != null ? `<li>Requerimiento con tu filtración: <b>${c.requirement_mm} mm</b> frente a <b>${j.insitu.irrigation_supply_mm} mm</b> recibidos (${j.insitu.supplied.irrigation.supply_m3_ha} m³/ha)</li>` : ''}</ul>
      <h3>Fenología estimada${j.profile.calibrated ? ' (ciclo recalibrado con tus fechas)' : ''}</h3>${stageTable(c.stage_das, j.profile.stage_labels_es, c.stage_dates_md)}${j.insitu && j.insitu.phase_comparison ? phaseCmp(j) : ''}</div>`
    : `<div class="panel"><h2>Fenología de referencia (Tinajones)</h2><p class="hint">Observada por SENAMHI en Morropón, siembra 21‑ene‑2026. En modo Precisa puedes ingresar tu fecha de siembra para ver la estimada para tu parcela.</p>${stageTable(j.profile.phenology_das, j.profile.stage_labels_es, null)}</div>`;
  const rotDetail = r && !r.unsupported ? '<div class="panel"><h2>Rotaciones en detalle</h2>' + r.strategies.map((s) => '<details><summary>' + esc(s.label) + ' · ' + s.sequence.map((x) => esc(CROP[x] ? CROP[x].name : x)).join(' → ') + ' · ' + s.score + '/100</summary><ul class="kv">' + s.timeline.map((t) => '<li><b>' + esc(t.crop_name) + '</b> · ' + esc(t.slot_label) + ' · ciclo ' + (t.duration_days ?? '—') + ' d · agua ' + t.water_coverage_pct + ' % · calor ' + Math.round(t.heat_stress_frac * 100) + ' %</li>').join('') + '</ul>' + (s.risks.length ? '<div class="note warn"><ul>' + s.risks.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') + '</details>').join('') + '</div>' : '';
  $('detail').innerHTML = modeBadge(j)
    + `<div class="panel"><h2>Fechas de siembra: ${hasC1 ? 'agua declarada, fenología y riesgo térmico' : 'fenología y riesgo térmico'}</h2>
      <p class="hint"><b>Explorador, no recomendación.</b> ${hasC1 ? 'Puntúa C1 (agua, con tu dotación) y C2 (fenología y riesgo térmico); C7 (rotación) no se puntúa aquí.' : 'Solo puntúa C2 (fenología y riesgo térmico; diagnóstico parcial). C1 (agua) y C7 (rotación) no se puntúan aquí.'} Fuente de lluvia primaria: <b>${esc(j.primary_source.toUpperCase())}</b>.</p>
      ${informative ? '' : `<div class="note warn"><b>Las fechas son prácticamente indistinguibles</b> (${j.c2_spread.min}–${j.c2_spread.max} de 100): el ciclo se completa en casi todas y el calor en floración es bajo tras la corrección. ${hasC1 ? 'Ni siquiera con tu dotación de agua se separan.' : 'La diferencia real vendría del agua (C1), que no puede puntuarse sin la dotación del canal; en modo Precisa puedes declararla.'} Se muestran algunas fechas sin orden de preferencia.</div>`}
      <ol class="cards">${top}</ol>
      ${hasC1 ? '<div class="note"><b>C1 · Agua con datos declarados:</b> cociente exploratorio (agua recibida ÷ requerida), no una lámina verificada: faltan eficiencia, pérdidas y requerimiento neto/bruto.</div>' : `<div class="note"><b>C1 · Agua: sin puntuación.</b> Faltan: <ul>${c1m}</ul></div>`}</div>`
    + `<div class="panel"><h2>Todas las fechas</h2><p class="hint">Cada barra es el diagnóstico parcial de una fecha de siembra (cada 10 días). Verde = sin impedimento térmico, ámbar = dudosa.</p>${chart(j.windows)}</div>`
    + chosen + rotDetail;
}

// ---------- indicadores ----------
const SOURCES = [['SENAMHI Morropón (estación)', 'Observaciones diarias 1963–2014: referencia para validar y corregir temperatura y lluvia, y frecuencia observada de días calurosos'], ['GPM IMERG V07', 'Precipitación estimada por satélite (0,1°): fuente principal de lluvia'], ['ERA5 / ERA5-Land', 'Reanálisis: temperatura (modelo fijado) y lluvia como escenario alternativo'], ['NASA POWER', 'Radiación, humedad, viento, y temperatura/lluvia recientes (casi tiempo real)'], ['SRTM', 'Elevación y pendiente del punto (30 m)'], ['SoilGrids', 'Propiedades estimadas del suelo en el punto (250 m, modelado)'], ['Sentinel‑2', 'NDVI del punto marcado (10 m)'], ['OpenStreetMap', 'Mapa de fondo']];
const sourcesTable = () => '<table class="tbl"><thead><tr><th>Fuente</th><th>Qué obtiene</th></tr></thead><tbody>' + SOURCES.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('') + '</tbody></table>';
function renderIndic() {
  const j = state.rice; if (!j || j.unsupported) return;
  const t = j.temperature_check, b = t.before_correction, cd = j.criteria_diagnostic;
  const srcs = j.sources.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.role === 'primary' ? 'principal' : 'control')}</td><td class="num">${s.annual_precip_mm} mm/año</td></tr>`).join('');
  $('indic').innerHTML = `<div class="panel"><h2>Confianza de los datos de tu parcela</h2>
      ${j.support.cautions.length ? `<div class="note warn"><ul>${j.support.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '<p>Sin advertencias.</p>'}
      <h3>Lluvia por fuente (media anual 2015–2023)</h3><table class="tbl"><thead><tr><th>Fuente</th><th>Rol</th><th>Lluvia</th></tr></thead><tbody>${srcs}</tbody></table>
      <p class="hint">Las fuentes discrepan y no hay pluviómetro local para saber cuál acierta.</p></div>`
    + `<div class="panel"><h2>Criterios del análisis (esquema 50 / 40 / 10)</h2>
      <ul class="kv"><li><b>C1 Agua</b> (50 %): ${cd.criteria.C1.score == null ? 'sin puntuar — faltan ' + esc((cd.criteria.C1.missing || []).join('; ')) : 'cociente exploratorio ' + Math.round(cd.criteria.C1.score * 100) + ' %'}</li>
      <li><b>C2 Fenología y riesgo térmico</b> (40 %): ${cd.criteria.C2.score == null ? 'sin datos' : Math.round(cd.criteria.C2.score * 100) + ' / 100 (diagnóstico parcial)'}</li>
      <li><b>C7 Rotación</b> (10 %): se evalúa en la rotación (alternancia de cultivos), no en las fechas.</li></ul>
      <p class="hint">Estado: <b>${esc(cd.status)}</b>. Nunca es una recomendación. Cobertura de pesos conocidos: ${Math.round(cd.coverage_weight * 100)} %.</p></div>`
    + (b ? `<div class="panel"><h2>Temperatura frente a SENAMHI</h2><p class="hint">${esc(t.note)}</p><ul class="kv"><li>Sesgo antes de corregir (modelo − SENAMHI, ${b.n} valores): Tmedia <b>${b.bias_tmean_c} °C</b> · Tmáx <b>${b.bias_tmax_c} °C</b> · Tmín <b>${b.bias_tmin_c} °C</b></li></ul></div>` : '')
    + `<div class="panel"><h2>Fuentes de datos</h2>${sourcesTable()}<p class="hint">Son series numéricas de baja resolución (celdas de decenas de km), salvo Sentinel‑2 (10 m): describen la zona, no la parcela.</p></div>`;
}
async function loadValidation() {
  if (state.valid) return;
  const box = $('valid');
  try {
    const r = await fetch('/api/validation'); const v = await r.json(); if (!r.ok) throw new Error(v.error || 'sin datos'); state.valid = v;
    const f = (x) => (x == null ? '—' : (+x).toFixed(1));
    const tr = Object.entries(v.temperature).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="num">${f(x.sin_correccion.bias)}</td><td class="num">${f(x.validacion_cruzada.rmse)}</td><td class="num">${f(x.linea_base_constante.rmse)}</td></tr>`).join('');
    const oos = v.phenology_oos.map((x) => `<tr><td>${esc(x.station)} (${esc(x.variety)})</td><td class="num">${x.observed}</td><td class="num">${x.predicted ?? '—'}</td><td class="num">${x.err == null ? '—' : (x.err > 0 ? '+' : '') + x.err}</td></tr>`).join('');
    box.innerHTML = `<div class="panel"><h2>¿Qué tan bueno es el modelo? (retroprueba con SENAMHI 2026)</h2>
      <div class="note warn"><b>Resumen honesto.</b> La temperatura corregida no mejora la predicción de un valor fijo; la fenología fuera de la campaña de calibración se equivoca en promedio <b>${f(v.phenology_oos_mae_days)} días</b> (3 estaciones, variedades distintas); el orden de fechas y la rotación <b>no pueden evaluarse</b> (no hay rendimientos ni resultados de campaña).</div>
      <h3>Temperatura (°C, Morropón, 11 valores)</h3><table class="tbl"><thead><tr><th>Variable</th><th>Sesgo sin corregir</th><th>RMSE validación cruzada</th><th>RMSE línea base constante</th></tr></thead><tbody>${tr}</tbody></table>
      <h3>Fenología fuera de muestra (días)</h3><table class="tbl"><thead><tr><th>Estación</th><th>Observado</th><th>Modelo</th><th>Error</th></tr></thead><tbody>${oos}</tbody></table>
      ${v.ranking ? `<p class="hint">Poder de discriminación: ${v.ranking.viable} de ${v.ranking.total} fechas pasan como «sin impedimento térmico» (índice ${v.ranking.spread.min}–${v.ranking.spread.max}).</p>` : ''}
      <p class="hint">Generado el ${esc(String(v.generated_at).slice(0, 10))} con <code>npm run backtest</code>; detalle en <code>docs/VALIDACION_MODELO.md</code>.</p></div>`;
  } catch (e) { box.innerHTML = '<div class="panel"><h2>Retroprueba del modelo</h2><p class="empty">Aún no hay resultados de validación. Ejecuta <code>npm run backtest</code>.</p></div>'; }
}

// ---------- aprende ----------
async function renderLearn() {
  if (!state.meta) { try { state.meta = await (await fetch('/api/rice/meta')).json(); } catch { state.meta = { limitations: [] }; } }
  $('learn').innerHTML = `<div class="panel"><h2>Cómo funciona</h2><ol class="steps">
      <li><b>Ubica tu parcela</b> en el mapa (dentro de la zona de Morropón) y elige el cultivo actual.</li>
      <li><b>Reunimos datos de tu punto:</b> lluvia (IMERG principal, con ERA5 y POWER como escenarios), temperatura corregida con la estación SENAMHI Morropón, radiación y viento (NASA POWER), elevación y pendiente (SRTM) y suelo (SoilGrids).</li>
      <li><b>Comprobamos la viabilidad</b> de arroz y frijol Loctao en cada campaña: si completan su ciclo, cuánta agua necesitan y cómo les afecta el calor. Lo no viable no compite.</li>
      <li><b>Comparamos rotaciones</b> de cuatro campañas (dos años) entre las opciones viables y te mostramos tu rotación actual frente a las mejores alternativas, en una línea de tiempo.</li></ol></div>
    <div class="panel"><h2>Conceptos</h2><dl class="gloss">
      <dt>Puntaje relativo (0–100)</dt><dd>Sirve para comparar opciones entre sí. No es un rendimiento ni una probabilidad de éxito.</dd>
      <dt>ETc</dt><dd>Agua que el cultivo evapora y transpira durante su ciclo (milímetros).</dd>
      <dt>NDVI</dt><dd>Índice de verdor medido por satélite: valores altos indican vegetación densa y activa.</dd>
      <dt>Viabilidad</dt><dd>Primera etapa del análisis: favorable, condicionada o no viable según temperatura, agua, suelo y pendiente, propagando el desacuerdo entre fuentes de datos.</dd><dt>Campaña grande y chica</dt><dd>La grande (siembra ≈ 21 ene) y la chica (≈ 15 jul) son fechas de referencia documentadas; cambian con el año y con el agua de los canales.</dd>
      <dt>Modo Instantánea</dt><dd>Usa solo datos satelitales y de reanálisis de la zona.</dd>
      <dt>Modo Precisa</dt><dd>Suma datos de tu parcela: siembra real, fechas de fases, agua disponible, cultivo principal a conservar y datos económicos. Se aplican solo los que ingreses y no se guardan.</dd></dl></div>
    <div class="panel"><h2>Qué debes tener en cuenta</h2><ul class="lim">${(state.meta.limitations || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="note">Alcance: la herramienta compara opciones con arroz y frijol Loctao en el valle de Morropón. <b>No estima rendimiento ni ganancia</b> por sí misma: el margen solo se calcula con los datos que tú declares.</div></div>
    <div class="panel"><h2>Fuentes de datos</h2>${sourcesTable()}</div>`;
}

// ---------- mapa ----------
async function initMap() {
  if (typeof L === 'undefined') { // sin Leaflet (sin conexión a unpkg): coordenadas manuales
    $('lat').type = 'number'; $('lon').type = 'number'; $('map').innerHTML = '<p class="hint" style="padding:12px">No se pudo cargar el mapa. Escribe las coordenadas:</p>';
    $('map').append($('lat'), $('lon')); return;
  }
  let meta; try { meta = await (await fetch('/api/rice/meta')).json(); state.meta = meta; } catch { meta = null; }
  const b = meta && meta.scope && meta.scope.box ? meta.scope.box : { latMin: -5.30, latMax: -5.09, lonMin: -80.10, lonMax: -79.88 };
  const c = meta && meta.scope && meta.scope.center ? meta.scope.center : { lat: -5.19, lon: -79.99 };
  const bounds = [[b.latMin, b.lonMin], [b.latMax, b.lonMax]];
  const map = L.map('map', { maxBounds: L.latLngBounds(bounds).pad(1.5), minZoom: 9 }).fitBounds(bounds);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  L.rectangle(bounds, { color: '#2e8b3d', weight: 2, fillOpacity: 0.12 }).addTo(map).bindTooltip('Zona de la demo (Morropón, aprox.)');
  L.circleMarker([c.lat, c.lon], { radius: 5, color: '#d98c2b', weight: 2, fillOpacity: 0.9 }).addTo(map).bindTooltip('Estación SENAMHI Morropón');
  const inside = (lat, lon) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
  const marker = L.marker([Number($('lat').value) || c.lat, Number($('lon').value) || c.lon]).addTo(map);
  map.on('click', (e) => {
    const lat = +e.latlng.lat.toFixed(4), lon = +e.latlng.lng.toFixed(4);
    if (!inside(lat, lon)) { $('mapMsg').textContent = 'Ese punto está fuera de la zona de la demo (recuadro verde).'; return; }
    marker.setLatLng([lat, lon]); $('lat').value = lat; $('lon').value = lon; $('coords').textContent = lat + ', ' + lon;
    $('mapMsg').textContent = state.rot ? 'Cambiaste la ubicación: pulsa «Generar recomendación» para recalcular con los datos de este punto.' : 'Parcela ubicada. Pulsa «Generar recomendación».';
    fetchRecent();
  });
}

// ---------- arranque ----------
(() => { const r = document.querySelector('input[name="slot"][value="' + defaultSlot() + '"]'); if (r) r.checked = true; })();
syncMode(); renderTiles(); initMap(); loadSenamhi(); fetchRecent();
showView((location.hash || '#inicio').slice(1));
window.addEventListener('hashchange', () => showView((location.hash || '#inicio').slice(1)));
