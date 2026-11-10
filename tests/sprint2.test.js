// Specs ejecutables del Sprint 2. Cada test lleva el ID de specs/SPEC-sprint2.md
process.env.DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

let server, base;
before(async () => { await new Promise(r => { server = app.listen(0, r); }); base = `http://localhost:${server.address().port}`; });
after(() => { server.closeAllConnections?.(); server.close(); });

function agente() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(base + url, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(cookie && { cookie }) }
    });
    const sc = r.headers.getSetCookie?.() || [];
    if (sc.length) cookie = sc[sc.length - 1].split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
async function usuario(email, rol) {
  const a = agente();
  await a('POST', '/api/registro', { nombre: email, email, password: 'password1', rol });
  const l = await a('POST', '/api/login', { email, password: 'password1' });
  return { a, id: l.body.id };
}
async function admin() {
  const a = agente();
  await a('POST', '/api/login', { email: 'admin@devstore.com', password: 'Admin123!' });
  return a;
}
const P = (o = {}) => ({ titulo: 'Teclado mecánico', descripcion: 'Teclado mecánico RGB', precio: 49.9, categoria: 'Hardware', tipo: 'fisico', stock: 5, ...o });
const C = (o = {}) => P({ titulo: 'Curso de Python', descripcion: 'De cero a experto', categoria: 'Lenguajes', tipo: 'curso', nivel: 'principiante', stock: 0, ...o });
async function crear(a, o) { const r = await a('POST', '/api/productos', P(o)); assert.equal(r.status, 201); return r.body.id; }
async function aprobado(of, adm, o) { const id = await crear(of.a, o); await adm('POST', `/api/admin/productos/${id}/aprobar`); return id; }
const mio = async (a, id) => (await a('GET', '/api/productos/mios')).body.find(p => p.id === id);

// ---------- HU-01 ----------
test('SPEC-01.1 registro exitoso -> pendiente y vinculado al ofertante', async () => {
  const of = await usuario('of011@t.com', 'vendedor');
  const r = await of.a('POST', '/api/productos', P());
  assert.equal(r.status, 201);
  assert.equal(r.body.estado, 'pendiente');
  assert.equal(r.body.ofertante_id, of.id);
});
test('SPEC-01.2 datos incompletos -> 400 y no se guarda', async () => {
  const of = await usuario('of012@t.com', 'vendedor');
  const r = await of.a('POST', '/api/productos', P({ titulo: '' }));
  assert.equal(r.status, 400);
  assert.equal((await of.a('GET', '/api/productos/mios')).body.length, 0);
});
test('SPEC-01.3 precio inválido -> 400', async () => {
  const of = await usuario('of013@t.com', 'instructor');
  for (const precio of [0, -5, 'abc', null])
    assert.equal((await of.a('POST', '/api/productos', P({ precio }))).status, 400);
});
test('SPEC-01.4 cliente no puede registrar -> 403', async () => {
  const c = await usuario('c014@t.com', 'cliente');
  assert.equal((await c.a('POST', '/api/productos', P())).status, 403);
});
test('SPEC-01.5 sin sesión -> 401', async () => {
  assert.equal((await agente()('POST', '/api/productos', P())).status, 401);
});
test('SPEC-01.6 persistencia: en "mios" y fuera del catálogo mientras es pendiente', async () => {
  const of = await usuario('of016@t.com', 'vendedor');
  const id = await crear(of.a, { titulo: 'Solo pendiente 016' });
  const p = await mio(of.a, id);
  assert.equal(p.estado, 'pendiente'); assert.equal(p.ofertante_id, of.id);
  const cat = (await agente()('GET', '/api/productos')).body;
  assert.ok(!cat.some(x => x.id === id));
});
test('SPEC-01.7 vendedor no puede publicar un curso -> 403', async () => {
  const v = await usuario('of017@t.com', 'vendedor');
  assert.equal((await v.a('POST', '/api/productos', C())).status, 403);
  assert.equal((await v.a('GET', '/api/productos/mios')).body.length, 0);
});
test('SPEC-01.8 instructor no puede publicar físico/digital -> 403', async () => {
  const i = await usuario('of018@t.com', 'instructor');
  assert.equal((await i.a('POST', '/api/productos', P())).status, 403);
  assert.equal((await i.a('POST', '/api/productos', P({ tipo: 'digital' }))).status, 403);
});
test('SPEC-01.9 curso con nivel válido -> 201 pendiente; vendedor puede digital', async () => {
  const i = await usuario('of019@t.com', 'instructor'); const v = await usuario('of019v@t.com', 'vendedor');
  const r = await i.a('POST', '/api/productos', C({ nivel: 'avanzado' }));
  assert.equal(r.status, 201); assert.equal(r.body.estado, 'pendiente');
  assert.equal((await mio(i.a, r.body.id)).nivel, 'avanzado');
  assert.equal((await v.a('POST', '/api/productos', P({ tipo: 'digital' }))).status, 201);
});
test('SPEC-01.10 curso sin nivel o con nivel inválido -> 400', async () => {
  const i = await usuario('of0110@t.com', 'instructor');
  for (const nivel of [undefined, '', 'experto'])
    assert.equal((await i.a('POST', '/api/productos', C({ nivel }))).status, 400);
});
test('SPEC-01.11 tipo fuera de fisico/digital/curso -> 400', async () => {
  const v = await usuario('of0111@t.com', 'vendedor');
  assert.equal((await v.a('POST', '/api/productos', P({ tipo: 'servicio' }))).status, 400);
});

// ---------- HU-02 ----------
test('SPEC-02.1 edición crítica de aprobado -> pendiente', async () => {
  const adm = await admin(); const of = await usuario('of021@t.com', 'vendedor');
  const id = await aprobado(of, adm);
  const r = await of.a('PUT', `/api/productos/${id}`, P({ precio: 99 }));
  assert.equal(r.status, 200); assert.equal(r.body.estado, 'pendiente');
  assert.equal((await mio(of.a, id)).precio, 99);
});
test('SPEC-02.2 edición no crítica (stock) mantiene aprobado', async () => {
  const adm = await admin(); const of = await usuario('of022@t.com', 'vendedor');
  const id = await aprobado(of, adm);
  const r = await of.a('PUT', `/api/productos/${id}`, P({ stock: 50 }));
  assert.equal(r.status, 200); assert.equal(r.body.estado, 'aprobado');
  assert.equal((await mio(of.a, id)).stock, 50);
});
test('SPEC-02.3 edición crítica de rechazado -> pendiente y limpia motivo', async () => {
  const adm = await admin(); const of = await usuario('of023@t.com', 'vendedor');
  const id = await crear(of.a);
  await adm('POST', `/api/admin/productos/${id}/rechazar`, { motivo: 'Descripción pobre' });
  const r = await of.a('PUT', `/api/productos/${id}`, P({ descripcion: 'Descripción mejorada y detallada' }));
  assert.equal(r.body.estado, 'pendiente');
  assert.equal((await mio(of.a, id)).motivo_rechazo, null);
});
test('SPEC-02.4 no se edita producto ajeno -> 403 y no cambia', async () => {
  const a = await usuario('of024a@t.com', 'vendedor'); const b = await usuario('of024b@t.com', 'vendedor');
  const id = await crear(a.a);
  assert.equal((await b.a('PUT', `/api/productos/${id}`, P({ titulo: 'Hackeado' }))).status, 403);
  assert.equal((await mio(a.a, id)).titulo, 'Teclado mecánico');
});
test('SPEC-02.5 edición inválida -> 400 y no cambia', async () => {
  const of = await usuario('of025@t.com', 'vendedor'); const id = await crear(of.a);
  assert.equal((await of.a('PUT', `/api/productos/${id}`, P({ titulo: '', precio: 10 }))).status, 400);
  const p = await mio(of.a, id); assert.equal(p.titulo, 'Teclado mecánico'); assert.equal(p.precio, 49.9);
});
test('SPEC-02.6 el dueño elimina su producto', async () => {
  const of = await usuario('of026@t.com', 'vendedor'); const id = await crear(of.a);
  assert.equal((await of.a('DELETE', `/api/productos/${id}`)).status, 200);
  assert.equal(await mio(of.a, id), undefined);
});
test('SPEC-02.7 no se elimina producto ajeno -> 403', async () => {
  const a = await usuario('of027a@t.com', 'vendedor'); const b = await usuario('of027b@t.com', 'instructor');
  const id = await crear(a.a);
  assert.equal((await b.a('DELETE', `/api/productos/${id}`)).status, 403);
  assert.ok(await mio(a.a, id));
});
test('SPEC-02.8 producto inexistente -> 404', async () => {
  const of = await usuario('of028@t.com', 'vendedor');
  assert.equal((await of.a('PUT', '/api/productos/99999', P())).status, 404);
  assert.equal((await of.a('DELETE', '/api/productos/99999')).status, 404);
});
test('SPEC-02.9 cambiar el nivel de un curso aprobado -> pendiente', async () => {
  const adm = await admin(); const i = await usuario('of029@t.com', 'instructor');
  const id = await aprobado(i, adm, C());
  const r = await i.a('PUT', `/api/productos/${id}`, C({ nivel: 'intermedio' }));
  assert.equal(r.status, 200); assert.equal(r.body.estado, 'pendiente');
  assert.equal((await mio(i.a, id)).nivel, 'intermedio');
});
test('SPEC-02.10 vendedor no puede cambiar su producto a curso -> 403 y no cambia', async () => {
  const v = await usuario('of0210@t.com', 'vendedor'); const id = await crear(v.a);
  assert.equal((await v.a('PUT', `/api/productos/${id}`, C())).status, 403);
  assert.equal((await mio(v.a, id)).tipo, 'fisico');
});

test('SPEC-02.11 edición solo de stock en rechazado -> sigue rechazado con su motivo', async () => {
  const adm = await admin(); const of = await usuario('of0211@t.com', 'vendedor');
  const id = await crear(of.a);
  await adm('POST', `/api/admin/productos/${id}/rechazar`, { motivo: 'Fotos borrosas' });
  const r = await of.a('PUT', `/api/productos/${id}`, P({ stock: 9 }));
  assert.equal(r.body.estado, 'rechazado');
  assert.equal((await mio(of.a, id)).motivo_rechazo, 'Fotos borrosas');
});

// ---------- HU-03 ----------
test('SPEC-03.1 admin lista pendientes', async () => {
  const adm = await admin(); const of = await usuario('of031@t.com', 'vendedor');
  const id = await crear(of.a);
  const r = await adm('GET', '/api/admin/productos?estado=pendiente');
  assert.equal(r.status, 200);
  assert.ok(r.body.length > 0 && r.body.every(p => p.estado === 'pendiente'));
  assert.ok(r.body.some(p => p.id === id));
});
test('SPEC-03.2 aprobar -> aprobado y visible en catálogo', async () => {
  const adm = await admin(); const of = await usuario('of032@t.com', 'vendedor');
  const id = await crear(of.a);
  assert.equal((await adm('POST', `/api/admin/productos/${id}/aprobar`)).status, 200);
  assert.equal((await mio(of.a, id)).estado, 'aprobado');
  assert.ok((await agente()('GET', '/api/productos')).body.some(p => p.id === id));
});
test('SPEC-03.3 rechazar con motivo -> rechazado, motivo guardado, fuera del catálogo', async () => {
  const adm = await admin(); const of = await usuario('of033@t.com', 'vendedor');
  const id = await crear(of.a);
  assert.equal((await adm('POST', `/api/admin/productos/${id}/rechazar`, { motivo: 'Contenido dudoso' })).status, 200);
  const p = await mio(of.a, id);
  assert.equal(p.estado, 'rechazado'); assert.equal(p.motivo_rechazo, 'Contenido dudoso');
  assert.ok(!(await agente()('GET', '/api/productos')).body.some(x => x.id === id));
});
test('SPEC-03.4 rechazar sin motivo -> 400 y sigue pendiente', async () => {
  const adm = await admin(); const of = await usuario('of034@t.com', 'vendedor');
  const id = await crear(of.a);
  assert.equal((await adm('POST', `/api/admin/productos/${id}/rechazar`, { motivo: '  ' })).status, 400);
  assert.equal((await mio(of.a, id)).estado, 'pendiente');
});
test('SPEC-03.5 validar un no-pendiente -> 409', async () => {
  const adm = await admin(); const of = await usuario('of035@t.com', 'vendedor');
  const id = await aprobado(of, adm);
  assert.equal((await adm('POST', `/api/admin/productos/${id}/aprobar`)).status, 409);
  assert.equal((await adm('POST', `/api/admin/productos/${id}/rechazar`, { motivo: 'x' })).status, 409);
});
test('SPEC-03.6 no-admin no puede validar -> 403', async () => {
  const of = await usuario('of036@t.com', 'vendedor'); const id = await crear(of.a);
  assert.equal((await of.a('POST', `/api/admin/productos/${id}/aprobar`)).status, 403);
  assert.equal((await of.a('GET', '/api/admin/productos')).status, 403);
});
test('SPEC-03.7 catálogo solo muestra aprobados', async () => {
  const cat = (await agente()('GET', '/api/productos')).body;
  assert.ok(cat.every(p => p.estado === 'aprobado'));
});

test('SPEC-03.8 admin sin filtro lista todos los estados; filtro inválido no filtra', async () => {
  const adm = await admin(); const of = await usuario('of038@t.com', 'vendedor');
  const a = await crear(of.a); const b = await aprobado(of, adm);
  const todos = (await adm('GET', '/api/admin/productos?estado=xyz')).body;
  assert.ok(todos.some(p => p.id === a) && todos.some(p => p.id === b));
});

// ---------- Consistencia Sprint 1 ----------
test('SPEC-00.1 borrar usuario elimina sus productos', async () => {
  const adm = await admin(); const of = await usuario('of001@t.com', 'vendedor');
  const id = await aprobado(of, adm);
  await adm('DELETE', `/api/usuarios/${of.id}`);
  assert.ok(!(await agente()('GET', '/api/productos')).body.some(p => p.id === id));
});
