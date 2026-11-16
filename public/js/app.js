/* DevStore · utilidades compartidas de la interfaz */
(() => {
  const $ = (sel, root = document) => {
    if (typeof sel !== 'string') return sel;
    return sel.startsWith('#') ? root.querySelector(sel) : (root.getElementById(sel) || root.querySelector(sel));
  };
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = () => new URLSearchParams(location.search);

  /* ---------- Tema ---------- */
  const THEME_KEY = 'devstore_theme';
  const theme = {
    get() {
      try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
      } catch {}
      return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    },
    apply(t) { document.documentElement.dataset.theme = t; },
    set(t) { try { localStorage.setItem(THEME_KEY, t); } catch {} this.apply(t); this.paint(); },
    toggle() { this.set(this.get() === 'light' ? 'dark' : 'light'); },
    paint() {
      const b = $('themeBtn');
      if (!b) return;
      const light = this.get() === 'light';
      b.textContent = light ? '🌙' : '☀️';
      b.setAttribute('aria-label', light ? 'Activar modo oscuro' : 'Activar modo claro');
      b.title = b.getAttribute('aria-label');
    }
  };
  theme.apply(theme.get());

  /* ---------- Toasts ---------- */
  function toast(text, kind = 'ok') {
    let box = $('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.append(box);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind === 'err' ? 'err' : '');
    t.textContent = text;
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3600);
  }

  /* ---------- API ---------- */
  async function api(url, options = {}) {
    const { method = 'GET', body, headers = {} } = options;
    const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    let data = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await r.json().catch(() => null);
    else data = await r.text().catch(() => '');
    if (!r.ok) {
      const err = new Error((data && data.error) || 'No se pudo completar la operación');
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------- Sesión ---------- */
  let _user = null, _loaded = false, _loading = null;
  async function me(force = false) {
    if (!force && _loaded) return _user;
    if (_loading) return _loading;
    _loading = (async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (r.ok) _user = await r.json();
        else _user = null;
      } catch { _user = null; }
      _loaded = true;
      _loading = null;
      return _user;
    })();
    return _loading;
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    _user = null; _loaded = false;
    location.href = '/';
  }

  async function requireAuth(roles) {
    const u = await me(true);
    if (!u) {
      location.href = '/acceso.html?next=' + encodeURIComponent(location.pathname + location.search);
      return null;
    }
    if (roles && !roles.includes(u.rol)) {
      toast('No tienes permisos para acceder a esta página', 'err');
      setTimeout(() => { location.href = '/'; }, 700);
      return null;
    }
    return u;
  }

  /* ---------- Header ---------- */
  const LINKS = u => {
    const links = [{ href: '/cursos.html', label: 'Cursos', key: 'cursos' }];
    if (u) links.push({ href: '/mensajes.html', label: 'Mensajes', key: 'mensajes' });
    if (u && u.rol === 'instructor') links.push({ href: '/instructor.html', label: 'Panel instructor', key: 'instructor' });
    else links.push({ href: '/acceso.html?tab=instructor', label: 'Enseña en DevStore', key: 'ensenar' });
    if (u && u.rol === 'cliente') links.push({ href: '/perfil.html#mis-cursos', label: 'Mi aprendizaje', key: 'perfil' });
    if (u && u.rol === 'instructor') links.push({ href: '/perfil.html', label: 'Mi perfil', key: 'perfil' });
    if (u && u.rol === 'administrador') links.push({ href: '/admin.html', label: 'Administración', key: 'admin' });
    return links;
  };

  async function mountHeader(active, options = {}) {
    const hdr = $('hdr');
    if (!hdr) return me();
    const u = await me(options.force);
    const q = params().get('q') || '';
    const navLinks = LINKS(u).map(l =>
      `<a href="${l.href}" class="${l.key === active ? 'active' : ''}"${l.key === active ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`
    ).join('');
    const userArea = u
      ? `<div class="user-chip"><a class="avatar" href="/perfil.html" title="Mi perfil">${esc(initials(u.nombre + ' ' + (u.apellidos || '')))}</a><span class="uname">${esc(u.nombre)}</span><button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Salir</button></div>`
      : `<a class="btn btn-ghost btn-sm" href="/acceso.html">Entrar</a><a class="btn btn-primary btn-sm" href="/acceso.html?tab=cliente">Crear cuenta</a>`;
    const social = u
      ? `<a class="icon-btn social-btn" id="msgBtn" href="/mensajes.html" aria-label="Mensajes" title="Mensajes">✉️<span class="badge-dot" id="msgBadge" hidden></span></a>
         <button class="icon-btn social-btn" id="notifBtn" type="button" aria-label="Notificaciones" aria-haspopup="dialog" aria-expanded="false" title="Notificaciones">🔔<span class="badge-dot" id="notifBadge" hidden></span></button>`
      : '';

    hdr.outerHTML = `<header class="hdr" id="hdr">
      <div class="container hdr-in">
        <a class="logo" href="/" aria-label="DevStore, inicio"><span class="logo-mark">&lt;/&gt;</span><span class="logo-text">Dev<strong>Store</strong></span></a>
        <nav class="nav" id="nav" aria-label="Navegación principal">${navLinks}</nav>
        <form class="hdr-search search-wrap" action="/cursos.html" method="get" role="search">
          <input name="q" value="${esc(q)}" placeholder="Buscar cursos, temas, instructores…" aria-label="Buscar cursos">
        </form>
        <div class="hdr-actions">
          ${social}
          <button class="icon-btn" id="themeBtn" type="button" aria-label="Cambiar tema"></button>
          <div class="user-actions">${userArea}</div>
          <button class="icon-btn burger" id="burger" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
        </div>
      </div>
    </header>`;

    theme.paint();
    $('themeBtn').onclick = () => theme.toggle();
    $('logoutBtn') && ($('logoutBtn').onclick = logout);
    if (u) initSocial(u);
    const nav = $('nav'), burger = $('burger');
    burger.onclick = () => {
      const open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    };
    nav.addEventListener('click', e => { if (e.target.closest('a')) nav.classList.remove('open'); });
    document.addEventListener('click', e => {
      if (nav.classList.contains('open') && !e.target.closest('#nav,#burger')) nav.classList.remove('open');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') nav.classList.remove('open'); });
    return u;
  }

  /* ---------- Formato ---------- */
  const initials = nombre => String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  const hue = texto => [...String(texto || 'dev')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);
  function formatDuration(seg) {
    const s = Number(seg) || 0;
    if (!s) return 'Duración por definir';
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return `${h} h${m ? ` ${m} min` : ''}`;
  }
  function formatDate(v) {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z'));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const levelLabel = n => ({ principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' }[n] || n || '');
  const statusLabel = e => ({ borrador: 'Borrador', pendiente: 'En revisión', aprobado: 'Publicado', rechazado: 'Rechazado', archivado: 'Archivado', activo: 'Activo', suspendido: 'Suspendido', verificado: 'Verificado', pagada: 'Pagada', cancelada: 'Cancelada', reembolsada: 'Reembolsada', completado: 'Completado', fallido: 'Fallido' }[e] || e || '—');
  const statusBadge = e => `<span class="badge status-${esc(e)}">${esc(statusLabel(e))}</span>`;
  const free = c => Number(c.precio) === 0;

  /* ---------- Tarjeta de curso ---------- */
  function courseCard(c) {
    const h = hue(c.categoria?.slug || c.categoria?.nombre || c.titulo);
    return `<article class="course-card">
      <div class="course-cover" style="--hue:${h}" aria-hidden="true">
        <span class="cover-cat">${esc(c.categoria?.nombre || 'Curso')}</span>
        <span class="cover-ico">${esc(c.categoria?.icono || '📚')}</span>
      </div>
      <div class="course-body">
        <h3><a href="/curso.html?slug=${encodeURIComponent(c.slug)}">${esc(c.titulo)}</a></h3>
        <p class="course-summary">${esc(c.resumen)}</p>
        <div class="course-meta">
          <span>${esc(levelLabel(c.nivel))}</span>
          <span>${c.lecciones || 0} lecciones</span>
          <span>${esc(formatDuration(c.duracion_seg))}</span>
        </div>
        <div class="course-instructor">Por <b>${esc(c.instructor?.nombre || 'Instructor')}</b></div>
        <div class="course-foot">
          <span class="price">${free(c) ? 'Gratis' : money(c.precio)}</span>
          <a class="btn btn-soft btn-sm" href="/curso.html?slug=${encodeURIComponent(c.slug)}">Ver curso</a>
        </div>
      </div>
    </article>`;
  }

  function skeletons(n = 6) {
    return Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
  }

  /* ---------- Modal ---------- */
  let modalEl = null, modalPrevFocus = null, modalCloseCb = null;
  function openModal(html, { large = false, onClose = null } = {}) {
    modalCloseCb = typeof onClose === 'function' ? onClose : null;
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 'modal-bg';
      modalEl.id = 'dsModal';
      modalEl.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
      modalEl.addEventListener('click', e => {
        if (e.target === modalEl || e.target.closest('[data-close]')) closeModal();
      });
      document.body.append(modalEl);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalEl.classList.contains('open')) closeModal(); });
    }
    const box = modalEl.querySelector('.modal');
    box.className = 'modal' + (large ? ' modal-lg' : '');
    box.innerHTML = html;
    modalPrevFocus = document.activeElement;
    modalEl.classList.add('open');
    const focusable = box.querySelector('input,select,textarea,button,a');
    focusable?.focus();
    return box;
  }
  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    modalPrevFocus?.focus?.();
    const cb = modalCloseCb;
    modalCloseCb = null;
    cb?.();
  }

  /* ---------- Notificaciones, mensajes y tiempo real ---------- */
  let _ws = null;
  let _wsTimer = null;
  let _wsCerrado = false;
  let _notifPanel = null;
  let _noLeidasNotif = 0;
  let _noLeidosMsg = 0;
  const _socialListeners = new Map();

  function alEvento(tipo, fn) {
    if (!_socialListeners.has(tipo)) _socialListeners.set(tipo, new Set());
    _socialListeners.get(tipo).add(fn);
    return () => _socialListeners.get(tipo)?.delete(fn);
  }
  function disparar(tipo, detalle) {
    (_socialListeners.get(tipo) || []).forEach(fn => { try { fn(detalle); } catch {} });
    window.dispatchEvent(new CustomEvent('ds:' + tipo, { detail: detalle }));
  }

  function pintarBadge(id, n) {
    const el = $(id);
    if (!el) return;
    const total = Math.max(0, Number(n) || 0);
    el.hidden = total === 0;
    el.textContent = total > 99 ? '99+' : String(total || '');
  }

  async function refrescarBadges() {
    if (!_user) return;
    const [n, m] = await Promise.allSettled([
      api('/api/notificaciones/resumen'),
      api('/api/mensajes/no-leidos')
    ]);
    if (n.status === 'fulfilled') { _noLeidasNotif = n.value.no_leidas || 0; pintarBadge('notifBadge', _noLeidasNotif); }
    if (m.status === 'fulfilled') { _noLeidosMsg = m.value.no_leidos || 0; pintarBadge('msgBadge', _noLeidosMsg); }
  }

  const ICONO_NOTIF = { venta: '💳', compra: '🎉', foro: '💬', mensaje: '✉️', sistema: '🔔', verificacion: '✅', curso: '📚' };

  function itemNotificacion(n) {
    return `<div class="notif-item ${n.leida ? '' : 'unread'}" data-notif="${n.id}" data-link="${esc(n.enlace || '')}" role="button" tabindex="0">
      <span class="notif-ico" aria-hidden="true">${ICONO_NOTIF[n.tipo] || '🔔'}</span>
      <span class="notif-txt"><b>${esc(n.titulo)}</b><small>${esc(n.mensaje || '')}</small><time>${esc(formatDate(n.creado))}</time></span>
    </div>`;
  }

  function panelNotificaciones() {
    if (_notifPanel) return _notifPanel;
    _notifPanel = document.createElement('div');
    _notifPanel.className = 'notif-panel';
    _notifPanel.id = 'notifPanel';
    _notifPanel.setAttribute('role', 'dialog');
    _notifPanel.setAttribute('aria-label', 'Notificaciones');
    _notifPanel.hidden = true;
    _notifPanel.innerHTML = `<div class="notif-head"><b>Notificaciones</b><button class="btn btn-ghost btn-sm" id="notifAll" type="button">Marcar todas</button></div>
      <div class="notif-list" id="notifList"><div class="notif-empty">Cargando…</div></div>
      <a class="notif-foot" href="/mensajes.html">Ir a mensajes →</a>`;
    document.body.append(_notifPanel);

    $('#notifAll').onclick = async () => {
      try {
        await api('/api/notificaciones/leer-todas', { method: 'POST' });
        _noLeidasNotif = 0;
        pintarBadge('notifBadge', 0);
        $$('#notifList .notif-item').forEach(el => el.classList.remove('unread'));
      } catch (e) { toast(e.message, 'err'); }
    };

    _notifPanel.addEventListener('click', async e => {
      const item = e.target.closest('[data-notif]');
      if (!item) return;
      if (!item.classList.contains('unread') && !item.dataset.link) return;
      try {
        if (item.classList.contains('unread')) {
          await api(`/api/notificaciones/${item.dataset.notif}/leer`, { method: 'POST' });
          item.classList.remove('unread');
          _noLeidasNotif = Math.max(0, _noLeidasNotif - 1);
          pintarBadge('notifBadge', _noLeidasNotif);
        }
      } catch {}
      if (item.dataset.link) location.href = item.dataset.link;
    });

    return _notifPanel;
  }

  async function cargarNotificaciones() {
    const panel = panelNotificaciones();
    const list = $('#notifList');
    try {
      const r = await api('/api/notificaciones?limit=20');
      _noLeidasNotif = r.no_leidas || 0;
      pintarBadge('notifBadge', _noLeidasNotif);
      list.innerHTML = r.items.length
        ? r.items.map(itemNotificacion).join('')
        : '<div class="notif-empty">No tienes notificaciones todavía.</div>';
    } catch (e) {
      list.innerHTML = `<div class="notif-empty">${esc(e.message)}</div>`;
    }
    return panel;
  }

  async function abrirNotificaciones(abrir) {
    const panel = panelNotificaciones();
    const btn = $('notifBtn');
    const mostrar = abrir === undefined ? panel.hidden : abrir;
    panel.hidden = !mostrar;
    btn?.setAttribute('aria-expanded', String(mostrar));
    if (mostrar) {
      panel.classList.add('open');
      await cargarNotificaciones();
      panel.querySelector('[data-notif], #notifAll')?.focus?.();
    } else {
      panel.classList.remove('open');
    }
  }

  function conectarRealtime() {
    if (!_user || _ws || _wsCerrado) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}/api/realtime`); } catch { return; }
    _ws = ws;
    ws.onopen = () => { if (_wsTimer) { clearTimeout(_wsTimer); _wsTimer = null; } };
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'notificacion' && msg.notificacion) {
        if (!msg.notificacion.leida) {
          _noLeidasNotif += 1;
          pintarBadge('notifBadge', _noLeidasNotif);
        }
        if (!_notifPanel?.hidden) {
          const list = $('#notifList');
          if (list && !list.querySelector(`[data-notif="${msg.notificacion.id}"]`)) {
            const vacio = list.querySelector('.notif-empty');
            if (vacio) list.innerHTML = '';
            list.insertAdjacentHTML('afterbegin', itemNotificacion(msg.notificacion));
          }
        }
        toast(msg.notificacion.titulo || 'Nueva notificación');
        disparar('notificacion', msg.notificacion);
      } else if (msg.type === 'mensaje' && msg.mensaje) {
        if (!msg.propio) {
          _noLeidosMsg += 1;
          pintarBadge('msgBadge', _noLeidosMsg);
          const enMensajes = location.pathname.endsWith('/mensajes.html');
          if (!enMensajes || String(new URLSearchParams(location.search).get('c')) !== String(msg.conversacion_id)) {
            const texto = String(msg.mensaje.contenido || '');
            toast(`${msg.mensaje.emisor}: ${texto.length > 70 ? texto.slice(0, 67) + '…' : texto}`);
          }
        }
        disparar('mensaje', msg);
      } else if (msg.type === 'ready') {
        refrescarBadges();
      }
    };
    ws.onclose = () => {
      _ws = null;
      if (_wsCerrado || !_user) return;
      _wsTimer = setTimeout(conectarRealtime, 4000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  function initSocial(u) {
    if (!u) return;
    _wsCerrado = false;
    const btn = $('notifBtn');
    if (btn) {
      btn.onclick = e => { e.stopPropagation(); abrirNotificaciones(); };
      btn.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirNotificaciones(); } };
    }
    document.addEventListener('click', e => {
      if (!_notifPanel || _notifPanel.hidden) return;
      if (e.target.closest('#notifPanel, #notifBtn')) return;
      abrirNotificaciones(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _notifPanel && !_notifPanel.hidden) abrirNotificaciones(false);
    });
    refrescarBadges();
    conectarRealtime();
  }

  /* ---------- Subida de video con progreso ---------- */
  function uploadVideo(leccionId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/instructor/lecciones/${leccionId}/video`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'No se pudo subir el video'));
      };
      xhr.onerror = () => reject(new Error('Error de red al subir el video'));
      const fd = new FormData();
      fd.append('video', file);
      xhr.send(fd);
    });
  }

  function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  window.DS = {
    $, $$, esc, money, reduce, params, toast, api, me, requireAuth, logout,
    mountHeader, theme, initials, hue, formatDuration, formatDate,
    levelLabel, statusLabel, statusBadge, free, courseCard, skeletons,
    openModal, closeModal, uploadVideo, debounce,
    alEvento, disparar, refrescarBadges, abrirNotificaciones, pintarBadge,
    user: () => _user
  };
})();
