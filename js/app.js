/* Laboratorio de peticiones · Rick and Morty API (Vanilla JS, sin librerías) */
const API = 'https://rickandmortyapi.com/api';
const $ = (s) => document.querySelector(s);
let impl = 'async';   // 'async' | 'promise'
let forced = null;    // URL exacta para paginación o detalle
let lastList = null;  // última lista, para el botón "Volver"

/* ---------- Utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const num = (n) => (typeof n === 'number' ? n.toLocaleString('es-NI') : '—');
const stat = (l, v) => `<div class="stat"><span>${l}</span><strong>${v}</strong></div>`;
const STATUS = { Alive: ['alive', 'Vivo'], Dead: ['dead', 'Muerto'], unknown: ['unknown', 'Desconocido'] };

function buildURL(mode) {
  if (forced) { const u = forced; forced = null; return u; }
  const p = new URLSearchParams(), name = $('#name').value.trim(), status = $('#status').value;
  if (name) p.set('name', name);
  if (mode === 'character' && status) p.set('status', status);
  return `${API}/${mode}?${p}`;
}

// Resultado uniforme que devuelven ambas implementaciones
function buildResult(res, latency, data) {
  const h = (n) => res.headers.get(n); // null si la API no envía (o no expone) la cabecera
  return { ok: res.ok, status: res.status, statusText: res.statusText, latency, data, contentType: h('content-type'),
    remaining: h('ratelimit-remaining') ?? h('x-ratelimit-remaining'),
    reset: h('ratelimit-reset') ?? h('x-ratelimit-reset') ?? h('retry-after') };
}
const netError = (err, t0) => Object.assign(new Error(err.message), { network: true, latency: performance.now() - t0 });

/* ---------- OPCIÓN A: Async/Await con try/catch ---------- */
async function fetchAsyncAwait(url) {
  const t0 = performance.now();                  // inicia el reloj justo antes del fetch
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const latency = performance.now() - t0;      // detiene el reloj al recibir la respuesta
    const data = await res.json().catch(() => null); // el cuerpo puede no ser JSON
    return buildResult(res, latency, data);
  } catch (err) {
    throw netError(err, t0);                     // fallo de red / sin conexión
  }
}

/* ---------- OPCIÓN B: Promesas encadenadas .then() / .catch() ---------- */
function fetchWithPromises(url) {
  const t0 = performance.now();                  // inicia el reloj justo antes del fetch
  let res, latency;
  return fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => {
      latency = performance.now() - t0;          // detiene el reloj al recibir la respuesta
      res = r;
      return r.json().catch(() => null);         // el cuerpo puede no ser JSON
    })
    .then((data) => buildResult(res, latency, data))
    .catch((err) => { throw netError(err, t0); }); // fallo de red / sin conexión
}

/* ---------- Flujo principal ---------- */
async function runQuery() {
  const mode = $('#mode').value, url = buildURL(mode), fn = impl === 'async' ? fetchAsyncAwait : fetchWithPromises;
  $('#runBtn').disabled = true; $('#runBtn').textContent = 'Buscando…'; document.body.classList.add('loading');
  updateCode(url);
  try {
    const r = await fn(url);
    renderMetrics(r);
    $('#jsonOut').textContent = JSON.stringify(r.data, null, 2) ?? 'null';
    if (r.ok) { hideAlert(); if (r.data?.results) lastList = url; $('#tab-card').innerHTML = renderCard(mode, r.data); }
    else apiError(r);
  } catch (e) {
    renderMetrics({ status: 'ERR', statusText: 'sin respuesta', latency: e.latency });
    showAlert('No se pudo conectar con la API', 'Revisa tu conexión a internet o si alguna extensión del navegador está bloqueando la petición.', e.message);
  } finally {
    $('#runBtn').disabled = false; $('#runBtn').textContent = 'Buscar'; document.body.classList.remove('loading');
  }
}

/* ---------- Métricas ---------- */
function renderMetrics(r) {
  $('#mStatus').textContent = r.status;
  $('#mStatusText').textContent = r.statusText || (r.ok ? 'OK' : 'Error');
  $('#mStatus').closest('.metric').className = 'glass metric ' + (r.ok ? 'ok' : r.status >= 400 || r.status === 'ERR' ? 'err' : 'warn');
  $('#mLatency').textContent = r.latency != null ? r.latency.toFixed(1) : '—';
  $('#mType').textContent = r.contentType || '—';
  const na = r.status === 'ERR' ? '—' : 'No enviada por la API';
  $('#mRemaining').textContent = r.remaining ?? na;
  $('#mReset').textContent = r.reset ?? na;
}

/* ---------- Errores (esta API responde { "error": "mensaje" }) ---------- */
function apiError(r) {
  const d = r.data || {}, msg = typeof d.error === 'string' ? d.error : d.message || `La API respondió ${r.status}.`;
  const map = {
    400: ['Solicitud no válida', 'Revisa los datos que escribiste.'],
    404: ['Sin resultados', 'No hay coincidencias para ese nombre o estado. Prueba con otra palabra en inglés, por ejemplo "rick" o "earth".'],
    429: ['Límite de peticiones superado', 'La API permite 10.000 peticiones por día por IP. Al superarlo, bloquea tu IP por 12 horas.'],
  };
  const [title, hint] = map[r.status] || (r.status >= 500 ? ['El servidor no responde', 'Intenta de nuevo en unos minutos.'] : ['Respuesta no exitosa', msg]);
  showAlert(title, hint, `code: ${r.status} · error: ${msg}`, r.status === 429 || r.status === 404);
  $('#tab-card').innerHTML = '<p class="empty">No hay datos para mostrar. Revisa el aviso superior o la pestaña JSON.</p>';
}
function showAlert(title, text, tech = '', warn = false) {
  const b = $('#errorBox');
  b.className = 'alert' + (warn ? ' warn' : '');
  b.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p>${tech ? `<code>${esc(tech)}</code>` : ''}`;
  b.hidden = false;
}
const hideAlert = () => ($('#errorBox').hidden = true);

/* ---------- Tarjetas dinámicas ---------- */
function renderCard(mode, d) {
  if (d.results) return listCard(mode, d);
  if (d.id !== undefined && mode === 'character') return detailCard(d);
  return '<p class="empty">La respuesta no tiene el formato esperado. Revisa la pestaña JSON.</p>';
}

const badge = (s) => { const [c, t] = STATUS[s] || STATUS.unknown; return `<span class="badge st-${c}">${t}</span>`; };

function listCard(mode, d) {
  const i = d.info || {};
  const cards = d.results.map((x) => {
    if (mode === 'character') return `<button class="card" data-id="${x.id}" aria-label="Ver detalle de ${esc(x.name)}">
      <img loading="lazy" referrerpolicy="no-referrer" src="${esc(x.image)}" alt="${esc(x.name)}">
      <div class="card-body"><h3>${esc(x.name)}</h3>${badge(x.status)}<p>${esc(x.species)} · ${esc(x.gender)}</p><p>Origen: ${esc(x.origin?.name)}</p></div></button>`;
    if (mode === 'location') return `<article class="card"><div class="card-body"><span class="code-tag">#${x.id} · ${esc(x.type)}</span><h3>${esc(x.name)}</h3>
      <p>Dimensión: ${esc(x.dimension)}</p><p>Residentes: ${num(x.residents?.length)}</p></div></article>`;
    return `<article class="card"><div class="card-body"><span class="code-tag">${esc(x.episode)}</span><h3>${esc(x.name)}</h3>
      <p>Estreno: ${esc(x.air_date)}</p><p>Personajes: ${num(x.characters?.length)}</p></div></article>`;
  }).join('');
  const pager = (i.prev || i.next) ? `<nav class="pager">
    <button class="chip" data-url="${esc(i.prev || '')}" ${i.prev ? '' : 'disabled'}>← Anterior</button><span>${num(i.pages)} páginas</span>
    <button class="chip" data-url="${esc(i.next || '')}" ${i.next ? '' : 'disabled'}>Siguiente →</button></nav>` : '';
  return `<div class="stats">${stat('Resultados totales', num(i.count))}${stat('Páginas', num(i.pages))}${stat('En esta página', num(d.results.length))}</div>
    <div class="grid">${cards}</div>${pager}`;
}

function detailCard(c) {
  const eps = (c.episode || []).slice(0, 40).map((u) => `<span class="pill">Ep. ${esc(u.split('/').pop())}</span>`).join('');
  return `<article class="detail"><img referrerpolicy="no-referrer" src="${esc(c.image)}" alt="${esc(c.name)}"><div>
    <h2>${esc(c.name)}</h2>${badge(c.status)}
    <div class="chips"><span class="pill">${esc(c.species)}</span><span class="pill">${esc(c.gender)}</span>${c.type ? `<span class="pill">${esc(c.type)}</span>` : ''}</div>
    <div class="stats" style="margin-top:1rem">${stat('Origen', esc(c.origin?.name))}${stat('Última ubicación', esc(c.location?.name))}${stat('Episodios', num(c.episode?.length))}
      ${stat('Creado en la API', c.created ? new Date(c.created).toLocaleDateString('es-NI', { dateStyle: 'medium' }) : '—')}</div>
    <h3 style="margin:.4rem 0">Aparece en</h3><div class="chips">${eps}</div>
    ${lastList ? `<p style="margin-top:1.2rem"><button class="chip" data-url="${esc(lastList)}">← Volver a los resultados</button></p>` : ''}
  </div></article>`;
}

/* ---------- Pestaña de código: muestra el código REAL de la función usada ---------- */
function updateCode(url = '') {
  const fn = impl === 'async' ? fetchAsyncAwait : fetchWithPromises;
  $('#codeOut').textContent = `// Mecanismo activo: ${impl === 'async' ? 'Opción A (Async/Await)' : 'Opción B (Promesas)'}\n// URL: ${url || '(ejecuta una consulta)'}\n\n${fn.toString()}`;
}

/* ---------- Eventos ---------- */
const syncFields = () => { $('#fieldStatus').hidden = $('#mode').value !== 'character'; };
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); runQuery(); });
$('#mode').addEventListener('change', syncFields);
$('#implSwitch').addEventListener('change', (e) => {
  impl = e.target.checked ? 'promise' : 'async';
  $('#lblAsync').classList.toggle('active', !e.target.checked);
  $('#lblPromise').classList.toggle('active', e.target.checked);
  updateCode();
});
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab, .tab-panel').forEach((el) => el.classList.remove('active'));
  t.classList.add('active'); $('#tab-' + t.dataset.tab).classList.add('active');
}));
// Ejemplos rápidos, detalle de personaje y paginación (delegación de eventos)
document.addEventListener('click', (e) => {
  const ex = e.target.closest('.chip[data-mode]'), card = e.target.closest('[data-id]'), pg = e.target.closest('[data-url]');
  if (ex) { $('#mode').value = ex.dataset.mode; syncFields(); $('#name').value = ex.dataset.name; $('#status').value = ex.dataset.status; runQuery(); }
  else if (card) { forced = `${API}/character/${card.dataset.id}`; runQuery(); }
  else if (pg && pg.dataset.url.startsWith(API)) { forced = pg.dataset.url; runQuery(); }
});
// Si una imagen no carga, se muestra un aviso en lugar de un ícono roto
document.addEventListener('error', (e) => {
  if (e.target.tagName !== 'IMG') return;
  e.target.replaceWith(Object.assign(document.createElement('div'), { className: 'img-fail', textContent: 'Imagen no disponible' }));
}, true);
syncFields(); updateCode();
