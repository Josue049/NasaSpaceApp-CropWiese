'use strict';
// Demo reducida: arroz Tinajones en Morropón. Todo texto dinámico se inserta con esc() / textContent.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtMD = (m, d) => `${d} ${MES[m - 1]}`;
const fmtISO = (md) => { const [m, d] = md.split('-').map(Number); return fmtMD(m, d); };
// Etiquetas prudentes: sin respaldo local ninguna fecha se declara «viable» de forma concluyente.
const STATUS = { viable: ['Sin impedimento térmico', 'ok'], marginal: ['Dudosa', 'warn'], no_viable: ['Incompatible', 'bad'] };
let pollTimer = null;

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
  const lab = $('sow').closest('label'); if (lab) lab.firstChild.textContent = p ? 'Fecha de siembra real' : 'Fecha de siembra prevista (opcional)';
}
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', syncMode));
const modeBadge = (j) => {
  if (!j || !j.mode) return '';
  const p = j.mode === 'precisa', ins = j.insitu || {};
  const ap = (ins.applied || []).map((x) => '<li>' + esc(x) + '</li>').join(''), ig = (ins.ignored || []).map((x) => '<li>' + esc(x) + '</li>').join(''), nt = (ins.notes || []).map((x) => '<li>' + esc(x) + '</li>').join('');
  const fell = j.mode_requested === 'precisa' && !p ? '<p class="note warn">Eligió Precisa pero no aportó datos utilizables: el resultado es el de la modalidad Instantánea.</p>' : '';
  return '<div class="note ' + (p ? '' : 'warn') + '"><b>Modo ' + (p ? 'Precisa' : 'Instantánea') + '</b> — ' + (p ? 'incorpora datos declarados por usted.' : 'solo datos satelitales y de reanálisis de la zona.') + fell
    + (ap ? '<p class="hint"><b>Se usó:</b></p><ul>' + ap + '</ul>' : '') + (ig ? '<p class="hint"><b>No se usó:</b></p><ul>' + ig + '</ul>' : '') + (nt ? '<ul>' + nt + '</ul>' : '') + '</div>';
};

function showMsg(text, kind) { const m = $('msg'); m.hidden = !text; m.textContent = text || ''; m.className = 'note ' + (kind || ''); }

async function run() {
  const lat = Number($('lat').value), lon = Number($('lon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return showMsg('Ingrese latitud y longitud válidas.', 'bad');
  $('btn').disabled = true; showMsg('Calculando con datos reales de la zona…');
  try {
    const r = await fetch('/api/rice/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon, area_ha: $('area').value, sowing_date: $('sow').value || null, mode: getMode(), insitu: insituPayload() }) });
    const j = await r.json();
    if (!r.ok) { $('out').hidden = true; return showMsg((j.error || 'Error') + (j.details ? ': ' + j.details.join('; ') : ''), 'bad'); }
    render(j); showMsg('');
    clearTimeout(pollTimer);
    if (j.imerg_job && j.imerg_job.state === 'downloading') { showMsg(`Descargando lluvia satelital IMERG (${j.imerg_job.done}/${j.imerg_job.total} años). Mientras tanto se usa ERA5/POWER; el resultado se actualizará solo.`, 'warn'); pollTimer = setTimeout(run, 20000); }
  } catch (e) { showMsg('No se pudo conectar con el servidor: ' + e.message, 'bad'); } finally { $('btn').disabled = false; }
}

function stageTable(das, labels, startMD) {
  const rows = Object.keys(das).map((k) => `<tr><td>${esc(labels[k] || k)}</td><td class="num">${das[k] ?? '—'}</td>${startMD ? `<td class="num">${startMD[k] ? esc(fmtISO(startMD[k])) : '—'}</td>` : ''}</tr>`).join('');
  return `<table class="tbl"><thead><tr><th>Fase</th><th>Días tras siembra</th>${startMD ? '<th>Fecha típica</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}

function chart(w, primary) {
  const W = 720, H = 220, pl = 34, pb = 26, n = w.length, bw = (W - pl) / n;
  const col = { viable: 'var(--ok)', marginal: 'var(--accent)', no_viable: 'var(--bad)' };
  let bars = '', lab = '';
  w.forEach((x, i) => {
    const h = (H - pb - 10) * (x.index / 100), xx = pl + i * bw;
    bars += `<rect x="${xx + 1}" y="${H - pb - h}" width="${Math.max(2, bw - 2)}" height="${h}" fill="${col[x.status]}" rx="2"><title>${esc(fmtMD(x.month, x.day))}: índice ${x.index} · ${esc(STATUS[x.status][0])} · neto ${x.net_range_by_source_mm[0]}–${x.net_range_by_source_mm[1]} mm</title></rect>`;
    if (x.day <= 10) lab += `<text x="${xx + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${MES[x.month - 1]}</text>`;
  });
  const grid = [0, 50, 100].map((v) => `<line x1="${pl}" x2="${W}" y1="${H - pb - (H - pb - 10) * v / 100}" y2="${H - pb - (H - pb - 10) * v / 100}" stroke="var(--line)"/><text x="${pl - 4}" y="${H - pb - (H - pb - 10) * v / 100 + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Índice relativo por fecha de siembra" style="width:100%;height:auto">${grid}${bars}${lab}</svg>`;
}

function render(j) {
  $('out').hidden = false;
  if (j.unsupported) {
    $('secTop').innerHTML = `<h2>Fuera del alcance de la demo</h2>${j.support.blockers.map((b) => `<p class="note bad">${esc(b)}</p>`).join('')}`;
    ['secChart', 'secChosen', 'secTemp'].forEach((id) => { $(id).innerHTML = ''; });
    $('secLim').innerHTML = limHtml(j); return;
  }
  const informative = j.c2_spread && j.c2_spread.informative;
  const top = j.top.map((w, i) => `<li class="card"><div class="cardhead"><strong>${informative ? (i + 1) + '. ' : ''}Siembra hacia el ${esc(fmtMD(w.month, w.day))}</strong><span class="pill ${STATUS[w.status][1]}">${esc(STATUS[w.status][0])}</span></div>
    <div class="big">${w.index}<small> / 100 · diagnóstico parcial (${w.c1_score != null ? 'C1 + C2' : 'solo C2'})</small></div>
    <ul class="kv"><li>Madurez córnea a los <b>${w.stage_das.hard_ripening ?? '—'}</b> días; floración ≈ <b>${w.stage_dates_md.flowering ? esc(fmtISO(w.stage_dates_md.flowering)) : '—'}</b></li>
    ${w.c1_score != null
      ? `<li>C1 (agua), con la dotación que usted declaró: requerimiento <b>${w.requirement_mm} mm</b> (${w.requirement_range_mm[0]}–${w.requirement_range_mm[1]} según la lluvia usada${w.requirement_includes_percolation ? '' : '; sin filtración declarada, subestimado'}) → cubre <b>${Math.round(w.c1_score * 100)} %</b></li>`
      : `<li>Informativo, NO puntuado — demanda (ETc − lluvia, sin percolación ni dotación del canal): <b>${w.net_range_by_source_mm[0]}–${w.net_range_by_source_mm[1]} mm</b> según la fuente de lluvia</li>`}
    <li>Días de calor (&gt;35 °C) en floración: <b>${Math.round(w.heat_frac_flowering * 100)} %</b> · Tmín floración ${w.tmin_flowering_c ?? '—'} °C</li>
    <li>C2 (fenología y riesgo térmico): ciclo completo en ${Math.round(w.complete_frac * 100)} % de los años (${Math.round(w.complete_frac_cold * 100)} % con T−δ)</li></ul></li>`).join('');
  const caut = j.support.cautions.map((c) => `<li>${esc(c)}</li>`).join('');
  const cd = j.criteria_diagnostic && j.criteria_diagnostic.criteria;
  const c1missing = cd && cd.C1 && cd.C1.missing ? cd.C1.missing.map((m) => `<li>${esc(m)}</li>`).join('') : '';
  const hasC1 = j.windows.some((w) => w.c1_score != null);
  $('secTop').innerHTML = `${modeBadge(j)}<h2>Fechas de siembra: ${hasC1 ? 'agua declarada, fenología y riesgo térmico' : 'fenología y riesgo térmico'}</h2>
    <p class="hint"><b>Explorador, no recomendación.</b> ${hasC1 ? 'Puntúa C1 (agua, con la dotación que usted declaró) y C2 (fenología y riesgo térmico); C7 (rotación) no se puntúa aquí.' : 'Solo puntúa C2 (fenología y riesgo térmico; diagnóstico parcial). C1 (agua) y C7 (rotación) no se puntúan aquí.'} Fuente de lluvia primaria: <b>${esc(j.primary_source.toUpperCase())}</b>.</p>
    ${informative ? '' : `<div class="note warn"><b>Las fechas son prácticamente indistinguibles</b> (${j.c2_spread.min}–${j.c2_spread.max} de 100): el ciclo se completa en casi todas y el calor en floración es bajo tras la corrección. ${hasC1 ? 'Ni siquiera con su dotación de agua se separan.' : 'La diferencia real entre fechas vendría del agua (C1), que no puede puntuarse sin la dotación del canal; en modo Precisa puede declararla.'} Se muestran algunas fechas sin orden de preferencia.</div>`}
    <ol class="cards">${top}</ol>
    ${hasC1 ? '<div class="note"><b>C1 · Agua con datos declarados:</b> es un cociente exploratorio (agua recibida ÷ requerida), no una lámina de riego verificada: faltan eficiencia, pérdidas y requerimiento neto/bruto.</div>' : `<div class="note"><b>C1 · Agua: sin puntuación.</b> Faltan: <ul>${c1missing}</ul></div>`}
    ${caut ? `<div class="note warn"><b>Advertencias de los datos</b><ul>${caut}</ul></div>` : ''}`;
  $('secChart').innerHTML = `<h2>Todas las fechas</h2><p class="hint">Cada barra es el diagnóstico parcial de una fecha de siembra (cada 10 días). Verde = sin impedimento térmico, ámbar = dudosa. Pase el cursor/toque para ver el detalle.</p>${chart(j.windows, j.primary_source)}`;
  const c = j.chosen;
  if (c) {
    $('secChosen').innerHTML = `<h2>Su fecha de siembra: ${esc(fmtMD(c.month, c.day))}</h2>
      <ul class="kv"><li>Ciclo estimado: <b>${c.dur_days ?? '—'}</b> días hasta maduración córnea (calibrado, no independiente)</li>
      <li>ETc del ciclo: <b>${c.etc_mm} mm</b> · lluvia: ${Object.entries(c.by_source).map(([k, v]) => `${esc(k)} ${v.rain_mm} mm`).join(' · ')}</li>
      <li>Demanda neta (ETc − lluvia, sin percolación): <b>${c.net_range_by_source_mm ? c.net_range_by_source_mm.join('–') : Object.values(c.by_source).map((v) => v.net_mm).join(' / ')} mm</b> ≈ ${c.net_m3_per_ha} m³/ha${c.net_m3_total != null ? ` · ${c.net_m3_total} m³ en ${j.parcel.area_ha} ha` : ''} (fuente primaria)</li>
      <li>Rango entre años (p10–p90): ${c.net_p10_mm}–${c.net_p90_mm} mm</li>
      ${c.requirement_mm != null ? `<li>Requerimiento de agua con su filtración: <b>${c.requirement_mm} mm</b> frente a <b>${j.insitu.irrigation_supply_mm} mm</b> recibidos (${j.insitu.supplied.irrigation.supply_m3_ha} m³/ha)</li>` : ''}</ul>
      <h3>Fenología estimada${j.profile.calibrated ? ' (ciclo recalibrado con sus fechas)' : ''}</h3>${stageTable(c.stage_das, j.profile.stage_labels_es, c.stage_dates_md)}
      ${j.insitu && j.insitu.phase_comparison ? phaseCmp(j) : ''}`;
  } else {
    $('secChosen').innerHTML = `<h2>Fenología de referencia (Tinajones)</h2><p class="hint">Observada por SENAMHI en Morropón, siembra 21‑ene‑2026. Indique una fecha de siembra para ver la estimada para su parcela.</p>${stageTable(j.profile.phenology_das, j.profile.stage_labels_es, null)}`;
  }
  const t = j.temperature_check, b = t.before_correction;
  $('secTemp').innerHTML = `<h2>Contraste de temperatura con SENAMHI</h2>
    <p class="hint">${esc(t.note)}</p>
    ${b ? `<ul class="kv"><li>Sesgo del modelo antes de corregir (modelo − SENAMHI, ${b.n} valores): Tmedia <b>${b.bias_tmean_c} °C</b> · Tmáx <b>${b.bias_tmax_c} °C</b> · Tmín <b>${b.bias_tmin_c} °C</b></li>
    <li>Causa probable: la celda de NASA POWER está ${j.support.cautions.some((x) => /933|m de diferencia/.test(x)) ? 'cientos de metros más alta' : 'a otra altitud'} y el gradiente estándar sobrecalienta la parcela.</li></ul>
    <details><summary>Ver valores comparados</summary><table class="tbl"><thead><tr><th>Evento</th><th>Fecha</th><th>Tmedia SENAMHI</th><th>Tmedia modelo</th><th>Tmáx SENAMHI</th><th>Tmáx modelo</th></tr></thead><tbody>${b.rows.map((r) => `<tr><td>${esc(r.event)}</td><td>${esc(r.date)}</td><td class="num">${r.reported_tmean_c}</td><td class="num">${r.model_tmean_c}</td><td class="num">${r.reported_tmax_c}</td><td class="num">${r.model_tmax_c}</td></tr>`).join('')}</tbody></table></details>` : '<p>Sin contraste disponible.</p>'}`;
  $('secLim').innerHTML = limHtml(j);
}

function phaseCmp(j) {
  const lbl = { tillering: 'Macollaje', panicle: 'Panoja', flowering: 'Floración', hard_ripening: 'Maduración córnea' };
  const rows = j.insitu.phase_comparison.map((p) => '<tr><td>' + esc(lbl[p.phase] || p.phase) + '</td><td class="num">' + p.observed_das + '</td><td class="num">' + (p.instantanea_model_das ?? '—') + '</td><td class="num">' + (p.diff_days == null ? '—' : (p.diff_days > 0 ? '+' : '') + p.diff_days) + '</td></tr>').join('');
  return '<h3>¿Qué tan bien acertó el modo Instantánea con su campaña?</h3><p class="hint">Días tras la siembra: lo que usted observó frente a lo que habría estimado el modelo Instantánea (ciclo de SENAMHI 2026). Esta comparación no es circular: las fechas se usaron aparte para recalibrar su ciclo.</p><table class="tbl"><thead><tr><th>Fase</th><th>Observada</th><th>Instantánea</th><th>Diferencia (días)</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function limHtml(j) {
  return `<h2>Límites que debe conocer</h2><ul class="lim">${j.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <details><summary>Reservas de la fuente de fenología</summary><ul class="lim">${(j.flags || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`;
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); run(); });

// ---------- rotación (arroz Tinajones + frijol) ----------
const CROP_ES = { arroz: 'Arroz', frijol: 'Frijol' };
const LEVEL = { claramente_preferible: 'claramente preferible', probablemente_preferible: 'probablemente preferible', practicamente_equivalentes: 'prácticamente equivalentes', indistinguibles: 'indistinguibles' };
async function runRot() {
  const lat = Number($('lat').value), lon = Number($('lon').value);
  const box = $('rotOut'); box.hidden = false; box.innerHTML = '<p class="hint">Calculando rotaciones…</p>'; $('btnRot').disabled = true;
  try {
    const r = await fetch('/api/rotation/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon, area_ha: $('area').value, history: [$('h0').value, $('h1').value], start_slot: $('slot').value, irrigation: $('irr').checked, mode: getMode(), insitu: insituPayload() }) });
    const j = await r.json();
    if (!r.ok) { box.innerHTML = '<p class="note bad">' + esc((j.error || 'Error') + (j.details ? ': ' + j.details.join('; ') : '')) + '</p>'; return; }
    if (j.unsupported) { box.innerHTML = j.support.blockers.map((b) => '<p class="note bad">' + esc(b) + '</p>').join(''); return; }
    box.innerHTML = rotHtml(j);
  } catch (e) { box.innerHTML = '<p class="note bad">No se pudo conectar: ' + esc(e.message) + '</p>'; } finally { $('btnRot').disabled = false; }
}
function rotHtml(j) {
  const cmp = j.sensitivity && j.sensitivity.comparisons;
  const badge = modeBadge(j);
  const cards = j.strategies.map((s) => {
    const seq = s.timeline.map((t) => '<li><b>' + esc(t.crop_name) + '</b> · ' + esc(t.slot_label) + ' · ciclo ' + (t.duration_days ?? '—') + ' d · agua ' + t.water_coverage_pct + ' % · calor ' + Math.round(t.heat_stress_frac * 100) + ' %</li>').join('');
    const risks = s.risks.slice(0, 4).map((x) => '<li>' + esc(x) + '</li>').join('');
    const cc = s.criteria_c1_c2_c7 && s.criteria_c1_c2_c7.criteria; const c7 = cc && cc.C7 && cc.C7.score != null ? Math.round(cc.C7.score * 100) : null;
    const viol = (s.violations || []).map((x) => '<li>' + esc(x) + '</li>').join('');
    const v = s.id === 'alt_a' && cmp ? cmp.a_vs_current : s.id === 'alt_b' && cmp ? cmp.b_vs_current : null;
    return '<li class="card"><div class="cardhead"><strong>' + esc(s.label) + '</strong></div><div class="big">' + s.score + '<small> / 100 (relativo)</small></div>'
      + '<p class="mono">' + s.sequence.map((c) => esc(CROP_ES[c] || c)).join(' → ') + '</p><ul class="kv">' + seq + '</ul>'
      + '<p class="hint">Criterios del esquema 50/40/10 — C1 agua: <b>sin puntuar</b> (falta dotación y requerimiento total) · C2 fenología/térmico: <b>sin puntuar</b> (el motor genérico mide calor en etapa media, no en floración) · C7 alternancia: <b>' + (c7 == null ? '—' : c7 + ' / 100') + '</b> (solo diversidad de sucesión; no estima N ni sanidad).</p>'
      + (v ? '<p class="hint">Frente a la actual: <b>' + esc(LEVEL[v.level] || v.level) + '</b> (' + esc(v.text) + ')</p>' : '')
      + (viol ? '<div class="note bad"><b>Reglas que incumple</b><ul>' + viol + '</ul></div>' : '')
      + (risks ? '<div class="note warn"><b>Riesgos</b><ul>' + risks + '</ul></div>' : '') + '</li>';
  }).join('');
  const caut = j.support.cautions.map((c) => '<li>' + esc(c) + '</li>').join('');
  return badge + '<ol class="cards">' + cards + '</ol>'
    + '<div class="note warn"><b>Lectura crítica</b><ul>'
    + '<li>Con solo dos cultivos, la «mejor» rotación es en gran parte <b>alternar</b> (reglas de plagas y repetición); no es evidencia agronómica de que el frijol mejore el arroz en Morropón.</li>'
    + '<li>El frijol común aparece con mucho calor en su etapa media en la campaña grande; la práctica local observada (arroz en la grande, frijol en agosto–septiembre) no coincide necesariamente con el orden propuesto.</li>'
    + '<li>La rotación usa los criterios del motor genérico (incluye mercado, costo, suelo y plagas con escalas <b>ordinales provisionales</b>); no usa todavía los pesos 50/40/10 de <code>docs/CRITERIOS_ARROZ.md</code>.</li>'
    + '<li>Las campañas (21‑ene y 15‑jul) son un supuesto con evidencia débil.</li></ul></div>'
    + (caut ? '<div class="note warn"><b>Advertencias de los datos</b><ul>' + caut + '</ul></div>' : '');
}
$('rotForm').addEventListener('submit', (e) => { e.preventDefault(); runRot(); });

// ---------- mapa de selección de parcela ----------
async function initMap() {
  const msg = $('mapMsg');
  if (typeof L === 'undefined') { // sin Leaflet (sin conexión a unpkg): se habilitan los campos numéricos
    $('lat').readOnly = false; $('lon').readOnly = false; $('map').hidden = true;
    msg.textContent = 'No se pudo cargar el mapa: escriba las coordenadas manualmente.'; return;
  }
  let meta;
  try { meta = await (await fetch('/api/rice/meta')).json(); } catch { meta = null; }
  const b = meta && meta.scope && meta.scope.box ? meta.scope.box : { latMin: -5.30, latMax: -5.09, lonMin: -80.10, lonMax: -79.88 };
  const c = meta && meta.scope && meta.scope.center ? meta.scope.center : { lat: -5.1944, lon: -79.9867 };
  const bounds = [[b.latMin, b.lonMin], [b.latMax, b.lonMax]];
  const map = L.map('map', { maxBounds: L.latLngBounds(bounds).pad(1.5), minZoom: 9 }).fitBounds(bounds);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  L.rectangle(bounds, { color: '#2b5d34', weight: 2, fillOpacity: 0.05 }).addTo(map).bindTooltip('Zona de la demo (Morropón, aprox.)');
  L.circleMarker([c.lat, c.lon], { radius: 5, color: '#c9822b', weight: 2, fillOpacity: 0.9 }).addTo(map).bindTooltip('Estación SENAMHI Morropón');
  const inside = (lat, lon) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
  let marker = L.marker([Number($('lat').value) || c.lat, Number($('lon').value) || c.lon]).addTo(map);
  map.on('click', (e) => {
    const lat = +e.latlng.lat.toFixed(4), lon = +e.latlng.lng.toFixed(4);
    if (!inside(lat, lon)) { msg.textContent = 'Ese punto está fuera de la zona de la demo (recuadro verde). Elija un punto dentro del recuadro.'; return; }
    marker.setLatLng([lat, lon]); $('lat').value = lat; $('lon').value = lon;
    msg.textContent = 'Parcela ubicada en ' + lat + ', ' + lon + '.';
  });
}
initMap();
