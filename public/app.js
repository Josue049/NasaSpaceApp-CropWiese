'use strict';
// Field Shift · demo reducida (arroz Tinajones + frijol, Morropón). Todo texto dinámico pasa por esc().
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const CROP = { arroz: { name: 'Arroz', ico: '🌾' }, frijol: { name: 'Frijol', ico: '🫘' } };
const fmtMD = (m, d) => `${d} ${MES[m - 1]}`;
const fmtISO = (md) => { const [m, d] = md.split('-').map(Number); return fmtMD(m, d); };
const fmtLong = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MES_LARGO[m - 1]} de ${y}`; };
// Etiquetas prudentes: sin respaldo local ninguna fecha se declara «viable» de forma concluyente.
const STATUS = { viable: ['Sin impedimento térmico', 'ok'], marginal: ['Dudosa', 'warn'], no_viable: ['Incompatible', 'bad'] };
const LEVEL = { claramente_preferible: 'claramente preferible', probablemente_preferible: 'probablemente preferible', practicamente_equivalentes: 'prácticamente equivalentes', indistinguibles: 'indistinguibles' };
const state = { rot: null, rice: null, sat: null, valid: null, meta: null };
let pollTimer = null;

// ---------- mascota (SVG propio; si existe public/img/fieldi.png se usa esa ilustración) ----------
const MASCOT_SVG = `<svg viewBox="0 0 200 200" role="img" aria-label="Fieldi, la llama guía">
  <ellipse cx="100" cy="190" rx="62" ry="8" fill="#000" opacity=".08"/>
  <path d="M52 200 C54 150 76 138 100 138 C124 138 146 150 148 200Z" fill="#2e8b3d"/>
  <path d="M82 140 L100 170 L118 140Z" fill="#fff" opacity=".9"/><circle cx="100" cy="160" r="9" fill="#fff"/><path d="M96 164c0-8 4-11 10-12-1 7-4 11-10 12Z" fill="#2e8b3d"/>
  <ellipse cx="68" cy="52" rx="13" ry="30" fill="#f1d9b8" transform="rotate(-12 68 52)"/><ellipse cx="132" cy="52" rx="13" ry="30" fill="#f1d9b8" transform="rotate(12 132 52)"/>
  <ellipse cx="100" cy="98" rx="46" ry="44" fill="#fbeeda"/>
  <circle cx="72" cy="108" r="9" fill="#f6b4a8" opacity=".7"/><circle cx="128" cy="108" r="9" fill="#f6b4a8" opacity=".7"/>
  <path d="M78 94 q8-9 16 0" stroke="#4a3426" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M106 94 q8-9 16 0" stroke="#4a3426" stroke-width="4" fill="none" stroke-linecap="round"/>
  <ellipse cx="100" cy="108" rx="7" ry="5" fill="#d99a8a"/><path d="M88 118 q12 14 24 0" stroke="#4a3426" stroke-width="3.5" fill="#fff" stroke-linecap="round"/>
  <ellipse cx="100" cy="62" rx="62" ry="13" fill="#d98c2b"/><path d="M66 60 C66 28 134 28 134 60Z" fill="#e8a64a"/><rect x="66" y="50" width="68" height="9" fill="#b8342d"/><path d="M70 55h60" stroke="#f6d77a" stroke-width="2" stroke-dasharray="5 4"/>
</svg>`;
function mountMascot(el) {
  if (!el) return;
  el.innerHTML = MASCOT_SVG;
  const img = new Image(); img.alt = ''; img.onload = () => { el.innerHTML = ''; el.appendChild(img); }; img.src = 'img/fieldi.png';
}

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
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); showView(g.dataset.go); } });
$('btnHelp').addEventListener('click', () => showView('aprende'));

// ---------- modos: Instantánea / Precisa ----------
const getMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || 'instantanea';
const numOrNull = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
function insituPayload() {
  if (getMode() !== 'precisa') return null;
  const od = {}; for (const k of ['tillering', 'panicle', 'flowering', 'hard_ripening']) if ($('od_' + k).value) od[k] = $('od_' + k).value;
  return { sowing_date: $('sow').value || null, establishment: $('estab').value || null, variety: $('variety').value || null, observed_dates: od,
    irrigation: { management: $('irrMgmt').value || null, supply_m3_ha: numOrNull('supply'), percolation_mm_day: numOrNull('perc') } };
}
function syncMode() {
  const p = getMode() === 'precisa';
  $('precisaBox').hidden = !p;
  $('modeLabel').textContent = p ? 'Precisa' : 'Instantánea';
  $('chipMode').textContent = 'Demo · ' + (p ? 'Precisa' : 'Instantánea');
}
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', syncMode));
const dlg = $('dlg');
const openDlg = () => { syncMode(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); };
$('btnAdjust').addEventListener('click', openDlg);
$('linkAdjust').addEventListener('click', (e) => { e.preventDefault(); openDlg(); });
dlg.addEventListener('close', () => { syncMode(); if (dlg.returnValue === 'apply') generate(); });

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
  const lat = Number($('lat').value), lon = Number($('lon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return setMsg('Toca el mapa para ubicar tu parcela.', 'bad');
  $('btnGo').disabled = true; setMsg('Calculando con datos reales de la zona…');
  const mode = getMode(), insitu = insituPayload(), area = $('area').value;
  try {
    const [rot, rice] = await Promise.all([
      post('/api/rotation/analyze', { lat, lon, area_ha: area, history: [$('h0').value, $('h1').value], start_slot: $('slot').value, irrigation: $('irr').checked, mode, insitu }),
      post('/api/rice/analyze', { lat, lon, area_ha: area, sowing_date: (insitu && insitu.sowing_date) || null, mode, insitu }),
    ]);
    if (!rot.ok) { setMsg((rot.j.error || 'Error') + (rot.j.details ? ': ' + rot.j.details.join('; ') : ''), 'bad'); return; }
    state.rot = rot.j; state.rice = rice.ok ? rice.j : null; state.sat = null;
    setMsg('');
    renderRot(); renderTiles(); renderDetail(); renderIndic();
    if (!rot.j.unsupported) { $('rotWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); fetchSat(lat, lon); }
    clearTimeout(pollTimer);
    const job = rot.j.imerg_job;
    if (job && job.state === 'downloading') { setMsg(`Descargando lluvia satelital IMERG (${job.done}/${job.total} años). Mientras tanto se usa ERA5/POWER; el resultado se actualizará solo.`); pollTimer = setTimeout(generate, 20000); }
  } catch (e) { setMsg('No se pudo conectar con el servidor: ' + e.message, 'bad'); } finally { $('btnGo').disabled = false; }
}
$('btnGo').addEventListener('click', generate);

async function fetchSat(lat, lon) {
  try { const r = await post('/api/satellite/check', { lat, lon }); state.sat = r.ok ? r.j : { error: r.j.error || 'No disponible' }; } catch { state.sat = { error: 'No disponible' }; }
  renderTiles();
}

// ---------- tarjetas de rotación ----------
function seqHtml(seq) { return seq.map((c, i) => (i ? '<span class="arrow">→</span>' : '') + '<span class="crop"><span>' + (CROP[c] ? CROP[c].ico : '🌱') + '</span>' + esc(CROP[c] ? CROP[c].name : c) + '</span>').join(''); }
function renderRot() {
  const r = state.rot, wrap = $('rotWrap'); wrap.hidden = false;
  if (r.unsupported) { $('rotCards').innerHTML = '<div class="panel" style="grid-column:1/-1">' + r.support.blockers.map((b) => '<p class="note bad">' + esc(b) + '</p>').join('') + '</div>'; $('rotNotes').innerHTML = ''; return; }
  const cmp = r.sensitivity && r.sensitivity.comparisons, alts = r.strategies.filter((s) => s.id !== 'current');
  const bestId = alts.length ? alts.reduce((m, s) => (s.score > m.score ? s : m), alts[0]).id : null;
  const cards = r.strategies.map((s) => {
    const heat = s.timeline.length ? s.timeline.reduce((a, t) => a + t.heat_stress_frac, 0) / s.timeline.length : 0;
    const name = s.id === 'alt_a' ? 'Alternativa A' : s.id === 'alt_b' ? 'Alternativa B' : s.label.split(' · ')[0];
    const desc = (s.label.split(' · ')[1] || '').trim();
    const tag = s.id === 'current' ? '⏲ Rotación actual' : s.id === bestId ? '★ ' + name + ' (mayor puntaje)' : '🌱 ' + name;
    const checks = (s.reasons || []).slice(0, 2).map((x) => '<li>' + esc(x) + '</li>').join('') + (s.risks || []).slice(0, 2).map((x) => '<li class="warn">' + esc(x) + '</li>').join('') + (s.violations || []).slice(0, 1).map((x) => '<li class="warn">' + esc(x) + '</li>').join('');
    const v = s.id === 'alt_a' && cmp ? cmp.a_vs_current : s.id === 'alt_b' && cmp ? cmp.b_vs_current : null;
    return '<article class="rot ' + (s.id === bestId ? 'best' : s.id === 'current' ? '' : 'alt') + '"><span class="rot-tag">' + esc(tag) + '</span>'
      + '<div class="rot-seq">' + seqHtml(s.sequence) + '</div>'
      + '<p class="rot-sub">' + (s.id === 'current' ? 'Tu rotación actual proyectada: sirve como punto de comparación.' : (desc ? esc(desc.charAt(0).toUpperCase() + desc.slice(1)) + '. ' : '') + 'Cuatro campañas (dos años): ' + s.timeline.map((t) => t.slot === 'A' ? 'grande' : 'chica').join(' → ') + '.') + '</p>'
      + '<ul class="checks">' + checks + '</ul>'
      + '<div class="rot-stats"><div><b>' + s.score + '</b><small>Puntaje relativo (0–100), no es rendimiento</small></div><div><b>' + Math.round(heat * 100) + ' %</b><small>Días de calor en la etapa media (promedio)</small></div></div>'
      + (v ? '<p class="verdict">Frente a la actual: <b>' + esc(LEVEL[v.level] || v.level) + '</b> (' + esc(v.text) + ')</p>' : '') + '</article>';
  }).join('');
  $('rotCards').innerHTML = cards;
  const caut = r.support.cautions.map((c) => '<li>' + esc(c) + '</li>').join('');
  $('rotNotes').innerHTML = modeBadge(r) + '<div class="note warn"><b>Lectura crítica</b><ul>'
    + '<li>Con solo dos cultivos, el mayor puntaje es en gran parte <b>alternar</b> (reglas de plagas y repetición); no es evidencia agronómica de que el frijol mejore el arroz en Morropón.</li>'
    + '<li>El frijol común aparece con mucho calor en su etapa media en la campaña grande; la práctica local observada (arroz en la grande, frijol en agosto–septiembre) no necesariamente coincide con el orden propuesto.</li>'
    + '<li>No se estima rendimiento ni salud del suelo: el puntaje combina criterios con escalas ordinales provisionales.</li></ul></div>'
    + (caut ? '<div class="note warn"><b>Advertencias de los datos</b><ul>' + caut + '</ul></div>' : '');
}

// ---------- mosaicos ----------
function nextCampaign() {
  const now = new Date(), y = now.getFullYear(), c = [[y, 0, 21, 'grande'], [y, 6, 15, 'chica'], [y + 1, 0, 21, 'grande']];
  const t = c.find(([yy, m, d]) => new Date(yy, m, d, 23, 59) >= now) || c[2];
  return { text: `${t[2]} de ${MES_LARGO[t[1]]}`, kind: t[3] };
}
function renderTiles() {
  const nc = nextCampaign(), ins = state.rice && state.rice.insitu && state.rice.insitu.supplied, mine = ins && ins.sowing_date;
  const r = state.rot, prim = r && r.data_quality && r.data_quality.climate_summary ? (r.data_quality.climate_summary.find((c) => c.role === 'primary') || r.data_quality.climate_summary[0]) : null;
  const m = prim ? prim.monthly[new Date().getMonth()] : null;
  let ndvi;
  if (!state.rot) ndvi = '<p class="big">—</p><p>Genera la recomendación para consultar el verdor de tu punto.</p>';
  else if (!state.sat) ndvi = '<p class="big">…</p><p>Consultando imágenes Sentinel‑2.</p>';
  else if (state.sat.error) ndvi = '<p class="big">—</p><p>No se pudo consultar Sentinel‑2.</p>';
  else {
    const last = [...state.sat.series].reverse().find((s) => s.valid && s.scl !== 6 && s.ndvi != null), c = state.sat.classification;
    ndvi = last ? '<p class="big">' + last.ndvi.toFixed(2) + ' <small style="font-size:14px;font-weight:700">NDVI</small></p><p>Última imagen sin nubes: ' + esc(fmtLong(last.date)) + '</p><p class="src">' + esc(c.message) + '</p>' : '<p class="big">—</p><p>Sin imágenes despejadas en el periodo.</p>';
  }
  $('tiles').innerHTML =
    '<div class="tile sky"><div class="ico">📅</div><div><h3>' + (mine ? 'Tu siembra declarada' : 'Próxima campaña de referencia') + '</h3><p class="big">' + esc(mine ? fmtLong(mine) : nc.text) + '</p><p>' + (mine ? 'Fecha que ingresaste en modo Precisa.' : 'Campaña ' + nc.kind + ' de la zona.') + '</p><p class="src">' + (mine ? 'Dato declarado, no verificado.' : 'La grande (21 ene) se observó en 2026 por SENAMHI; la chica (15 jul) es un supuesto.') + '</p></div></div>'
    + '<div class="tile cloud"><div class="ico">⛅</div><div><h3>Clima de la zona</h3>' + (m ? '<p>T° media de ' + MES_LARGO[new Date().getMonth()] + ': <b>' + m.tmean.toFixed(1) + ' °C</b></p><p>Lluvia media del mes: <b>' + Math.round(m.precip_mm) + ' mm</b></p><p class="src">Climatología 2015–2023 (NASA POWER corregido + IMERG); no es el clima de esta semana.</p>' : '<p>Genera la recomendación para ver el clima típico del mes.</p>') + '</div></div>'
    + '<div class="tile leaf"><div class="ico">🌿</div><div><h3>Vegetación del punto (NDVI)</h3>' + ndvi + '<p class="src">Sentinel‑2, píxel de 10 m. No identifica la especie.</p></div></div>';
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
const SOURCES = [['NASA POWER', 'Temperatura, radiación, humedad y viento'], ['IMERG', 'Precipitación estimada mediante satélites'], ['ERA5', 'Meteorología de reanálisis'], ['SRTM', 'Elevación del terreno'], ['SoilGrids', 'Propiedades estimadas del suelo'], ['Sentinel‑2', 'Imágenes satelitales (10 m) para el NDVI del punto marcado'], ['OpenStreetMap', 'Mapa de fondo (cartografía, no imagen satelital)']];
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
      <li><b>Reunimos datos de la zona:</b> temperatura, radiación y viento (NASA POWER), lluvia (IMERG y ERA5), elevación (SRTM) y suelo (SoilGrids).</li>
      <li><b>Simulamos cada cultivo:</b> cuántos días tarda en completar su ciclo según la temperatura y cuánta agua demanda.</li>
      <li><b>Comparamos rotaciones</b> de cuatro campañas (dos años) y te mostramos tu rotación actual frente a dos alternativas, con sus riesgos.</li></ol></div>
    <div class="panel"><h2>Conceptos</h2><dl class="gloss">
      <dt>Puntaje relativo (0–100)</dt><dd>Sirve para comparar opciones entre sí. No es un rendimiento ni una probabilidad de éxito.</dd>
      <dt>ETc</dt><dd>Agua que el cultivo evapora y transpira durante su ciclo (milímetros).</dd>
      <dt>NDVI</dt><dd>Índice de verdor medido por satélite: valores altos indican vegetación densa y activa.</dd>
      <dt>C1, C2 y C7</dt><dd>Criterios del análisis: agua, fenología y riesgo térmico, y rotación. Los pesos 50/40/10 son un supuesto de diseño.</dd>
      <dt>Modo Instantánea</dt><dd>Usa solo datos satelitales y de reanálisis de la zona.</dd>
      <dt>Modo Precisa</dt><dd>Suma datos de tu parcela: siembra real, fechas de fases y riego. Se aplican solo los que ingreses y no se guardan.</dd></dl></div>
    <div class="panel"><h2>Qué debes tener en cuenta</h2><ul class="lim">${(state.meta.limitations || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="note warn">Esta herramienta <b>no estima rendimiento, ganancia ni salud del suelo</b> y no sustituye la opinión de un agrónomo local.</div></div>
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
  const c = meta && meta.scope && meta.scope.center ? meta.scope.center : { lat: -5.1944, lon: -79.9867 };
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
    $('mapMsg').textContent = 'Parcela ubicada. Pulsa «Generar recomendación».';
  });
}

// ---------- arranque ----------
mountMascot($('mascot')); mountMascot($('mascot2'));
syncMode(); renderTiles(); initMap();
showView((location.hash || '#inicio').slice(1));
window.addEventListener('hashchange', () => showView((location.hash || '#inicio').slice(1)));
