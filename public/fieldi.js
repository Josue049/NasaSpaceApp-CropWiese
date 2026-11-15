'use strict';
/* Fieldi: asistente del análisis. Solo habla con /api/assistant/* del propio servidor (la clave de Groq NUNCA llega al navegador).
   La IA interpreta y explica; el motor agrícola calcula. El análisis activo lo conoce el servidor por la sesión (cookie HttpOnly). */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Markdown seguro: se escapa TODO el HTML primero y solo se generan estas etiquetas: negrita, cursiva, código, títulos, listas y tablas.
      (No se acepta HTML del modelo: así una respuesta nunca puede inyectar scripts ni estilos.) */
  const inline = (t) => t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  function md(t) {
    const lines = esc(t).split(/\n/), out = []; let list = false, i = 0;
    const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
    while (i < lines.length) {
      const raw = lines[i], line = raw.trim();
      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1].trim())) { // tabla
        closeList(); const head = cells(line); i += 2; const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="fi-tbl"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
          + rows.map((r) => '<tr>' + head.map((_, k) => '<td>' + inline(r[k] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      const li = /^[-•*]\s+(.*)$/.exec(line), h = /^#{1,4}\s+(.*)$/.exec(line);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(li[1]) + '</li>'); }
      else { closeList(); if (h) out.push('<p class="fi-h">' + inline(h[1]) + '</p>'); else if (line === '---') out.push('<hr>'); else if (line) out.push('<p>' + inline(line) + '</p>'); }
      i++;
    }
    closeList();
    return out.join('');
  }

  const root = document.createElement('div');
  root.innerHTML = `
    <button class="fi-fab" id="fiFab" type="button" aria-label="Abrir el chat con Fieldi" aria-expanded="false" aria-controls="fiPanel"><span class="fi-dot" id="fiDot" hidden></span></button>
    <section class="fi-panel" id="fiPanel" role="dialog" aria-label="Chat con Fieldi" hidden>
      <header class="fi-head"><div class="fi-avatar" aria-hidden="true"></div><div class="fi-title"><b>Fieldi</b><small>Te explico tu análisis</small></div>
        <button class="fi-hbtn" id="fiReset" type="button" title="Nueva conversación" aria-label="Nueva conversación">↺</button>
        <button class="fi-hbtn" id="fiClose" type="button" title="Cerrar" aria-label="Cerrar el chat">✕</button></header>
      <p class="fi-banner" id="fiBanner" hidden></p>
      <div class="fi-log" id="fiLog" role="log" aria-live="polite"></div>
      <div class="fi-chips" id="fiChips"></div>
      <form class="fi-form" id="fiForm"><textarea class="fi-in" id="fiIn" rows="1" maxlength="1000" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta para Fieldi"></textarea><button class="fi-send" id="fiSend" type="submit" aria-label="Enviar">➤</button></form>
      <p class="fi-foot">Fieldi explica los resultados del motor; no inventa datos ni garantiza cosechas.</p>
    </section>`;
  document.body.appendChild(root);
  const fab = $('#fiFab'), panel = $('#fiPanel'), log = $('#fiLog'), chips = $('#fiChips'), input = $('#fiIn'), send = $('#fiSend'), banner = $('#fiBanner'), dot = $('#fiDot');
  let busy = false, opened = false, hasAnalysis = false, lastMsg = null, statusLoaded = false;

  const j = async (url, opts) => { const r = await fetch(url, opts); let b = {}; try { b = await r.json(); } catch { /* sin cuerpo */ } return { ok: r.ok, status: r.status, b }; };
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function add(cls, html) { const d = document.createElement('div'); d.className = 'fi-msg ' + cls; d.innerHTML = html; log.appendChild(d); scroll(); return d; }
  const typing = () => { const d = document.createElement('div'); d.className = 'fi-typing'; d.setAttribute('aria-label', 'Fieldi está escribiendo'); d.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(d); scroll(); return d; };

  function welcome() {
    log.innerHTML = '';
    add('fi-bot', hasAnalysis ? '<p>¡Hola! Soy Fieldi. Ya tengo los resultados de tu parcela. Puedo explicarte por qué el motor recomienda cada opción, los riesgos, el agua y qué datos son hipótesis. ¿Qué te gustaría entender?</p>'
      : '<p>¡Hola! Soy Fieldi. Primero genera tu recomendación (elige el punto en el mapa y pulsa el botón de generar) y luego te ayudo a entenderla paso a paso.</p>');
  }
  async function loadChips() {
    chips.innerHTML = ''; if (!hasAnalysis) return;
    const r = await j('/api/assistant/suggestions'); if (!r.ok) return;
    for (const s of r.b.suggestions || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'fi-chip'; b.textContent = s; b.addEventListener('click', () => ask(s)); chips.appendChild(b); }
  }
  async function loadStatus() {
    const r = await j('/api/assistant/status'); if (!r.ok) return;
    hasAnalysis = !!r.b.has_analysis; statusLoaded = true;
    const warn = r.b.mode === 'limited' ? 'Modo limitado: la IA (Groq) aún no está activada en este servidor; respondo con los resultados del motor.'
      : r.b.reachable === false ? 'No pude verificar la conexión con la IA ahora mismo; si falla, intenta de nuevo.'
      : r.b.model_available === false ? 'El modelo de IA configurado no está disponible en la cuenta de Groq.' : '';
    banner.hidden = !warn; banner.textContent = warn;
  }

  async function ask(text) {
    text = (text || '').trim(); if (!text || busy) return;
    busy = true; send.disabled = true; lastMsg = text; chips.innerHTML = '';
    add('fi-me', esc(text).replace(/\n/g, '<br>')); input.value = ''; resize();
    const t = typing();
    try {
      const r = await j('/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      t.remove();
      if (r.ok) {
        add('fi-bot', md(r.b.reply || ''));
        if (r.b.mode === 'limited' && r.b.notice) { banner.hidden = false; banner.textContent = r.b.notice; }
        hasAnalysis = r.b.mode !== 'no_analysis';
      } else {
        const wait = r.b.retry_after ? ` Puedes reintentar en ${r.b.retry_after} s.` : '';
        const e = add('fi-err', `<p>${esc(r.b.error || 'No pude responder ahora.')}${wait}</p>`);
        if (r.status !== 400) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Reintentar'; b.addEventListener('click', () => { e.remove(); [...log.querySelectorAll('.fi-me')].pop()?.remove(); ask(lastMsg); }); e.appendChild(b); }
      }
    } catch { t.remove(); add('fi-err', '<p>No hay conexión con el servidor. Revisa tu red e intenta de nuevo.</p>'); }
    finally { busy = false; send.disabled = false; if (opened) input.focus({ preventScroll: true }); }
  }

  function resize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }
  function fitViewport() { // teclado móvil: el panel sigue la altura visible
    if (!window.visualViewport || window.innerWidth > 640 || panel.hidden) { panel.style.height = ''; return; }
    panel.style.height = window.visualViewport.height + 'px'; panel.style.top = window.visualViewport.offsetTop + 'px'; panel.style.bottom = 'auto'; scroll();
  }
  async function open() {
    opened = true; panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); dot.hidden = true;
    if (!statusLoaded) { await loadStatus(); welcome(); loadChips(); }
    fitViewport(); input.focus({ preventScroll: true }); scroll();
  }
  function close() { opened = false; panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); panel.style.height = panel.style.top = panel.style.bottom = ''; fab.focus(); }

  fab.addEventListener('click', open);
  $('#fiClose').addEventListener('click', close);
  $('#fiReset').addEventListener('click', async () => { if (busy) return; await j('/api/assistant/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await loadStatus(); welcome(); loadChips(); });
  $('#fiForm').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('input', resize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && opened) close(); });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport); }
  window.addEventListener('resize', fitViewport);

  // Un nuevo análisis reemplaza el contexto: el servidor ya lo marcó como activo; aquí se refresca la interfaz.
  window.addEventListener('fieldshift:analysis', async (ev) => {
    hasAnalysis = !!(ev.detail && ev.detail.id); statusLoaded = true;
    if (opened) { await loadStatus(); welcome(); add('fi-msg fi-sys', 'Actualicé la conversación con tu nuevo análisis.'); loadChips(); } else { statusLoaded = false; dot.hidden = false; }
  });
})();
