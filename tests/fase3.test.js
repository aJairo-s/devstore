const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  start, client, registrarCliente, registrarInstructor, admin,
  categoriaId, verificarInstructor, crearCurso, cursoCompleto, crearLeccionYoutube
} = require('./helpers');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64'
);

async function cursoPublicado(base, instructor, catId, extra = {}) {
  const cursoId = await crearCurso(instructor, catId, extra);
  const seccion = await instructor.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Contenido' });
  assert.equal(seccion.status, 201);
  await crearLeccionYoutube(instructor, seccion.data.id, { titulo: 'Lección de prueba' });
  const envio = await instructor.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
  assert.equal(envio.status, 200);
  const administracion = await admin(base);
  const aprobado = await administracion.post(`/api/admin/cursos/${cursoId}/aprobar`);
  assert.equal(aprobado.status, 200);
  const completo = await cursoCompleto(instructor, cursoId);
  return { cursoId, slug: completo.slug };
}

function formDataImagen(contenido = PNG, nombre = 'qr.png', tipo = 'image/png') {
  const fd = new FormData();
  fd.append('qr', new Blob([contenido], { type: tipo }), nombre);
  return fd;
}

test('Fase 3: pago por QR, datos de cobro y moneda Bs', async t => {
  const { base, close } = await start();
  t.after(close);
  const catId = await categoriaId(base, 'backend');

  const instructor = await registrarInstructor(base, 'cobros-f3@test.com', {
    nombre: 'Ines', apellidos: 'Cobros'
  });
  const me = await instructor.get('/api/auth/me');
  const instructorId = me.data.id;
  const administracion = await admin(base);
  await verificarInstructor(administracion, instructorId);

  const cursoA = await cursoPublicado(base, instructor, catId, { titulo: 'Curso con transferencia', precio: 25 });
  const cursoB = await cursoPublicado(base, instructor, catId, { titulo: 'Curso con QR', precio: 30 });

  const comprador = await registrarCliente(base, 'comprador-f3@test.com', { nombre: 'Bruno', apellidos: 'Privado' });

  await t.test('los métodos incluyen Pago por QR', async () => {
    const r = await client(base).get('/api/metodos-pago');
    assert.equal(r.status, 200);
    const qr = r.data.find(m => m.slug === 'qr');
    assert.ok(qr);
    assert.equal(qr.nombre, 'Pago por QR');
    assert.ok(r.data.some(m => m.slug === 'transferencia'));
    assert.ok(r.data.some(m => m.slug === 'tarjeta'));
  });

  await t.test('los datos de cobro son privados para invitados', async () => {
    assert.equal((await client(base).get(`/api/instructores/${instructorId}/pago`)).status, 401);
    assert.equal((await client(base).get(`/api/instructores/${instructorId}/qr`)).status, 401);
    assert.equal((await comprador.put('/api/instructor/pago', { banco: 'Intruso' })).status, 403);
    assert.equal((await comprador.post('/api/instructor/pago/qr', formDataImagen())).status, 403);
    assert.equal((await comprador.get('/api/instructor/pago')).status, 403);
  });

  await t.test('sin configuración, los métodos del instructor no se pueden usar', async () => {
    const sinDatos = await comprador.get(`/api/instructores/${instructorId}/pago`);
    assert.equal(sinDatos.status, 200);
    assert.equal(sinDatos.data.banco, null);
    assert.equal(sinDatos.data.qr_url, null);

    const qr = await comprador.post('/api/compras', {
      curso_ids: [cursoA.cursoId], metodo_pago_id: 3, detalle_pago: 'Pago por QR'
    });
    assert.equal(qr.status, 409);
    assert.match(qr.data.error, /QR/i);

    const transferencia = await comprador.post('/api/compras', {
      curso_ids: [cursoB.cursoId], metodo_pago_id: 2
    });
    assert.equal(transferencia.status, 409);
    assert.match(transferencia.data.error, /transferencia/i);
  });

  await t.test('el instructor configura cuenta bancaria y sube su QR', async () => {
    const guardado = await instructor.put('/api/instructor/pago', {
      banco: 'Banco Unión', titular: 'Ines Cobros', cuenta: '1000-0000-1111',
      tipo_cuenta: 'Cuenta de ahorros', instrucciones: 'Usa tu email como referencia.'
    });
    assert.equal(guardado.status, 200, JSON.stringify(guardado.data));
    assert.equal(guardado.data.pago.banco, 'Banco Unión');
    assert.equal(guardado.data.pago.cuenta, '1000-0000-1111');

    const invalido = await instructor.post('/api/instructor/pago/qr', formDataImagen(Buffer.from('no soy imagen')));
    assert.equal(invalido.status, 400);

    const subido = await instructor.post('/api/instructor/pago/qr', formDataImagen());
    assert.equal(subido.status, 201, JSON.stringify(subido.data));
    assert.match(subido.data.qr_url, /\/api\/instructores\/\d+\/qr/);

    const datos = await comprador.get(`/api/instructores/${instructorId}/pago`);
    assert.equal(datos.status, 200);
    assert.equal(datos.data.banco, 'Banco Unión');
    assert.equal(datos.data.tipo_cuenta, 'Cuenta de ahorros');
    assert.ok(datos.data.qr_url);
    // No se exponen campos internos del perfil ni datos del comprador.
    assert.equal(datos.data.pago_qr_path, undefined);
    assert.equal(datos.data.email, undefined);

    const imagen = await comprador.get(datos.data.qr_url);
    assert.equal(imagen.status, 200);
    assert.match(imagen.headers.get('content-type') || '', /image\/png/);

    // La administración también puede consultar los datos; cada instructor edita solo los suyos.
    assert.equal((await administracion.get(`/api/instructores/${instructorId}/pago`)).status, 200);
    const otroInst = await registrarInstructor(base, 'otro-cobros-f3@test.com');
    const suyo = await otroInst.get('/api/instructor/pago');
    assert.equal(suyo.status, 200);
    assert.equal(suyo.data.banco, '');
    assert.equal(suyo.data.qr_url, null);
  });

  await t.test('compra con transferencia y con QR deja comprobante y acceso', async () => {
    const conTransferencia = await comprador.post('/api/compras', {
      curso_ids: [cursoA.cursoId], metodo_pago_id: 2, detalle_pago: 'Transferencia · Banco Unión'
    });
    assert.equal(conTransferencia.status, 201, JSON.stringify(conTransferencia.data));
    assert.equal(conTransferencia.data.metodo_pago_slug, 'transferencia');
    assert.equal(conTransferencia.data.pago_detalle, 'Transferencia · Banco Unión');
    assert.equal((await comprador.get(`/api/cursos/${cursoA.slug}`)).data.acceso_completo, true);

    const conQr = await comprador.post('/api/compras', {
      curso_ids: [cursoB.cursoId], metodo_pago_id: 3, detalle_pago: 'Pago por QR'
    });
    assert.equal(conQr.status, 201, JSON.stringify(conQr.data));
    assert.equal(conQr.data.metodo_pago_slug, 'qr');
    assert.equal(conQr.data.pago_detalle, 'Pago por QR');
    assert.equal((await comprador.get(`/api/mis-cursos`)).data.length, 2);
  });

  await t.test('la interfaz usa Bs y ya no muestra credenciales demo', () => {
    const raiz = path.resolve(__dirname, '..');
    const acceso = fs.readFileSync(path.join(raiz, 'public/acceso.html'), 'utf8');
    assert.doesNotMatch(acceso, /Admin123!/);
    assert.doesNotMatch(acceso, /Demo1234!/);
    assert.doesNotMatch(acceso, /Cuentas de demostración/);

    const app = fs.readFileSync(path.join(raiz, 'public/js/app.js'), 'utf8');
    assert.match(app, /'Bs '/);
    assert.doesNotMatch(app, /'\$' \+ Number/);

    const detalle = fs.readFileSync(path.join(raiz, 'public/curso.html'), 'utf8');
    assert.doesNotMatch(detalle, /USD/);
    assert.match(detalle, /Pago por QR|pago por QR/);

    const editor = fs.readFileSync(path.join(raiz, 'public/editor-curso.html'), 'utf8');
    assert.doesNotMatch(editor, /Precio \(USD\)/);
    assert.match(editor, /Precio \(Bs\)/);
  });
});
