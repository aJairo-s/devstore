// Utilidades compartidas: header, tema, carrito/checkout (Sprint 3), toasts y animaciones
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Number(n).toFixed(2);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Tema claro/oscuro =====
  const THEME_KEY = 'devstore_theme';
  const theme = {
    get() {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    },
    apply(t) { document.documentElement.dataset.theme = t; },
    set(t) { try { localStorage.setItem(THEME_KEY, t); } catch {} this.apply(t); this.paintBtn(); },
    toggle() { this.set(this.get() === 'light' ? 'dark' : 'light'); },
    paintBtn() {
      const b = $('themeBtn'); if (!b) return;
      const light = this.get() === 'light';
      b.textContent = light ? '🌙' : '☀️';
      b.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
      b.title = b.getAttribute('aria-label');
    }
  };
  theme.apply(theme.get());

  function toast(text, kind = 'ok') {
    let box = $('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // Aparición al hacer scroll
  const io = 'IntersectionObserver' in window && !reduce
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 }) : null;
  const reveal = (root = document) => root.querySelectorAll('.reveal:not(.in)').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  // ===== Carrito (localStorage) + checkout Sprint 3 =====
  const KEY = 'devstore_cart';
  let items = []; try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} renderCart(); };
  const cart = {
    add(p) {
      const it = items.find(i => i.id === p.id);
      if (it) {
        if (p.tipo !== 'fisico') return toast('Ya está en tu carrito', 'ok');
        if (it.qty >= p.stock) return toast('No hay más stock disponible', 'err');
        it.qty++;
      } else items.push({ id: p.id, titulo: p.titulo, precio: p.precio, tipo: p.tipo, stock: p.stock ?? Infinity, qty: 1 });
      save(); toast('Agregado: ' + p.titulo);
      const n = $('cartN'); n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump');
    },
    remove(id) { items = items.filter(i => i.id !== id); save(); },
    clear() { items = []; save(); },
    items() { return items.map(i => ({ id: i.id, cantidad: i.qty })); },
    total() { return items.reduce((a, i) => a + i.qty * i.precio, 0); },
    empty() { return !items.length; }
  };
  function renderCart() {
    const n = $('cartN'); if (!n) return;
    const q = items.reduce((a, i) => a + i.qty, 0); n.textContent = q; n.dataset.n = q;
    const ICO = { fisico: '⌨️', digital: '💿', curso: '🎓' };
    $('cartItems').innerHTML = items.map(i => `<div class="ci"><div class="ci-ico" aria-hidden="true">${ICO[i.tipo] || '📦'}</div><div class="ci-info"><b>${esc(i.titulo)}</b><small>${i.qty} × ${money(i.precio)}</small><span class="ci-qty">Cant. ${i.qty}</span></div>
      <div class="ci-side"><strong>${money(i.qty * i.precio)}</strong><button class="btn btn-danger btn-sm" data-rm="${i.id}" aria-label="Quitar">Quitar</button></div></div>`).join('')
      || '<div class="empty"><span class="e-ico" aria-hidden="true">🛒</span><b>Tu carrito está vacío</b><small>Agrega productos desde el catálogo.</small></div>';
    const cc = $('cartCount'); if (cc) cc.textContent = q + (q === 1 ? ' artículo' : ' artículos');
    const cs = $('cartSub'); if (cs) cs.textContent = money(cart.total());
    $('cartTotal').textContent = money(cart.total());
    $('cartClear').disabled = !items.length;
    const co = $('coBtn'); if (co) co.disabled = cart.empty();
  }
  const drawer = open => { $('drawer').classList.toggle('open', open); $('drawerBg').classList.toggle('open', open); };

  // Checkout: crea el pedido (Ecommerce) y abre el pago (Cobros)
  async function checkout() {
    if (cart.empty()) return toast('Tu carrito está vacío', 'err');
    if (!DS.user) { drawer(false); location.href = '/#registro'; return toast('Inicia sesión para comprar', 'err'); }
    const dir = ($('coDir')?.value || '').trim();
    const metodo = $('coMet')?.value || 'tarjeta';
    if (!dir) return toast('Indica una dirección de envío', 'err');
    try {
      const r = await fetch('/api/pedidos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direccion: dir, items: cart.items() })
      });
      const d = await r.json();
      if (!r.ok) throw d;
      const p = await fetch(`/api/pedidos/${d.id}/pago`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodo })
      });
      const pd = await p.json();
      if (!p.ok) throw pd;
      cart.clear();
      $('coBox')?.classList.remove('open');
      drawer(false);
      toast(`¡Pedido #${d.id} pagado! Envío en preparación.`);
      location.href = '/#pedidos';
    } catch (e) { toast(e.error || 'No se pudo completar el pedido', 'err'); }
  }

  const LINKS = [['/', 'Inicio', 'home'], ['/productos.html', 'Productos', 'prod'], ['/productos.html?tipo=digital', 'Software', 'soft'], ['/productos.html?tipo=curso', 'Cursos', 'cur'], ['/#pedidos', 'Mis pedidos', 'ord']];
  async function refreshUser() {
    let u = null; try { const r = await fetch('/api/me'); if (r.ok) u = await r.json(); } catch {}
    DS.user = u;
    $('userBox').innerHTML = u
      ? `<a class="avatar" href="/" title="Mi cuenta">${esc(u.nombre.trim()[0] || '?').toUpperCase()}</a><span class="uname">${esc(u.nombre)}</span><button class="btn btn-ghost btn-sm" id="outBtn">Salir</button>`
      : `<a class="btn btn-ghost btn-sm" href="/">Iniciar sesión</a><a class="btn btn-primary btn-sm" href="/#registro">Registrarse</a>`;
    const o = $('outBtn'); if (o) o.onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/'; };
    return u;
  }
  function mountHeader(active, onSearch) {
    const q = new URLSearchParams(location.search).get('q') || '';
    const searchForm = cls => `<form class="${cls}" action="/productos.html" role="search"><input name="q" value="${esc(q)}" placeholder="Buscar productos, cursos…" aria-label="Buscar"></form>`;
    $('hdr').outerHTML = `<header class="hdr"><div class="container hdr-in">
      <a class="logo" href="/">Dev<span>Store</span></a>
      <nav class="nav" id="nav">${LINKS.map((l, k) => `<a href="${l[0]}" class="${l[2] === active ? 'active' : ''}" style="--k:${k}"${l[2] === active ? ' aria-current="page"' : ''}>${l[1]}</a>`).join('')}${searchForm('search-m')}</nav>
      ${searchForm('search')}
      <div class="hdr-right">
        <button class="theme-btn" id="themeBtn" aria-label="Cambiar tema"></button>
        <button class="cart-btn" id="cartBtn" aria-label="Carrito"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 7H6"/></svg><span class="cart-n" id="cartN" data-n="0"></span></button>
        <div class="user" id="userBox"></div>
        <button class="burger" id="burger" aria-label="Menú" aria-expanded="false" aria-controls="nav"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
      </div></div><div class="scroll-progress" aria-hidden="true"><span id="scrollBar"></span></div></header>
      <aside class="drawer" id="drawer" aria-label="Carrito"><div class="section-head" style="margin:0"><h2 style="margin:0">Tu carrito <span class="cart-count" id="cartCount">0 artículos</span></h2><button class="btn btn-ghost btn-sm" id="cartClose">Cerrar</button></div>
        <div class="drawer-items" id="cartItems"></div>
        <div class="drawer-foot"><div class="sum-row"><span>Subtotal</span><span id="cartSub">$0.00</span></div><div class="total"><span>Total</span><span id="cartTotal">$0.00</span></div>
          <div class="checkout-box" id="coBox">
            <label for="coDir" style="margin:0">Dirección de envío</label>
            <input id="coDir" placeholder="Calle, número, ciudad">
            <label for="coMet" style="margin:0">Método de pago</label>
            <select id="coMet"><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="paypal">PayPal</option></select>
            <button class="btn" id="coPay" style="width:100%">Pagar y confirmar pedido</button>
          </div>
          <div class="actions" style="margin-top:.6rem">
            <button class="btn" id="coBtn" style="flex:1" disabled>Finalizar compra</button>
            <button class="btn btn-ghost" id="cartClear">Vaciar</button>
          </div>
        </div></aside><div class="drawer-bg" id="drawerBg"></div>`;
    theme.paintBtn();
    $('themeBtn').onclick = () => theme.toggle();
    $('burger').onclick = () => { const o = $('nav').classList.toggle('open'); $('burger').setAttribute('aria-expanded', o); };
    // Menú móvil: se cierra al elegir un enlace, con Escape o al tocar fuera
    const closeNav = () => { $('nav').classList.remove('open'); $('burger').setAttribute('aria-expanded', 'false'); };
    $('nav').addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
    document.addEventListener('click', e => { if ($('nav').classList.contains('open') && !e.target.closest('#nav,#burger')) closeNav(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });
    // Header translúcido: progreso de lectura y sombra al hacer scroll
    const hdrEl = document.querySelector('.hdr'), bar = $('scrollBar'); let tick = false;
    const onScroll = () => { tick = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
      hdrEl.classList.toggle('scrolled', scrollY > 8); };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true });
    addEventListener('resize', onScroll, { passive: true }); onScroll();
    $('cartBtn').onclick = () => drawer(true); $('cartClose').onclick = $('drawerBg').onclick = () => drawer(false);
    $('cartClear').onclick = () => cart.clear();
    $('coBtn').onclick = () => $('coBox').classList.toggle('open');
    $('coPay').onclick = () => checkout();
    $('cartItems').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) cart.remove(+b.dataset.rm); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') drawer(false); });
    if (onSearch) document.querySelectorAll('.search,.search-m').forEach(f => f.addEventListener('submit', e => {
      e.preventDefault(); const v = f.q.value; document.querySelectorAll('.hdr input[name=q]').forEach(i => i.value = v); onSearch(v); $('nav').classList.remove('open');
    }));
    renderCart(); return refreshUser();
  }
  window.DS = { $, esc, money, toast, cart, reveal, mountHeader, refreshUser, theme, user: null };
})();
