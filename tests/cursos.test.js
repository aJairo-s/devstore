const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, client, db, registrarCliente, registrarInstructor, login, admin,
  categoriaId, verificarInstructor, crearCurso, cursoCompleto, crearLeccionYoutube, PASS
} = require('./helpers');

async function instructorVerificado(base, email) {
  const inst = await registrarInstructor(base, email);
  const me = await inst.get('/api/auth/me');
  const a = await admin(base);
  await verificarInstructor(a, me.data.id);
  return { inst, id: me.data.id };
}

test('cursos, temario y flujo de aprobación', async t => {
  const { base, close } = await start();
  t.after(close);
  const catId = await categoriaId(base, 'backend');

  await t.test('un instructor no verificado no puede enviar a revisión', async () => {
    const inst = await registrarInstructor(base, 'novato@test.com');
    const cursoId = await crearCurso(inst, catId);
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Introducción' });
    assert.equal(sec.status, 201);
    await crearLeccionYoutube(inst, sec.data.id);
    const r = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(r.status, 403);
  });

  await t.test('crear curso, secciones y lecciones', async () => {
    const { inst } = await instructorVerificado(base, 'profe1@test.com');
    const cursoId = await crearCurso(inst, catId, { titulo: 'APIs REST con Node.js desde cero' });

    let curso = await cursoCompleto(inst, cursoId);
    assert.equal(curso.estado, 'borrador');
    assert.equal(curso.secciones.length, 0);
    assert.equal(curso.categoria_id, catId);

    const s1 = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Fundamentos' });
    const s2 = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Producción' });
    assert.equal(s1.status, 201);
    assert.equal(s2.status, 201);

    const l1 = await crearLeccionYoutube(inst, s1.data.id, { es_preview: true });
    await crearLeccionYoutube(inst, s1.data.id, { titulo: 'Segunda lección' });
    await crearLeccionYoutube(inst, s2.data.id, { titulo: 'Despliegue' });

    curso = await cursoCompleto(inst, cursoId);
    assert.equal(curso.secciones.length, 2);
    assert.equal(curso.secciones[0].lecciones.length, 2);
    assert.equal(curso.secciones[0].lecciones[0].es_preview, true);
    assert.equal(curso.secciones[0].lecciones[0].tipo_video, 'youtube');
    assert.ok(curso.secciones[0].lecciones[0].youtube_video_id);
    assert.equal(l1 > 0, true);

    // Reordenar secciones
    const ids = [s2.data.id, s1.data.id];
    const orden = await inst.put(`/api/instructor/cursos/${cursoId}/secciones/orden`, { ids });
    assert.equal(orden.status, 200);
    curso = await cursoCompleto(inst, cursoId);
    assert.equal(curso.secciones[0].id, s2.data.id);

    // Reordenar lecciones dentro de una sección
    const lecciones = curso.secciones.find(s => s.id === s1.data.id).lecciones;
    const ordenLecciones = await inst.put(`/api/instructor/secciones/${s1.data.id}/lecciones/orden`, {
      ids: [lecciones[1].id, lecciones[0].id]
    });
    assert.equal(ordenLecciones.status, 200);
    const recargado = await cursoCompleto(inst, cursoId);
    assert.equal(recargado.secciones.find(s => s.id === s1.data.id).lecciones[0].id, lecciones[1].id);
  });

  await t.test('validación de YouTube y de campos del curso', async () => {
    const { inst } = await instructorVerificado(base, 'profe2@test.com');
    const cursoId = await crearCurso(inst, catId);
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Sección' });

    const invalido = await inst.post(`/api/instructor/secciones/${sec.data.id}/lecciones`, {
      titulo: 'Video roto', tipo_video: 'youtube', youtube_url: 'https://example.com/video'
    });
    assert.equal(invalido.status, 400);

    const porId = await inst.post(`/api/instructor/secciones/${sec.data.id}/lecciones`, {
      titulo: 'Video por ID', tipo_video: 'youtube', youtube_video_id: 'dQw4w9WgXcQ'
    });
    assert.equal(porId.status, 201);

    const sinTitulo = await inst.post('/api/instructor/cursos', { categoria_id: catId, titulo: 'abc' });
    assert.equal(sinTitulo.status, 400);

    const catMala = await inst.post('/api/instructor/cursos', { titulo: 'Curso con categoría mala', categoria_id: 99999 });
    assert.equal(catMala.status, 400);

    const precioMalo = await inst.put(`/api/instructor/cursos/${cursoId}`, {
      titulo: 'Curso de prueba de Node.js', resumen: 'Resumen válido para el curso', descripcion: 'Descripción suficientemente larga para pasar la validación del curso.',
      categoria_id: catId, precio: -5, nivel: 'principiante', idioma: 'Español'
    });
    assert.equal(precioMalo.status, 400);
  });

  await t.test('otro instructor no puede acceder ni editar el curso', async () => {
    const { inst: dueno } = await instructorVerificado(base, 'profe3@test.com');
    const { inst: otro } = await instructorVerificado(base, 'profe4@test.com');
    const cursoId = await crearCurso(dueno, catId, { titulo: 'Curso privado del dueño' });

    assert.equal((await otro.get(`/api/instructor/cursos/${cursoId}`)).status, 404);
    assert.equal((await otro.put(`/api/instructor/cursos/${cursoId}`, {
      titulo: 'Intento de edición', resumen: 'Resumen válido para el curso', descripcion: 'Descripción suficientemente larga para pasar la validación.',
      categoria_id: catId, precio: 10, nivel: 'principiante', idioma: 'Español'
    })).status, 404);
    assert.equal((await otro.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Intruso' })).status, 404);
  });

  await t.test('no se puede enviar a revisión un curso incompleto', async () => {
    const { inst } = await instructorVerificado(base, 'profe5@test.com');
    const cursoId = await crearCurso(inst, catId);

    const sinSeccion = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(sinSeccion.status, 400);

    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Sección' });
    const sinLecciones = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(sinLecciones.status, 400);

    const sinVideoLeccion = await inst.post(`/api/instructor/secciones/${sec.data.id}/lecciones`, { titulo: 'Sin video' });
    assert.equal(sinVideoLeccion.status, 201);
    const sinVideo = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(sinVideo.status, 400);
    assert.match(sinVideo.data.error, /video/i);

    // Al completar el video de la lección pendiente, el envío ya es válido.
    const completar = await inst.put(`/api/instructor/lecciones/${sinVideoLeccion.data.id}`, {
      tipo_video: 'youtube', youtube_url: 'https://youtu.be/dQw4w9WgXcQ'
    });
    assert.equal(completar.status, 200);
    await crearLeccionYoutube(inst, sec.data.id);
    const ok = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(ok.status, 200);
    assert.equal(ok.data.estado, 'pendiente');
  });

  await t.test('flujo completo: envío, aprobación y catálogo público', async () => {
    const { inst } = await instructorVerificado(base, 'profe6@test.com');
    const cursoId = await crearCurso(inst, catId, { titulo: 'Curso público de pruebas E2E', precio: 25 });
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Contenido' });
    const preview = await crearLeccionYoutube(inst, sec.data.id, { titulo: 'Vista previa', es_preview: true });
    const privada = await crearLeccionYoutube(inst, sec.data.id, { titulo: 'Lección privada' });

    const envio = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(envio.status, 200);

    // Mientras está pendiente no aparece en el catálogo público.
    const anon = client(base);
    const slug = (await cursoCompleto(inst, cursoId)).slug;
    assert.equal((await anon.get('/api/cursos/' + slug)).status, 404);

    const a = await admin(base);
    const pendientes = await a.get('/api/admin/cursos?estado=pendiente');
    assert.ok(pendientes.data.some(c => c.id === cursoId));

    const aprobado = await a.post(`/api/admin/cursos/${cursoId}/aprobar`);
    assert.equal(aprobado.status, 200);

    const publico = await anon.get('/api/cursos?limit=60');
    assert.ok(publico.data.some(c => c.id === cursoId));

    const detalle = await anon.get('/api/cursos/' + slug);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.data.acceso_completo, false);
    assert.equal(detalle.data.secciones.length, 1);

    // Ningún video se sirve sin compra, ni siquiera las lecciones marcadas como vista previa.
    assert.equal((await anon.get('/api/lecciones/' + preview)).status, 403);
    assert.equal((await anon.get('/api/lecciones/' + privada)).status, 403);

    // Un cliente sin inscripción tampoco accede a ningún video.
    const cliente = await registrarCliente(base, 'sincompra@test.com');
    assert.equal((await cliente.get('/api/lecciones/' + preview)).status, 403);
    assert.equal((await cliente.get('/api/lecciones/' + privada)).status, 403);
    assert.equal((await cliente.get('/api/mis-cursos')).data.length, 0);

    // El dueño y el administrador sí acceden.
    assert.equal((await inst.get('/api/lecciones/' + privada)).status, 200);
    assert.equal((await a.get('/api/lecciones/' + privada)).status, 200);

    // Editar un curso aprobado obliga a una nueva revisión.
    const editado = await inst.put(`/api/instructor/cursos/${cursoId}`, {
      titulo: 'Curso público de pruebas E2E', resumen: 'Resumen actualizado del curso público', descripcion: 'Descripción suficientemente larga para pasar la validación del curso aprobado.',
      categoria_id: catId, precio: 30, nivel: 'intermedio', idioma: 'Español'
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.data.estado, 'pendiente');
  });

  await t.test('un cliente inscrito conserva el acceso si el curso vuelve a revisión', async () => {
    const { inst } = await instructorVerificado(base, 'profe-revision@test.com');
    const cursoId = await crearCurso(inst, catId, { titulo: 'Curso comprado que vuelve a revisión', precio: 40 });
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Contenido' });
    const leccion = await crearLeccionYoutube(inst, sec.data.id, { titulo: 'Lección comprada' });
    await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);

    const a = await admin(base);
    assert.equal((await a.post(`/api/admin/cursos/${cursoId}/aprobar`)).status, 200);

    const cliente = await registrarCliente(base, 'inscrito@test.com');
    const me = await cliente.get('/api/auth/me');
    db.prepare('INSERT INTO inscripciones(cliente_id,curso_id) VALUES(?,?)').run(me.data.id, cursoId);

    // Con el curso aprobado e inscripción, el acceso es correcto.
    assert.equal((await cliente.get('/api/lecciones/' + leccion)).status, 200);

    // El instructor edita el curso y vuelve a revisión.
    const editado = await inst.put(`/api/instructor/cursos/${cursoId}`, {
      titulo: 'Curso comprado que vuelve a revisión',
      resumen: 'Resumen actualizado para forzar una nueva revisión del curso.',
      descripcion: 'Descripción suficientemente larga para pasar la validación del curso editado.',
      categoria_id: catId, precio: 45, nivel: 'intermedio', idioma: 'Español'
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.data.estado, 'pendiente');

    // El cliente que ya compró conserva el acceso al contenido.
    assert.equal((await cliente.get('/api/lecciones/' + leccion)).status, 200);

    // Un cliente distinto, sin inscripción, no accede mientras está en revisión.
    const otro = await registrarCliente(base, 'no-inscrito@test.com');
    assert.equal((await otro.get('/api/lecciones/' + leccion)).status, 403);
  });

  await t.test('un curso gratuito exige inscripción antes de ver las lecciones', async () => {
    const { inst } = await instructorVerificado(base, 'profe7@test.com');
    const cursoId = await crearCurso(inst, catId, { titulo: 'Curso gratuito de muestra', precio: 0 });
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Gratis' });
    const leccion = await crearLeccionYoutube(inst, sec.data.id, { titulo: 'Lección gratuita' });
    await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    const a = await admin(base);
    await a.post(`/api/admin/cursos/${cursoId}/aprobar`);

    const cliente = await registrarCliente(base, 'gratis@test.com');
    // Aunque el curso sea gratuito, primero hay que inscribirse.
    assert.equal((await cliente.get('/api/lecciones/' + leccion)).status, 403);
    const inscripcion = await cliente.post('/api/compras', { curso_ids: [cursoId] });
    assert.equal(inscripcion.status, 201, JSON.stringify(inscripcion.data));
    assert.equal((await cliente.get('/api/lecciones/' + leccion)).status, 200);
  });

  await t.test('subida de video local protegida', async () => {
    const { inst } = await instructorVerificado(base, 'profe8@test.com');
    const cursoId = await crearCurso(inst, catId, { titulo: 'Curso con video local' });
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Videos' });
    const creada = await inst.post(`/api/instructor/secciones/${sec.data.id}/lecciones`, { titulo: 'Lección local', tipo_video: 'archivo' });
    assert.equal(creada.status, 201);

    const fd = new FormData();
    fd.append('video', new Blob([Buffer.from('fake-mp4-content')], { type: 'video/mp4' }), 'demo.mp4');
    const up = await inst.req('POST', `/api/instructor/lecciones/${creada.data.id}/video`, fd);
    assert.equal(up.status, 201, JSON.stringify(up.data));
    assert.equal(up.data.archivo_nombre, 'demo.mp4');

    const leccion = await cursoCompleto(inst, cursoId);
    const l = leccion.secciones[0].lecciones[0];
    assert.equal(l.tipo_video, 'archivo');
    assert.equal(l.archivo_nombre, 'demo.mp4');

    const video = await inst.get(`/api/lecciones/${creada.data.id}/video`);
    assert.equal(video.status, 200);
    assert.equal(video.data, 'fake-mp4-content');

    const anon = client(base);
    assert.equal((await anon.get(`/api/lecciones/${creada.data.id}/video`)).status, 403);

    // Formato no permitido
    const fd2 = new FormData();
    fd2.append('video', new Blob([Buffer.from('texto')], { type: 'text/plain' }), 'nota.txt');
    const bad = await inst.req('POST', `/api/instructor/lecciones/${creada.data.id}/video`, fd2);
    assert.equal(bad.status, 400);

    // Con el video subido, el curso ya puede enviarse.
    const envio = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
    assert.equal(envio.status, 200);
  });

  await t.test('eliminar cursos y secciones', async () => {
    const { inst } = await instructorVerificado(base, 'profe9@test.com');
    const cursoId = await crearCurso(inst, catId);
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Temporal' });
    await crearLeccionYoutube(inst, sec.data.id);

    assert.equal((await inst.del(`/api/instructor/secciones/${sec.data.id}`)).status, 200);
    let curso = await cursoCompleto(inst, cursoId);
    assert.equal(curso.secciones.length, 0);

    assert.equal((await inst.del(`/api/instructor/cursos/${cursoId}`)).status, 200);
    assert.equal((await inst.get(`/api/instructor/cursos/${cursoId}`)).status, 404);
  });
});
