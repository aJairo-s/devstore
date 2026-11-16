const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, client, registrarCliente, registrarInstructor, admin, db,
  categoriaId, verificarInstructor, crearCurso, crearLeccionYoutube
} = require('./helpers');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64'
);

async function cursoPublicado(base, instructor, catId, extra) {
  const id = await crearCurso(instructor, catId, extra);
  const sec = await instructor.post(`/api/instructor/cursos/${id}/secciones`, { titulo: 'Contenido' });
  await crearLeccionYoutube(instructor, sec.data.id);
  await instructor.post(`/api/instructor/cursos/${id}/enviar-revision`);
  const a = await admin(base);
  await a.post(`/api/admin/cursos/${id}/aprobar`);
  return id;
}

async function instructorConQr(base, email, catId, precio) {
  const c = await registrarInstructor(base, email);
  const me = await c.get('/api/auth/me');
  await verificarInstructor(await admin(base), me.data.id);
  const fd = new FormData();
  fd.append('qr', new Blob([PNG], { type: 'image/png' }), 'qr.png');
  assert.equal((await c.post('/api/instructor/pago/qr', fd)).status, 201);
  const cursoId = await cursoPublicado(base, c, catId, { titulo: `Curso ${email}`, precio });
  return { c, id: me.data.id, cursoId };
}

const metodoQr = () => db.prepare("SELECT id FROM metodos_pago WHERE slug='qr'").get().id;

test('Validación del pago por QR por el instructor', async t => {
  const { base, close } = await start();
  t.after(close);
  const catId = await categoriaId(base, 'backend');
  const ins = await instructorConQr(base, 'qr-ins@test.com', catId, 40);
  const otro = await instructorConQr(base, 'qr-otro@test.com', catId, 20);
  const alumno = await registrarCliente(base, 'qr-alumno@test.com', { nombre: 'Secreto', apellidos: 'Comprador' });
  const pagar = (cli, cursoId, detalle = 'Pago por QR · Op. 123') =>
    cli.post('/api/compras', { curso_ids: [cursoId], metodo_pago_id: metodoQr(), detalle_pago: detalle });

  let compraId;

  await t.test('la compra queda pendiente, sin acceso, y se avisa al instructor', async () => {
    const r = await pagar(alumno, ins.cursoId);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.estado, 'pendiente');
    assert.equal(r.data.pago_estado, 'pendiente');
    compraId = r.data.id;
    assert.equal((await alumno.get('/api/mis-cursos')).data.length, 0);
    const notis = (await ins.c.get('/api/notificaciones')).data;
    const lista = Array.isArray(notis) ? notis : notis.notificaciones || notis.items;
    assert.ok(lista.some(n => /QR/.test(n.titulo) && n.enlace === '/instructor.html#pagos-qr'));
  });

  await t.test('no se puede duplicar una compra pendiente', async () => {
    assert.equal((await pagar(alumno, ins.cursoId)).status, 409);
  });

  await t.test('el instructor ve el pago pendiente sin datos del comprador', async () => {
    const r = await ins.c.get('/api/instructor/pagos-qr');
    assert.equal(r.status, 200);
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].compra_id, compraId);
    assert.equal(r.data[0].total, 40);
    assert.equal(r.data[0].pago_detalle, 'Pago por QR · Op. 123');
    const texto = JSON.stringify(r.data);
    assert.doesNotMatch(texto, /Secreto|Comprador|qr-alumno|cliente/i);
  });

  await t.test('permisos: ni clientes, ni invitados, ni otros instructores', async () => {
    assert.equal((await client(base).get('/api/instructor/pagos-qr')).status, 401);
    assert.equal((await alumno.get('/api/instructor/pagos-qr')).status, 403);
    assert.equal((await alumno.post(`/api/instructor/pagos-qr/${compraId}/aprobar`)).status, 403);
    assert.equal((await otro.c.get('/api/instructor/pagos-qr')).data.length, 0);
    assert.equal((await otro.c.post(`/api/instructor/pagos-qr/${compraId}/aprobar`)).status, 404);
    assert.equal((await otro.c.post(`/api/instructor/pagos-qr/${compraId}/rechazar`, {})).status, 404);
    assert.equal((await alumno.get('/api/mis-cursos')).data.length, 0);
  });

  await t.test('al confirmar se activa el acceso y se notifica al estudiante', async () => {
    const r = await ins.c.post(`/api/instructor/pagos-qr/${compraId}/aprobar`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.estado, 'pagada');
    assert.equal((await alumno.get('/api/mis-cursos')).data.length, 1);
    const compra = (await alumno.get(`/api/compras/${compraId}`)).data;
    assert.equal(compra.estado, 'pagada');
    assert.equal(compra.pago_estado, 'completado');
    assert.ok(compra.pago_verificado_en);
    assert.equal((await ins.c.get('/api/instructor/pagos-qr')).data.length, 0);
    const analitica = (await ins.c.get('/api/instructor/analitica')).data;
    assert.equal(analitica.resumen.ventas, 1);
  });

  await t.test('un pago ya procesado no se puede resolver otra vez', async () => {
    assert.equal((await ins.c.post(`/api/instructor/pagos-qr/${compraId}/aprobar`)).status, 409);
    assert.equal((await ins.c.post(`/api/instructor/pagos-qr/${compraId}/rechazar`, {})).status, 409);
  });

  await t.test('al rechazar no hay acceso, queda el motivo y se puede reintentar', async () => {
    const alumno2 = await registrarCliente(base, 'qr-alumno2@test.com');
    const c = await pagar(alumno2, otro.cursoId);
    assert.equal(c.status, 201);
    const r = await otro.c.post(`/api/instructor/pagos-qr/${c.data.id}/rechazar`, { motivo: 'No llegó el depósito' });
    assert.equal(r.status, 200);
    assert.equal(r.data.estado, 'cancelada');
    assert.equal((await alumno2.get('/api/mis-cursos')).data.length, 0);
    const compra = (await alumno2.get('/api/mis-compras')).data[0];
    assert.equal(compra.estado, 'cancelada');
    assert.equal(compra.pago_motivo_rechazo, 'No llegó el depósito');
    assert.equal((await otro.c.get('/api/instructor/analitica')).data.resumen.ventas, 0);
    // Puede volver a intentarlo.
    assert.equal((await pagar(alumno2, otro.cursoId)).status, 201);
  });

  await t.test('el pago por QR de varios instructores se separa', async () => {
    const alumno3 = await registrarCliente(base, 'qr-alumno3@test.com');
    const r = await alumno3.post('/api/compras', {
      curso_ids: [ins.cursoId, otro.cursoId], metodo_pago_id: metodoQr()
    });
    assert.equal(r.status, 400);
  });
});
