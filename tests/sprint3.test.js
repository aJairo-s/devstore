// Specs ejecutables del Sprint 3. Cada test lleva el ID de specs/SPEC-sprint3.md
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
const P = (o = {}) => ({ titulo: 'Teclado mecánico', descripcion: 'Teclado mecánico RGB', precio: 49.9, categoria: 'Hardware', tipo: 'fisico', stock: 10, ...o });
async function aprobado(of, adm, o = {}) {
  const r = await of.a('POST', '/api/productos', P(o));
  assert.equal(r.status, 201);
  await adm('POST', `/api/admin/productos/${r.body.id}/aprobar`);
  return r.body.id;
}
async function comprar(cl, adm, items, direccion = 'Calle Falsa 123') {
  const of = await usuario(`v${Date.now()}${Math.random()}@t.com`, 'vendedor');
  const ids = [];
  for (const it of items) ids.push(await aprobado(of, adm, it));
  const r = await cl.a('POST', '/api/pedidos', {
    direccion,
    items: ids.map((id, i) => ({ id, cantidad: items[i].cantidad || 1 }))
  });
  return { ...r, ids, of };
}

// ---------- HU-04 Checkout ----------
test('SPEC-30.1 checkout válido -> 201 pendiente, total correcto y stock decrementado', async () => {
  const adm = await admin();
  const of = await usuario('v301@t.com', 'vendedor');
  const cl = await usuario('c301@t.com', 'cliente');
  const id = await aprobado(of, adm, { precio: 49.9, stock: 10 });
  const r = await cl.a('POST', '/api/pedidos', { direccion: 'Av. Siempreviva 742', items: [{ id, cantidad: 2 }] });
  assert.equal(r.status, 201);
  assert.equal(r.body.estado, 'pendiente');
  const pedido = (await cl.a('GET', '/api/pedidos')).body.find(p => p.id === r.body.id);
  assert.equal(pedido.total, 99.8);
  assert.equal(pedido.detalles[0].cantidad, 2);
  const mio = (await of.a('GET', '/api/productos/mios')).body.find(p => p.id === id);
  assert.equal(mio.stock, 8);
});
test('SPEC-30.2 sin sesión -> 401', async () => {
  assert.equal((await agente()('POST', '/api/pedidos', { direccion: 'x', items: [{ id: 1, cantidad: 1 }] })).status, 401);
});
test('SPEC-30.3 datos inválidos -> 400 y no se crea', async () => {
  const cl = await usuario('c303@t.com', 'cliente');
  assert.equal((await cl.a('POST', '/api/pedidos', { direccion: '', items: [{ id: 1, cantidad: 1 }] })).status, 400);
  assert.equal((await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [] })).status, 400);
  assert.equal((await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [{ id: 1, cantidad: 0 }] })).status, 400);
  assert.equal((await cl.a('GET', '/api/pedidos')).body.length, 0);
});
test('SPEC-30.4 sin stock o no aprobado -> 409/400 y rollback', async () => {
  const adm = await admin();
  const of = await usuario('v304@t.com', 'vendedor');
  const cl = await usuario('c304@t.com', 'cliente');
  const id = await aprobado(of, adm, { stock: 1 });
  const r = await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [{ id, cantidad: 5 }] });
  assert.equal(r.status, 409);
  const pend = await of.a('POST', '/api/productos', P({ titulo: 'No aprobado', stock: 5 }));
  assert.equal(pend.status, 201);
  assert.equal((await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [{ id: pend.body.id, cantidad: 1 }] })).status, 400);
  assert.equal((await cl.a('GET', '/api/pedidos')).body.length, 0);
  assert.equal((await of.a('GET', '/api/productos/mios')).body.find(p => p.id === id).stock, 1);
});
test('SPEC-30.5 el comprador ve su pedido; otro usuario no lo ve', async () => {
  const adm = await admin();
  const cl = await usuario('c305@t.com', 'cliente');
  const otro = await usuario('c305b@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 3 }]);
  const r = await cl.a('GET', '/api/pedidos');
  assert.ok(r.body.some(p => p.id === body.id));
  const ajeno = await otro.a('GET', '/api/pedidos/' + body.id);
  assert.equal(ajeno.status, 403);
  assert.ok(!(await otro.a('GET', '/api/pedidos')).body.some(p => p.id === body.id));
});
test('SPEC-30.6 cancelar pendiente -> cancelado y stock repuesto', async () => {
  const adm = await admin();
  const of = await usuario('v306@t.com', 'vendedor');
  const cl = await usuario('c306@t.com', 'cliente');
  const id = await aprobado(of, adm, { stock: 5 });
  const pedido = await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [{ id, cantidad: 2 }] });
  assert.equal((await of.a('GET', '/api/productos/mios')).body.find(p => p.id === id).stock, 3);
  const r = await cl.a('POST', `/api/pedidos/${pedido.body.id}/cancelar`);
  assert.equal(r.status, 200); assert.equal(r.body.estado, 'cancelado');
  assert.equal((await of.a('GET', '/api/productos/mios')).body.find(p => p.id === id).stock, 5);
});
test('SPEC-30.7 cancelar pagado -> 409; cancelar ajeno -> 403', async () => {
  const adm = await admin();
  const cl = await usuario('c307@t.com', 'cliente');
  const otro = await usuario('c307b@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 3 }]);
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' });
  assert.equal((await cl.a('POST', `/api/pedidos/${body.id}/cancelar`)).status, 409);
  assert.equal((await otro.a('POST', `/api/pedidos/${body.id}/cancelar`)).status, 403);
});
test('SPEC-30.8 pedido inexistente -> 404', async () => {
  const cl = await usuario('c308@t.com', 'cliente');
  assert.equal((await cl.a('GET', '/api/pedidos/99999')).status, 404);
  assert.equal((await cl.a('POST', '/api/pedidos/99999/cancelar')).status, 404);
});

// ---------- HU-05 Cobros ----------
test('SPEC-31.1 pagar con método válido -> pagado + envio preparacion', async () => {
  const adm = await admin();
  const cl = await usuario('c311@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 20, stock: 5 }]);
  const r = await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'paypal' });
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'pagado');
  assert.equal(r.body.pago.metodo, 'paypal');
  assert.equal(r.body.envio.estado, 'preparacion');
  const pedido = (await cl.a('GET', '/api/pedidos')).body.find(p => p.id === body.id);
  assert.equal(pedido.estado, 'pagado');
  assert.equal(pedido.pago.estado, 'completado');
  assert.equal(pedido.envio.destino, 'Calle Falsa 123');
});
test('SPEC-31.2 método inválido -> 400 y sigue pendiente', async () => {
  const adm = await admin();
  const cl = await usuario('c312@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  assert.equal((await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'bitcoin' })).status, 400);
  assert.equal((await cl.a('GET', '/api/pedidos')).body.find(p => p.id === body.id).estado, 'pendiente');
});
test('SPEC-31.3 pagar dos veces -> 409', async () => {
  const adm = await admin();
  const cl = await usuario('c313@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  assert.equal((await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' })).status, 200);
  assert.equal((await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' })).status, 409);
});
test('SPEC-31.4 pago ajeno -> 403; inexistente -> 404; sin sesión -> 401', async () => {
  const adm = await admin();
  const cl = await usuario('c314@t.com', 'cliente');
  const otro = await usuario('c314b@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  assert.equal((await otro.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' })).status, 403);
  assert.equal((await cl.a('POST', '/api/pedidos/99999/pago', { metodo: 'tarjeta' })).status, 404);
  assert.equal((await agente()('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' })).status, 401);
});
test('SPEC-31.5 GET detalle incluye pago con monto = total', async () => {
  const adm = await admin();
  const cl = await usuario('c315@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 15.5, stock: 4 }, { precio: 4.5, stock: 4 }], 'Dir 2');
  // cantidad 1 c/u => total 20
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'transferencia' });
  const d = await cl.a('GET', '/api/pedidos/' + body.id);
  assert.equal(d.status, 200);
  assert.equal(d.body.pago.monto, d.body.total);
  assert.equal(d.body.pago.estado, 'completado');
});

// ---------- HU-06 Distribución ----------
test('SPEC-32.1 al pagar se crea envio preparacion con destino', async () => {
  const adm = await admin();
  const cl = await usuario('c321@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }], 'Misión Imposible 1');
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' });
  const pedido = (await cl.a('GET', '/api/pedidos')).body.find(p => p.id === body.id);
  assert.equal(pedido.envio.estado, 'preparacion');
  assert.equal(pedido.envio.destino, 'Misión Imposible 1');
  assert.ok(pedido.envio.tracking);
});
test('SPEC-32.2 admin lista envios', async () => {
  const adm = await admin();
  const cl = await usuario('c322@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' });
  const r = await adm('GET', '/api/admin/envios');
  assert.equal(r.status, 200);
  assert.ok(r.body.some(e => e.pedido_id === body.id));
});
test('SPEC-32.3 transiciones válidas; entregado -> pedido entregado', async () => {
  const adm = await admin();
  const cl = await usuario('c323@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' });
  const envios = (await adm('GET', '/api/admin/envios')).body;
  const e = envios.find(x => x.pedido_id === body.id);
  let r = await adm('PUT', `/api/admin/envios/${e.id}`, { estado: 'en_transito' });
  assert.equal(r.status, 200); assert.equal(r.body.estado, 'en_transito');
  r = await adm('PUT', `/api/admin/envios/${e.id}`, { estado: 'entregado' });
  assert.equal(r.status, 200);
  const pedido = await cl.a('GET', '/api/pedidos/' + body.id);
  assert.equal(pedido.body.estado, 'entregado');
  assert.equal(pedido.body.envio.estado, 'entregado');
});
test('SPEC-32.4 transición inválida -> 400', async () => {
  const adm = await admin();
  const cl = await usuario('c324@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' });
  const e = (await adm('GET', '/api/admin/envios')).body.find(x => x.pedido_id === body.id);
  await adm('PUT', `/api/admin/envios/${e.id}`, { estado: 'en_transito' });
  assert.equal((await adm('PUT', `/api/admin/envios/${e.id}`, { estado: 'preparacion' })).status, 400);
  assert.equal((await adm('PUT', `/api/admin/envios/${e.id}`, { estado: 'xyz' })).status, 400);
});
test('SPEC-32.5 no-admin -> 403; envio inexistente -> 404', async () => {
  const of = await usuario('v325@t.com', 'vendedor');
  assert.equal((await of.a('GET', '/api/admin/envios')).status, 403);
  assert.equal((await of.a('PUT', '/api/admin/envios/1', { estado: 'en_transito' })).status, 403);
  const adm = await admin();
  assert.equal((await adm('PUT', '/api/admin/envios/99999', { estado: 'en_transito' })).status, 404);
});
test('SPEC-32.6 el comprador ve envio en GET /api/pedidos', async () => {
  const adm = await admin();
  const cl = await usuario('c326@t.com', 'cliente');
  const { body } = await comprar(cl, adm, [{ precio: 10, stock: 2 }]);
  await cl.a('POST', `/api/pedidos/${body.id}/pago`, { metodo: 'tarjeta' });
  const pedido = (await cl.a('GET', '/api/pedidos')).body.find(p => p.id === body.id);
  assert.ok(pedido.envio);
  assert.equal(pedido.envio.estado, 'preparacion');
});

// ---------- HU-07 Almacén ----------
test('SPEC-33.1 checkout registra movimiento salida y decrementa stock', async () => {
  const adm = await admin();
  const of = await usuario('v331@t.com', 'vendedor');
  const cl = await usuario('c331@t.com', 'cliente');
  const id = await aprobado(of, adm, { stock: 6 });
  await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [{ id, cantidad: 3 }] });
  const movs = (await of.a('GET', '/api/almacen/movimientos')).body;
  const salida = movs.find(m => m.producto_id === id && m.tipo === 'salida');
  assert.ok(salida); assert.equal(salida.cantidad, 3);
  assert.equal((await of.a('GET', '/api/productos/mios')).body.find(p => p.id === id).stock, 3);
});
test('SPEC-33.2 entrada de stock -> incrementa y registra', async () => {
  const of = await usuario('v332@t.com', 'vendedor');
  const adm = await admin();
  const id = await aprobado(of, adm, { stock: 2 });
  const r = await of.a('POST', '/api/almacen/entrada', { producto_id: id, cantidad: 10, motivo: 'Reposición proveedor' });
  assert.equal(r.status, 201); assert.equal(r.body.stock, 12);
  const movs = (await of.a('GET', '/api/almacen/movimientos')).body;
  const ent = movs.find(m => m.producto_id === id && m.tipo === 'entrada');
  assert.ok(ent); assert.equal(ent.motivo, 'Reposición proveedor');
});
test('SPEC-33.3 entrada inválida -> 400/403/404', async () => {
  const a = await usuario('v333a@t.com', 'vendedor');
  const b = await usuario('v333b@t.com', 'vendedor');
  const adm = await admin();
  const id = await aprobado(a, adm, { stock: 1 });
  assert.equal((await a.a('POST', '/api/almacen/entrada', { producto_id: id, cantidad: 0 })).status, 400);
  assert.equal((await b.a('POST', '/api/almacen/entrada', { producto_id: id, cantidad: 5 })).status, 403);
  assert.equal((await a.a('POST', '/api/almacen/entrada', { producto_id: 99999, cantidad: 5 })).status, 404);
  const cl = await usuario('c333@t.com', 'cliente');
  assert.equal((await cl.a('POST', '/api/almacen/entrada', { producto_id: id, cantidad: 5 })).status, 403);
});
test('SPEC-33.4 inventario: admin todos, ofertante solo suyos, roles restringidos', async () => {
  const adm = await admin();
  const of = await usuario('v334@t.com', 'vendedor');
  const cl = await usuario('c334@t.com', 'cliente');
  const id = await aprobado(of, adm, { titulo: 'Producto 334', stock: 4 });
  const adminList = await adm('GET', '/api/almacen');
  assert.equal(adminList.status, 200);
  assert.ok(adminList.body.some(p => p.id === id));
  const ofList = await of.a('GET', '/api/almacen');
  assert.ok(ofList.body.every(p => p.ofertante === 'v334@t.com'));
  assert.ok(ofList.body.some(p => p.id === id));
  assert.equal((await cl.a('GET', '/api/almacen')).status, 403);
  assert.equal((await agente()('GET', '/api/almacen')).status, 401);
});
test('SPEC-33.5 movimientos respetan el alcance del inventario', async () => {
  const adm = await admin();
  const a = await usuario('v335a@t.com', 'vendedor');
  const b = await usuario('v335b@t.com', 'vendedor');
  const idA = await aprobado(a, adm, { stock: 3 });
  await a.a('POST', '/api/almacen/entrada', { producto_id: idA, cantidad: 1, motivo: 'A' });
  const movsB = (await b.a('GET', '/api/almacen/movimientos')).body;
  assert.ok(movsB.every(m => m.producto_id !== idA));
  const movsA = (await a.a('GET', '/api/almacen/movimientos')).body;
  assert.ok(movsA.some(m => m.producto_id === idA));
  assert.equal((await (await usuario('c335@t.com', 'cliente')).a('GET', '/api/almacen/movimientos')).status, 403);
});
test('SPEC-33.6 cancelar pedido repone stock con movimiento entrada', async () => {
  const adm = await admin();
  const of = await usuario('v336@t.com', 'vendedor');
  const cl = await usuario('c336@t.com', 'cliente');
  const id = await aprobado(of, adm, { stock: 5 });
  const pedido = await cl.a('POST', '/api/pedidos', { direccion: 'x', items: [{ id, cantidad: 2 }] });
  await cl.a('POST', `/api/pedidos/${pedido.body.id}/cancelar`);
  const movs = (await of.a('GET', '/api/almacen/movimientos')).body;
  const repon = movs.find(m => m.producto_id === id && m.tipo === 'entrada' && String(m.motivo).includes(`#${pedido.body.id}`));
  assert.ok(repon);
  assert.equal((await of.a('GET', '/api/productos/mios')).body.find(p => p.id === id).stock, 5);
});
test('SPEC-33.7 stock bajo se marca en inventario', async () => {
  const adm = await admin();
  const of = await usuario('v337@t.com', 'vendedor');
  const id = await aprobado(of, adm, { stock: 3 });
  const inv = (await of.a('GET', '/api/almacen')).body.find(p => p.id === id);
  assert.equal(inv.stock_bajo, 1);
  await of.a('POST', '/api/almacen/entrada', { producto_id: id, cantidad: 10 });
  const inv2 = (await of.a('GET', '/api/almacen')).body.find(p => p.id === id);
  assert.equal(inv2.stock_bajo, 0);
});
