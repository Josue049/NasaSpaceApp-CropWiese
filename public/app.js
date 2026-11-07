'use strict';
/* Field Shift – cliente. Sin framework. Todo texto de usuario se escapa con esc(). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 0) => (x == null || Number.isNaN(x) ? '—' : Number(x).toLocaleString('es-PE', { maximumFractionDigits: d, minimumFractionDigits: d }));

const PRIORITIES = [
  ['protect_soil', 'Proteger el suelo', 'Menos erosión, más materia orgánica y nitrógeno'],
  ['water', 'Cuidar el agua', 'Que la lluvia cubra la demanda del cultivo'],
  ['resilience', 'Resistir sequía y calor', 'Menos años malos'],
  ['pests', 'Reducir plagas y enfermedades', 'Alternar familias botánicas'],
  ['income', 'Ingresos / mercado', 'Cultivos con salida comercial'],
  ['low_cost', 'Bajo costo de insumos', 'Menos gasto en semilla, abono y control'],
];
const DEMO = { lat: -6.034, lon: -76.971, name: 'Demo Moyobamba (San Martín)', area: 1.5, history: ['maiz', 'maiz', 'maiz', 'maiz'] };

const state = { step: 1, meta: null, lat: null, lon: null, history: [], priorities: Object.fromEntries(PRIORITIES.map((p) => [p[0], 3])), excluded: new Set(), scenario: 'base', result: null, parcelId: null, poll: null };
let map, marker;

// ---------- API ----------
async function api(path, opts) {
  const r = await fetch(path, opts && { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.details ? ': ' + j.details.join('; ') : ''}` : `HTTP ${r.status}`);
  return j;
}

// ---------- navegación ----------
function go(n) {
  state.step = n;
  $$('.panel').forEach((p, i) => { p.hidden = i + 1 !== n; });
  $$('.steps button').forEach((b) => b.classList.toggle('on', +b.dataset.step === n));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (n === 1 && map) setTimeout(() => map.invalidateSize(), 50);
}

// ---------- paso 1: mapa y parcelas ----------
function initMap() {
  map = L.map('map').setView([-6.034, -76.971], 9);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const d = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const gibs = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, { maxNativeZoom: 9, maxZoom: 14, attribution: 'NASA GIBS · MODIS Terra (solo visual)' });
  L.control.layers({ 'Mapa base': osm, 'NASA MODIS (visual, no entra al cálculo)': gibs }).addTo(map);
  map.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng));
}
function setLocation(lat, lon, zoom) {
  state.lat = +lat.toFixed(5); state.lon = +lon.toFixed(5);
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  if (zoom) map.setView([lat, lon], zoom);
  $('#coords').textContent = `Lat ${state.lat}, Lon ${state.lon}`;
}
async function loadParcels() {
  const list = await api('/api/parcels').catch(() => []);
  const ul = $('#saved'); ul.innerHTML = '';
  if (!list.length) { ul.innerHTML = '<li class="muted">Ninguna todavía</li>'; return; }
  for (const p of list) {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${esc(p.name)}</strong><br><span class="muted mono">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)} · ${p.decisions.length} decisión(es)</span></span><span><button class="ghost" data-use="${esc(p.id)}">Usar</button> <button class="ghost" data-del="${esc(p.id)}" aria-label="Eliminar ${esc(p.name)}">✕</button></span>`;
    ul.appendChild(li);
  }
  $$('[data-use]', ul).forEach((b) => b.onclick = () => { const p = list.find((x) => x.id === b.dataset.use); useParcel(p); });
  $$('[data-del]', ul).forEach((b) => b.onclick = async () => { if (confirm('¿Eliminar esta parcela y sus decisiones?')) { await api(`/api/parcels/${b.dataset.del}`, { method: 'DELETE' }); loadParcels(); } });
}
function useParcel(p) {
  state.parcelId = p.id; $('#pName').value = p.name; $('#pArea').value = p.area_ha || ''; $('#pIrrig').checked = !!p.irrigation;
  state.history = p.history?.length ? p.history : []; Object.assign(state.priorities, p.priorities || {}); state.excluded = new Set(p.excluded_crops || []);
  setLocation(p.lat, p.lon, 12); buildHistory(); buildSliders(); buildExcl();
}
async function saveParcel() {
  if (state.lat == null) return alert('Toque el mapa para ubicar la parcela.');
  const name = $('#pName').value.trim(); if (!name) return alert('Escriba un nombre para la parcela.');
  const p = await api('/api/parcels', { method: 'POST', body: { name, lat: state.lat, lon: state.lon, area_ha: +$('#pArea').value || 0, irrigation: $('#pIrrig').checked, history: state.history, priorities: state.priorities, excluded_crops: [...state.excluded] } });
  state.parcelId = p.id; loadParcels();
}

// ---------- pasos 2 y 3 ----------
function cropOptions(sel) { return `<option value="">— no sé / no sembré —</option>` + state.meta.crops.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join(''); }
function buildHistory() {
  const box = $('#histSelects'); box.innerHTML = '';
  const labels = ['Hace 4 campañas', 'Hace 3 campañas', 'Hace 2 campañas', 'Última campaña (más reciente)'];
  const h = state.history.slice(-4); while (h.length < 4) h.unshift('');
  labels.forEach((lab, i) => {
    const l = document.createElement('label'); l.innerHTML = `${lab}<select data-i="${i}">${cropOptions(h[i])}</select>`; box.appendChild(l);
  });
  $$('select', box).forEach((s) => s.onchange = () => { state.history = $$('select', box).map((x) => x.value).filter(Boolean); });
  state.history = h.filter(Boolean);
  $('#startSlot').value = state.meta.default_start_slot;
}
function buildSliders() {
  const box = $('#sliders'); box.innerHTML = '';
  for (const [k, t, d] of PRIORITIES) {
    const div = document.createElement('div'); div.className = 'slider';
    div.innerHTML = `<div class="lab"><span>${t}</span><output id="o_${k}">${state.priorities[k]}</output></div><input type="range" min="0" max="5" step="1" value="${state.priorities[k]}" aria-label="${t}"><small>${d}</small>`;
    $('input', div).oninput = (e) => { state.priorities[k] = +e.target.value; $(`#o_${k}`).textContent = e.target.value; };
    box.appendChild(div);
  }
}
function buildExcl() {
  const box = $('#excl'); box.innerHTML = '';
  for (const c of state.meta.crops) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = c.name; b.setAttribute('aria-pressed', state.excluded.has(c.id));
    b.onclick = () => { state.excluded.has(c.id) ? state.excluded.delete(c.id) : state.excluded.add(c.id); b.setAttribute('aria-pressed', state.excluded.has(c.id)); };
    box.appendChild(b);
  }
  const sc = $('#scenario'); sc.innerHTML = state.meta.scenarios.map((s) => `<option value="${s.id}">${esc(s.label)}${s.hypothetical ? ' (hipotético)' : ''}</option>`).join('');
  sc.onchange = () => { state.scenario = sc.value; };
}

// ---------- análisis ----------
async function runAnalysis(silent = false) {
  if (!silent) { go(4); $('#results').innerHTML = '<div class="loading"><div class="spin"></div><p>Consultando NASA POWER, IMERG, SRTM y SoilGrids…<br>Calculando balance hídrico y evaluando miles de secuencias.</p></div>'; }
  try {
    const r = await api('/api/analyze', { method: 'POST', body: { lat: state.lat, lon: state.lon, area_ha: +$('#pArea').value || 0, irrigation: $('#pIrrig').checked, start_slot: $('#startSlot').value, history: state.history, priorities: state.priorities, excluded_crops: [...state.excluded], scenario: state.scenario } });
    state.result = r; render(r);
    clearTimeout(state.poll);
    if (r.imerg_job?.state === 'downloading') state.poll = setTimeout(() => runAnalysis(true), 20000);
  } catch (e) { if (!silent) $('#results').innerHTML = `<div class="banner"><strong>No se pudo completar el análisis.</strong><br>${esc(e.message)}</div>`; }
}

// ---------- gráficos SVG ----------
function ring(score, color) {
  const r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, score / 100));
  return `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="Puntuación ${fmt(score, 0)} de 100"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${f * c} ${c}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" style="font:700 16px system-ui;fill:var(--ink)">${fmt(score, 0)}</text></svg>`;
}
function climateChart(sums) {
  const W = 600, H = 230, m = { l: 38, r: 8, t: 10, b: 24 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const maxV = Math.max(...sums.flatMap((s) => s.monthly.map((x) => x.precip_mm)), ...sums[0].monthly.map((x) => x.et0_mm)) * 1.1;
  const X = (i) => m.l + (i / 11) * iw, Y = (v) => m.t + ih - (v / maxV) * ih;
  const col = { imerg: 'var(--sat)', era5: 'var(--decl)', power: 'var(--reanal)' };
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(maxV / 1.1 * f)}" y2="${Y(maxV / 1.1 * f)}" stroke="var(--line)"/><text x="${m.l - 5}" y="${Y(maxV / 1.1 * f) + 4}" text-anchor="end">${fmt(maxV / 1.1 * f)}</text>`).join('');
  const mes = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((t, i) => `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${t}</text>`).join('');
  const lines = sums.map((s) => `<path d="${path(s.monthly.map((x) => x.precip_mm))}" fill="none" stroke="${col[s.id]}" stroke-width="${s.role === 'primary' ? 3 : 2}"/>`).join('');
  const et = `<path d="${path(sums[0].monthly.map((x) => x.et0_mm))}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 4"/>`;
  const legend = sums.map((s) => `<span><i style="background:${col[s.id]}"></i>${esc(s.label)}</span>`).join('') + '<span><i style="background:var(--accent)"></i>ET₀ (Penman-Monteith, calculada)</span>';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Precipitación mensual según cada fuente y evapotranspiración de referencia">${ticks}${mes}${lines}${et}<text x="${m.l}" y="9">mm/mes</text></svg><div class="legend">${legend}</div>`;
}
function criteriaChart(strats) {
  const keys = Object.keys(strats[0].criteria), col = { current: 'var(--cur)', alt_a: 'var(--a)', alt_b: 'var(--b)' };
  return keys.filter((k) => strats[0].criteria[k].score != null).map((k) => `<div class="crit"><div>${esc(strats[0].criteria[k].label)}<br><small class="muted">peso ${fmt(strats[0].criteria[k].weight * 100, 0)} % · conf. ${esc(strats[0].criteria[k].confidence)}</small></div><div class="bars">${strats.map((s) => `<div class="bar" title="${esc(s.label)}: ${fmt(s.criteria[k].score * 100)}"><i style="width:${s.criteria[k].score * 100}%;background:${col[s.id]}"></i></div>`).join('')}</div></div>`).join('') +
    `<div class="legend">${strats.map((s) => `<span><i style="background:${col[s.id]}"></i>${esc(s.label.split('·')[0].trim())}</span>`).join('')}</div>`;
}

// ---------- render de resultados ----------
function badge(kind) { return { sat: '<span class="badge b-sat">SATÉLITE</span>', rea: '<span class="badge b-rea">REANÁLISIS</span>', decl: '<span class="badge b-decl">DECLARADO</span>', est: '<span class="badge b-est">ESTIMADO</span>' }[kind]; }
function render(r) {
  const sums = r.data_quality.climate_summary, ctx = r.context, dq = r.data_quality, soil = ctx.soil;
  const rains = sums.map((s) => s.annual_precip_mm), spread = Math.max(...rains) / Math.min(...rains);
  const primary = sums.find((s) => s.role === 'primary');
  let h = '';
  if (r.scenario.hypothetical) h += `<div class="banner"><strong>Escenario hipotético:</strong> ${esc(r.scenario.label)}. Es un ejercicio de sensibilidad, no un pronóstico.</div>`;
  if (r.imerg_job?.state === 'downloading') h += `<div class="banner info"><strong>Descargando GPM IMERG</strong> (${r.imerg_job.done}/${r.imerg_job.total} años). Mientras tanto se usan las demás fuentes; este análisis se actualizará solo.</div>`;
  if (r.imerg_job?.state === 'failed') h += `<div class="banner"><strong>IMERG no disponible:</strong> ${esc((r.imerg_job.errors || []).join(' | ') || 'error de descarga')}. Confianza reducida.</div>`;
  dq.problems.forEach((p) => { if (!/IMERG incompleto/.test(p) || r.imerg_job?.state !== 'downloading') h += `<div class="banner">${esc(p)}</div>`; });
  if (dq.missing.slope) h += `<div class="banner">Pendiente no disponible (${esc(dq.missing.slope)}): se asume un valor intermedio y se reduce la confianza de erosión.</div>`;
  if (dq.missing.soil) h += `<div class="banner">Suelo no disponible (${esc(dq.missing.soil)}): el criterio de ajuste edáfico se omite.</div>`;

  const sup = r.support;
  if (sup) {
    const cls = sup.level === 'no_recomendable' ? 'banner bad' : sup.level === 'limitada' ? 'banner' : 'banner info';
    const title = { aceptable: 'Soporte de datos: aceptable (no es validación)', limitada: 'Soporte de datos: limitado', no_recomendable: 'No es responsable recomendar rotaciones en esta ubicación' }[sup.level];
    h += `<div class="${cls}"><strong>${title}</strong><ul class="plain">${[...sup.blockers, ...sup.cautions].map((x) => `<li>${esc(x)}</li>`).join('')}</ul><small>${esc(sup.note)}</small></div>`;
  }
  (r.limitations || []).forEach((x) => { if (!r.unsupported) h += `<div class="banner"><strong>Limitación:</strong> ${esc(x)}</div>`; });
  h += `<h2>Diagnóstico de la zona</h2><p class="hint">Resumen ambiental ${badge('sat')} ${badge('rea')} ${badge('est')} calculado con 9 años de datos (2015–2023).</p>`;
  h += `<div class="cards">
    <div class="card"><div class="k">Lluvia anual ${badge(primary.id === 'imerg' ? 'sat' : 'rea')}</div><div class="v">${fmt(primary.annual_precip_mm)} mm</div><div class="s">${esc(primary.label)} · celda ${primary.id === 'imerg' ? '~10' : primary.id === 'era5' ? '~25' : '~55'} km</div></div>
    <div class="card"><div class="k">ET₀ anual ${badge('est')}</div><div class="v">${fmt(sums[0].annual_et0_mm)} mm</div><div class="s">FAO-56 con datos NASA POWER</div></div>
    <div class="card"><div class="k">Pendiente ${badge('est')}</div><div class="v">${ctx.slope_pct == null ? '—' : fmt(ctx.slope_pct, 1) + ' %'}</div><div class="s">SRTM, ventana ~180 m (indicativa)</div></div>
    <div class="card"><div class="k">Suelo 0–30 cm ${badge('est')}</div><div class="v">${soil ? 'pH ' + fmt(soil.phh2o.mean, 1) : '—'}</div><div class="s">${soil ? `rango 90 %: ${fmt(soil.phh2o.q05, 1)}–${fmt(soil.phh2o.q95, 1)} · arcilla ${fmt(soil.clay.mean)} %<br>C org. ${fmt(soil.soc.mean, 0)} g/kg (${fmt(soil.soc.q05, 0)}–${fmt(soil.soc.q95, 0)})<br>SoilGrids: modelo, incertidumbre alta, no laboratorio` : 'sin datos'}</div></div>
    <div class="card"><div class="k">Riego / historial ${badge('decl')}</div><div class="v">${ctx.irrigated ? 'Con riego' : 'Secano'}</div><div class="s">${ctx.history.map(esc).join(' → ')}</div></div>
  </div>`;
  if (spread > 1.3) h += `<div class="banner"><strong>Las fuentes de lluvia no coinciden:</strong> ${sums.map((s) => `${esc(s.label)} ${fmt(s.annual_precip_mm)} mm/año`).join(' · ')}. Por eso evaluamos las rotaciones con <em>cada</em> fuente y sólo damos por robustas las conclusiones que se mantienen en todas. Contraste con un pluviómetro o datos SENAMHI si puede.</div>`;
  h += `<div class="panelchart">${climateChart(sums)}</div>`;

  if (r.unsupported) { $('#results').innerHTML = h; return; }
  const S = r.strategies, cols = { current: 'var(--cur)', alt_a: 'var(--a)', alt_b: 'var(--b)' };
  const cmp = r.sensitivity?.comparisons || {};
  h += `<h2>${S.length === 3 ? 'Tres estrategias' : S.length === 2 ? 'Dos estrategias' : 'Su rotación actual'} de rotación</h2><p class="hint">Cuatro campañas (2 años). Puntuación 0–100 = índice relativo para comparar, <strong>no un rendimiento ni una mejora medida</strong>.</p><div class="strats">`;
  for (const s of S) {
    const rb = r.robustness.by_source;
    h += `<article class="strat ${s.id}"><header>${ring(s.score, cols[s.id])}<div><h4>${esc(s.label)}</h4><span class="muted" style="font-size:13px">Puntuación por fuente de lluvia: ${Object.entries(s.totals_by_source).map(([k, v]) => `${esc(rb.find((x) => x.source === k)?.label.split(' ')[0] || k)} ${fmt(v)}`).join(' · ')}</span></div></header>
    <div class="seq">${s.timeline.map((t) => `<div><span class="slot">Año ${t.year_offset + 1} · ${t.slot}</span><b>${esc(t.crop_name)}</b>${esc(t.family)}<br>${t.water_coverage_pct}% agua</div>`).join('')}</div>`;
    if (s.violations?.length) h += `<div class="banner"><strong>Reglas agronómicas que incumple:</strong><ul class="plain">${s.violations.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div>`;
    const v = s.id === 'alt_a' ? cmp.a_vs_current : s.id === 'alt_b' ? cmp.b_vs_current : null;
    if (v) h += `<p class="hint verdict ${esc(v.level)}"><strong>${esc(v.text)}</strong> Rango de la diferencia (5–95 %): ${v.delta_p05_p50_p95[0]} a ${v.delta_p05_p50_p95[2]} puntos.</p>`;
    h += `<details><summary>Por qué, riesgos y supuestos</summary><p><strong>Argumentos</strong></p><ul class="plain">${s.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p><strong>Riesgos identificados</strong></p><ul class="plain">${s.risks.length ? s.risks.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>Sin riesgos destacados con estos datos.</li>'}</ul>
      <p><strong>Por campaña</strong></p><table><tr><th>#</th><th>Cultivo</th><th>Demanda (mm)</th><th>Lluvia (mm)</th><th>Déficit (mm)</th><th>Ciclo (días)</th><th>Térmico</th><th>Suelo sin cultivo</th></tr>${s.timeline.map((t) => `<tr><td>${t.campaign}</td><td>${esc(t.crop_name)}</td><td>${t.etc_mm}</td><td>${t.rain_mm}</td><td>${t.water_deficit_mm}</td><td>${t.duration_days ?? '—'}</td><td>${{ viable: 'viable', marginal: '⚠ marginal', no_viable: '✖ no completa' }[t.thermal.status]}</td><td>${t.bare_soil_pct} %</td></tr>`).join('')}</table>
      <p><strong>Supuestos</strong></p><ul class="plain">${s.assumptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p><strong>Lo que no sabemos</strong></p><ul class="plain">${s.unknowns.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p><strong>Pida validar a un técnico local</strong></p><ul class="plain">${s.specialist_check.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details></article>`;
  }
  if (cmp.a_vs_b) h += `<p class="hint verdict ${esc(cmp.a_vs_b.level)}"><strong>${esc(cmp.a_vs_b.text)}</strong></p>`;
  h += `</div><h2>Comparación por criterio</h2>${criteriaChart(S)}<p class="hint">Los pesos derivan de sus prioridades y son provisionales. «Conf.» indica cuánta confianza merece cada criterio según el acuerdo entre fuentes de datos y la naturaleza del dato.</p>`;

  h += `<h2>¿Qué tan firme es la conclusión?</h2><table><tr><th>Fuente de lluvia</th><th>Lluvia anual</th><th>Mejor estrategia</th><th>Puntuaciones</th></tr>${r.robustness.by_source.map((x) => `<tr><td>${esc(x.label)}</td><td>${fmt(x.annual_precip_mm)} mm</td><td>${esc(S.find((s) => s.id === x.ranking[0]).label.split('·')[0])}</td><td>${Object.entries(x.totals).map(([k, v]) => `${k === 'current' ? 'Actual' : k === 'alt_a' ? 'A' : 'B'} ${fmt(v)}`).join(' · ')}</td></tr>`).join('')}</table>
    <p class="hint">${r.robustness.all_sources_prefer_an_alternative_to_current ? '✔ En todas las fuentes, al menos una alternativa supera a su rotación actual.' : '⚠ Hay fuentes en las que su rotación actual no queda por debajo: la ventaja de cambiar depende de qué fuente de lluvia sea cierta.'} Sensibilidad: se repitió la comparación con ${r.sensitivity.draws} sorteos que varían a la vez pesos, escalas ordinales, fuente de lluvia y temperatura (±${fmt(r.sensitivity.temperature_uncertainty_c, 1)} °C). Que el resultado sea estable <strong>no lo valida agronómicamente</strong>.</p>`;

  if (r.sowing_windows) {
    const W = r.sowing_windows, mon = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const names = Object.fromEntries(state.meta.crops.map((c) => [c.id, c.name]));
    h += `<h2>Ventanas de siembra por cultivo</h2><p class="hint">Inicio cada 15 días (columnas = meses). <b>V</b> viable · <b>m</b> marginal · <b>·</b> no viable. ${esc(W.note)}</p><div class="wins"><div class="wrow wh"><span></span>${W.crops[Object.keys(W.crops)[0]].map((x) => `<i>${x.day <= 15 ? mon[x.month - 1] : ''}</i>`).join('')}</div>${Object.entries(W.crops).map(([id, arr]) => `<div class="wrow"><span>${esc(names[id] || id)}</span>${arr.map((x) => `<i class="w-${x.status}" title="${x.day}/${x.month}: ${x.status}, ciclo ${x.dur_days ?? '—'} d, completa ${Math.round(x.complete_frac * 100)} % de años (T−δ ${Math.round(x.complete_frac_cold * 100)} %), ETa/ETc ${x.sat}">${{ viable: 'V', marginal: 'm', no_viable: '·' }[x.status]}</i>`).join('')}</div>`).join('')}</div>`;
  }
  h += `<details><summary>Procedencia de cada dato</summary><table><tr><th>Dato</th><th>Fuente</th><th>Resolución / naturaleza</th></tr>${Object.entries(dq.sources).filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.source)}</a><br><span class="muted">${esc(v.variables || '')}${v.period ? ' · ' + esc(v.period) : ''}${v.fetchedAt ? ' · consultado ' + esc(v.fetchedAt.slice(0, 10)) : ''}${v.cached ? ' (caché)' : ''}</span></td><td>${esc(v.resolution || '')}<br><span class="muted">${esc(v.kind || '')}</span></td></tr>`).join('')}</table>
    ${dq.power_issues.length ? `<p class="hint"><strong>Control de calidad:</strong> ${dq.power_issues.map(esc).join('; ')}</p>` : ''}
    <p class="hint">Pesos usados: ${Object.entries(r.weights).map(([k, v]) => `${k} ${fmt(v * 100, 0)} %`).join(' · ')}. ${esc(r.weights_status)} Motor v${esc(r.engine_version)}, ${fmt(r.candidates_evaluated)} secuencias viables evaluadas.</p></details>`;

  h += `<div class="decision"><h3>Su decisión</h3><label>Estrategia elegida<select id="dChosen">${S.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></label><label>Notas (opcional)<textarea id="dNote" maxlength="500" placeholder="Ej. consultaré al técnico antes de sembrar frijol"></textarea></label><div class="row"><button id="btnDecide" class="primary">Guardar decisión en esta parcela</button></div><p id="dMsg" class="hint"></p></div>`;
  $('#results').innerHTML = h;
  $('#btnDecide').onclick = saveDecision;
}
async function saveDecision() {
  const r = state.result; if (!r) return;
  try {
    if (!state.parcelId) {
      const name = $('#pName').value.trim() || `Parcela ${new Date().toISOString().slice(0, 10)}`;
      const p = await api('/api/parcels', { method: 'POST', body: { name, lat: state.lat, lon: state.lon, area_ha: +$('#pArea').value || 0, irrigation: $('#pIrrig').checked, history: state.history, priorities: state.priorities, excluded_crops: [...state.excluded] } });
      state.parcelId = p.id;
    }
    const s = r.strategies.find((x) => x.id === $('#dChosen').value);
    await api(`/api/parcels/${state.parcelId}/decision`, { method: 'POST', body: { chosen: s.id, sequence: s.sequence, note: $('#dNote').value, engine_version: r.engine_version, scenario: r.scenario.id, weights: r.weights, scores: Object.fromEntries(r.strategies.map((x) => [x.id, x.score])) } });
    $('#dMsg').textContent = '✔ Decisión guardada con la versión del motor, escenario, pesos y puntuaciones.'; loadParcels();
  } catch (e) { $('#dMsg').textContent = 'No se pudo guardar: ' + e.message; }
}

// ---------- arranque ----------
async function init() {
  state.meta = await api('/api/meta');
  initMap(); buildHistory(); buildSliders(); buildExcl(); loadParcels();
  $$('.steps button').forEach((b) => b.onclick = () => go(+b.dataset.step));
  $$('[data-go]').forEach((b) => b.onclick = () => go(+b.dataset.go));
  $('#btnDemo').onclick = () => { setLocation(DEMO.lat, DEMO.lon, 11); $('#pName').value = DEMO.name; $('#pArea').value = DEMO.area; state.history = [...DEMO.history]; buildHistory(); };
  $('#btnGeo').onclick = () => navigator.geolocation?.getCurrentPosition((p) => setLocation(p.coords.latitude, p.coords.longitude, 13), () => alert('No se pudo obtener la ubicación.'));
  $('#btnSave').onclick = saveParcel;
  $('#next1').onclick = () => (state.lat == null ? alert('Toque el mapa para ubicar la parcela.') : go(2));
  $('#next2').onclick = () => (state.history.length ? go(3) : alert('Indique al menos el último cultivo sembrado.'));
  $('#btnRun').onclick = () => runAnalysis();
  const q = new URLSearchParams(location.search);
  if (['light', 'dark'].includes(q.get('theme'))) document.documentElement.dataset.theme = q.get('theme'); // enlaces de prueba/captura
  if (q.get('lat') && q.get('lon')) { setLocation(+q.get('lat'), +q.get('lon'), 12); state.history = [...DEMO.history]; buildHistory(); $('#startSlot').value = state.meta.default_start_slot; runAnalysis(); return; }
  if (q.get('demo') && ['2', '3'].includes(q.get('step'))) { $('#btnDemo').click(); go(+q.get('step')); return; }
  if (new URLSearchParams(location.search).get('demo')) { $('#btnDemo').click(); $('#startSlot').value = state.meta.default_start_slot; runAnalysis(); }
}
init().catch((e) => { document.body.insertAdjacentHTML('afterbegin', `<div class="banner">No se pudo iniciar: ${esc(e.message)}</div>`); });
