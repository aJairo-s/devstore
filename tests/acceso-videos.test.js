const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, client, registrarCliente, registrarInstructor, admin,
  categoriaId, verificarInstructor, crearCurso, cursoCompleto, crearLeccionYoutube
} = require('./helpers');

const YT_ID = 'dQw4w9WgXcQ';

async function cursoPublicado(base, instructor, catId, extra = {}) {
  const cursoId = await crearCurso(instructor, catId, extra);
  const sec = await instructor.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Contenido' });
  // Una lección marcada como vista previa y otra normal: ambas deben quedar protegidas.
  const preview = await crearLeccionYoutube(instructor, sec.data.id, {
    titulo: 'Lección marcada como vista previa', es_preview: true
  });
  const privada = await crearLeccionYoutube(instructor, sec.data.id, {
    titulo: 'Lección privada'
  });
  await instructor.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
  await (await admin(base)).post(`/api/admin/cursos/${cursoId}/aprobar`);
  const completo = await cursoCompleto(instructor, cursoId);
  return { cursoId, slug: completo.slug, preview, privada };
}

test('ningún video se sirve sin compra, ni siquiera las vistas previas', async t => {
  const { base, close } = await start();
  t.after(close);
  const catId = await categoriaId(base, 'backend');

  const instructor = await registrarInstructor(base, 'videos-inst@test.com');
  const me = await instructor.get('/api/auth/me');
  await verificarInstructor(await admin(base), me.data.id);
  const { cursoId, slug, preview, privada } = await cursoPublicado(base, instructor, catId, {
    titulo: 'Curso con videos protegidos', precio: 30
  });

  const anon = client(base);
  const alumno = await registrarCliente(base, 'videos-alumno@test.com');

  // Invitados y clientes sin compra: 403 para cualquier lección.
  for (const leccion of [preview, privada]) {
    assert.equal((await anon.get('/api/lecciones/' + leccion)).status, 403);
    assert.equal((await alumno.get('/api/lecciones/' + leccion)).status, 403);
  }

  // El temario público tampoco filtra el ID del video de YouTube.
  const detalle = await alumno.get('/api/cursos/' + slug);
  assert.equal(detalle.status, 200);
  assert.equal(detalle.data.acceso_completo, false);
  assert.equal(JSON.stringify(detalle.data).includes(YT_ID), false);

  // Tras comprar, ambas lecciones quedan disponibles.
  const metodos = (await alumno.get('/api/metodos-pago')).data;
  const tarjeta = metodos.find(m => m.slug === 'tarjeta');
  const compra = await alumno.post('/api/compras', { curso_ids: [cursoId], metodo_pago_id: tarjeta.id });
  assert.equal(compra.status, 201, JSON.stringify(compra.data));
  assert.equal((await alumno.get('/api/lecciones/' + preview)).status, 200);
  assert.equal((await alumno.get('/api/lecciones/' + privada)).status, 200);
});

test('un curso gratuito también exige inscripción para ver los videos', async t => {
  const { base, close } = await start();
  t.after(close);
  const catId = await categoriaId(base, 'frontend');

  const instructor = await registrarInstructor(base, 'videos-gratis-inst@test.com');
  const me = await instructor.get('/api/auth/me');
  await verificarInstructor(await admin(base), me.data.id);
  const { cursoId, preview } = await cursoPublicado(base, instructor, catId, {
    titulo: 'Curso gratuito con video', precio: 0
  });

  const alumno = await registrarCliente(base, 'videos-gratis-alumno@test.com');
  assert.equal((await alumno.get('/api/lecciones/' + preview)).status, 403);
  const detalle = await alumno.get('/api/cursos/' + (await cursoCompleto(instructor, cursoId)).slug);
  assert.equal(detalle.data.acceso_completo, false);

  const inscripcion = await alumno.post('/api/compras', { curso_ids: [cursoId] });
  assert.equal(inscripcion.status, 201, JSON.stringify(inscripcion.data));
  assert.equal((await alumno.get('/api/lecciones/' + preview)).status, 200);
});
