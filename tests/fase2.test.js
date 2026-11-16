const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const {
  start, client, db, registrarCliente, registrarInstructor, admin,
  categoriaId, verificarInstructor, crearCurso, cursoCompleto, crearLeccionYoutube
} = require('./helpers');

function conectarWS(base, cookie) {
  const url = base.replace(/^http/, 'ws') + '/api/realtime';
  const ws = new WebSocket(url, { headers: { cookie } });
  const eventos = [];
  const esperas = [];
  let listo = false;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    eventos.push(msg);
    for (let i = esperas.length - 1; i >= 0; i--) {
      if (esperas[i].pred(msg)) {
        const e = esperas.splice(i, 1)[0];
        clearTimeout(e.timer);
        e.resolve(msg);
      }
    }
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando ready de WebSocket')), 4000);
    ws.on('error', err => { clearTimeout(timer); reject(err); });
    ws.on('unexpected-response', () => { clearTimeout(timer); reject(new Error('WebSocket rechazado')); });
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ready' && !listo) { listo = true; clearTimeout(timer); resolve(msg); }
      } catch {}
    });
  });

  return {
    ws,
    eventos,
    ready,
    limpiar() { eventos.length = 0; },
    esperar(pred, ms = 4000) {
      const existente = eventos.find(pred);
      if (existente) return Promise.resolve(existente);
      return new Promise((resolve, reject) => {
        const item = {
          pred,
          resolve,
          timer: setTimeout(() => {
            const i = esperas.indexOf(item);
            if (i >= 0) esperas.splice(i, 1);
            reject(new Error('timeout esperando evento WebSocket'));
          }, ms)
        };
        esperas.push(item);
      });
    },
    cerrar() { try { ws.close(); } catch {} },
    terminar() { try { ws.terminate(); } catch {} }
  };
}

async function cursoPublicado(base, inst, catId, extra = {}) {
  const cursoId = await crearCurso(inst, catId, extra);
  const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Contenido' });
  const leccion = await crearLeccionYoutube(inst, sec.data.id, { titulo: 'Lección de prueba' });
  const envio = await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);
  assert.equal(envio.status, 200);
  const a = await admin(base);
  const aprobado = await a.post(`/api/admin/cursos/${cursoId}/aprobar`);
  assert.equal(aprobado.status, 200);
  const completo = await cursoCompleto(inst, cursoId);
  return { cursoId, slug: completo.slug, leccion };
}

test('Fase 2: compras, notificaciones, analítica, foro y mensajería', async t => {
  const { base, close } = await start();
  const catId = await categoriaId(base, 'backend');

  const instructor = await registrarInstructor(base, 'profesora-f2@test.com', { nombre: 'Profe', apellidos: 'Fase Dos' });
  const meInst = await instructor.get('/api/auth/me');
  const instructorId = meInst.data.id;
  const a = await admin(base);
  await verificarInstructor(a, instructorId);

  const { cursoId, slug, leccion } = await cursoPublicado(base, instructor, catId, {
    titulo: 'Curso Fase 2 de pruebas', precio: 25
  });

  const comprador = await registrarCliente(base, 'compradora-f2@test.com', { nombre: 'Compradora', apellidos: 'Privada' });
  const otro = await registrarCliente(base, 'otro-f2@test.com', { nombre: 'Otra', apellidos: 'Persona' });
  const meComprador = await comprador.get('/api/auth/me');

  let wsInst = null;
  let wsComprador = null;
  t.after(async () => {
    wsInst?.terminar();
    wsComprador?.terminar();
    await close();
  });

  await t.test('compra simulada, inscripción y privacidad de la compra', async () => {
    wsInst = conectarWS(base, instructor.cookie);
    await wsInst.ready;
    wsInst.limpiar();

    const metodos = await comprador.get('/api/metodos-pago');
    assert.equal(metodos.status, 200);
    assert.ok(metodos.data.length >= 1);
    const tarjeta = metodos.data.find(m => m.slug === 'tarjeta') || metodos.data[0];

    const compra = await comprador.post('/api/compras', {
      curso_ids: [cursoId], metodo_pago_id: tarjeta.id
    });
    assert.equal(compra.status, 201, JSON.stringify(compra.data));
    assert.equal(compra.data.estado, 'pagada');
    assert.equal(compra.data.total, 25);
    assert.equal(compra.data.metodo_pago, tarjeta.nombre);
    assert.equal(compra.data.items.length, 1);
    assert.equal(compra.data.items[0].curso_id, cursoId);

    // La inscripción da acceso al contenido privado.
    assert.equal((await comprador.get('/api/lecciones/' + leccion)).status, 200);
    assert.equal((await comprador.get('/api/mis-cursos')).data.some(c => c.id === cursoId), true);

    // Compra duplicada y curso no publicado.
    const duplicada = await comprador.post('/api/compras', { curso_ids: [cursoId], metodo_pago_id: tarjeta.id });
    assert.equal(duplicada.status, 409);

    const borrador = await crearCurso(instructor, catId, { titulo: 'Curso todavía en borrador' });
    const noPublicado = await comprador.post('/api/compras', { curso_ids: [borrador], metodo_pago_id: tarjeta.id });
    assert.equal(noPublicado.status, 409);

    // Solo el comprador (o administración) puede consultar la compra.
    assert.equal((await comprador.get('/api/compras/' + compra.data.id)).status, 200);
    assert.equal((await otro.get('/api/compras/' + compra.data.id)).status, 403);
    assert.equal((await instructor.get('/api/compras/' + compra.data.id)).status, 403);
    assert.equal((await a.get('/api/compras/' + compra.data.id)).status, 200);

    // El instructor recibe el aviso de venta por WebSocket y en su bandeja.
    const evento = await wsInst.esperar(m => m.type === 'notificacion' && m.notificacion?.tipo === 'venta');
    assert.equal(evento.notificacion.tipo, 'venta');
    assert.doesNotMatch(evento.notificacion.mensaje, /Compradora/);
    assert.doesNotMatch(evento.notificacion.mensaje, /compradora-f2@test\.com/);

    const bandeja = await instructor.get('/api/notificaciones');
    assert.equal(bandeja.status, 200);
    assert.ok(bandeja.data.items.some(n => n.tipo === 'venta'));
    assert.ok(bandeja.data.no_leidas >= 1);

    const bandejaCliente = await comprador.get('/api/notificaciones');
    assert.ok(bandejaCliente.data.items.some(n => n.tipo === 'compra'));

    // Marcar leída y marcar todas.
    const notif = bandeja.data.items.find(n => n.tipo === 'venta' && !n.leida);
    assert.ok(notif);
    const leida = await instructor.post(`/api/notificaciones/${notif.id}/leer`);
    assert.equal(leida.status, 200);
    const todas = await instructor.post('/api/notificaciones/leer-todas');
    assert.equal(todas.status, 200);
    assert.equal((await instructor.get('/api/notificaciones/resumen')).data.no_leidas, 0);
  });

  await t.test('analítica agregada y solo para el instructor', async () => {
    const r = await instructor.get('/api/instructor/analitica');
    assert.equal(r.status, 200);
    assert.equal(r.data.resumen.ventas, 1);
    assert.equal(r.data.resumen.ingresos, 25);
    assert.equal(r.data.resumen.estudiantes, 1);
    assert.equal(r.data.serie.length, 6);
    assert.ok(r.data.serie.some(m => m.ventas === 1 && m.ingresos === 25));
    assert.ok(r.data.por_curso.some(c => c.id === cursoId && c.ventas === 1));
    assert.ok(r.data.por_metodo.some(m => m.ventas === 1));
    assert.ok(r.data.recientes.length >= 1);

    // No expone identidad ni datos del comprador.
    const serializado = JSON.stringify(r.data);
    assert.doesNotMatch(serializado, /Compradora/);
    assert.doesNotMatch(serializado, /compradora-f2@test\.com/);
    assert.doesNotMatch(serializado, /cliente_id/);
    assert.doesNotMatch(serializado, /cliente_email/);

    assert.equal((await comprador.get('/api/instructor/analitica')).status, 403);
    assert.equal((await a.get('/api/instructor/analitica')).status, 403);

    // Otro instructor solo ve sus propias métricas (vacías).
    const otroInst = await registrarInstructor(base, 'otro-profesor-f2@test.com');
    const otras = await otroInst.get('/api/instructor/analitica');
    assert.equal(otras.status, 200);
    assert.equal(otras.data.resumen.ventas, 0);
    assert.equal(otras.data.resumen.ingresos, 0);
  });

  await t.test('foro restringido a participantes y moderación', async () => {
    // Sin sesión no se puede leer el foro.
    assert.equal((await client(base).get(`/api/cursos/${slug}/foro`)).status, 401);
    // Un cliente sin inscripción tampoco.
    assert.equal((await otro.get(`/api/cursos/${slug}/foro`)).status, 403);

    const antes = await comprador.get('/api/notificaciones/resumen');

    const creado = await comprador.post(`/api/cursos/${slug}/foro`, {
      titulo: '¿Cómo organizo el proyecto final?',
      contenido: 'Terminé el módulo 2 y quiero saber si el proyecto puede ser una API pequeña.'
    });
    assert.equal(creado.status, 201, JSON.stringify(creado.data));
    const hiloId = creado.data.hilo.id;

    const despues = await comprador.get('/api/notificaciones/resumen');
    // La notificación va al instructor, no al autor.
    assert.equal(despues.data.no_leidas, antes.data.no_leidas);

    const bandeja = await instructor.get('/api/notificaciones');
    assert.ok(bandeja.data.items.some(n => n.tipo === 'foro' && /Nueva pregunta/.test(n.titulo)));

    const foro = await comprador.get(`/api/cursos/${slug}/foro`);
    assert.equal(foro.status, 200);
    assert.equal(foro.data.puede_moderar, false);
    assert.ok(foro.data.hilos.some(h => h.id === hiloId));

    const mod = await instructor.get(`/api/cursos/${slug}/foro`);
    assert.equal(mod.data.puede_moderar, true);

    const respuesta = await instructor.post(`/api/foro/hilos/${hiloId}/respuestas`, {
      contenido: 'Sí, una API pequeña con dos o tres endpoints es perfecta para cerrar el módulo.'
    });
    assert.equal(respuesta.status, 201);

    const respuestaCliente = await comprador.post(`/api/foro/hilos/${hiloId}/respuestas`, {
      contenido: 'Gracias, entonces la hago con Express y SQLite.'
    });
    assert.equal(respuestaCliente.status, 201);

    const detalle = await comprador.get('/api/foro/hilos/' + hiloId);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.data.respuestas.length, 2);
    assert.equal(detalle.data.puede_moderar, false);

    // Moderación exclusiva del instructor/administración.
    assert.equal((await comprador.post(`/api/foro/hilos/${hiloId}/cerrar`, { valor: true })).status, 403);
    const cerrado = await instructor.post(`/api/foro/hilos/${hiloId}/cerrar`, { valor: true });
    assert.equal(cerrado.status, 200);
    assert.equal(cerrado.data.cerrado, true);
    assert.equal((await comprador.post(`/api/foro/hilos/${hiloId}/respuestas`, { contenido: 'Otra respuesta' })).status, 409);
    assert.equal((await instructor.post(`/api/foro/hilos/${hiloId}/respuestas`, { contenido: 'Aclaración final del instructor.' })).status, 201);

    const fijado = await instructor.post(`/api/foro/hilos/${hiloId}/fijar`, { valor: true });
    assert.equal(fijado.status, 200);
    assert.equal(fijado.data.fijado, true);

    // Un no participante no puede leer el hilo ni responder.
    assert.equal((await otro.get('/api/foro/hilos/' + hiloId)).status, 403);

    // El autor puede borrar su respuesta; el instructor puede borrar el hilo.
    assert.equal((await comprador.del('/api/foro/respuestas/' + respuestaCliente.data.respuesta.id)).status, 200);
    assert.equal((await instructor.del('/api/foro/hilos/' + hiloId)).status, 200);
    assert.equal((await comprador.get('/api/foro/hilos/' + hiloId)).status, 404);
  });

  await t.test('mensajería directa en tiempo real', async () => {
    const otra = await comprador.post('/api/mensajes/conversaciones', { usuario_id: instructorId });
    assert.equal(otra.status, 201);
    assert.equal(otra.data.otro.id, instructorId);
    const convId = otra.data.id;

    // Es idempotente: reutiliza la conversación existente.
    const repetida = await comprador.post('/api/mensajes/conversaciones', { usuario_id: instructorId });
    assert.equal(repetida.status, 201);
    assert.equal(repetida.data.id, convId);

    assert.equal((await comprador.post('/api/mensajes/conversaciones', {
      usuario_id: meComprador.data.id
    })).status, 400);
    assert.equal((await comprador.post('/api/mensajes/conversaciones', {
      usuario_id: 999999
    })).status, 404);

    wsComprador = conectarWS(base, comprador.cookie);
    await wsComprador.ready;
    wsComprador.limpiar();

    const enviado = await instructor.post(`/api/mensajes/conversaciones/${convId}`, {
      contenido: 'Hola, bienvenida al curso. ¿Tienes alguna duda con el proyecto?'
    });
    assert.equal(enviado.status, 201, JSON.stringify(enviado.data));
    assert.equal(enviado.data.mensaje.emisor_id, instructorId);

    const evento = await wsComprador.esperar(m => m.type === 'mensaje' && m.mensaje?.id === enviado.data.mensaje.id);
    assert.equal(evento.propio, false);
    assert.equal(evento.conversacion_id, convId);

    // El receptor tiene un mensaje sin leer y una notificación de tipo mensaje.
    assert.equal((await comprador.get('/api/mensajes/no-leidos')).data.no_leidos, 1);
    const lista = await comprador.get('/api/mensajes/conversaciones');
    assert.equal(lista.status, 200);
    const conv = lista.data.find(c => c.id === convId);
    assert.ok(conv);
    assert.equal(conv.otro.id, instructorId);
    assert.equal(conv.no_leidos, 1);
    assert.match(conv.ultimo_mensaje, /bienvenida/);
    const notifs = await comprador.get('/api/notificaciones');
    assert.ok(notifs.data.items.some(n => n.tipo === 'mensaje'));

    const detalle = await comprador.get(`/api/mensajes/conversaciones/${convId}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.data.mensajes.length, 1);
    assert.equal(detalle.data.marcados, 1);
    assert.equal((await comprador.get('/api/mensajes/no-leidos')).data.no_leidos, 0);

    // El emisor también puede responder; el receptor no participante no.
    const respuesta = await comprador.post(`/api/mensajes/conversaciones/${convId}`, {
      contenido: 'Gracias, por ahora todo claro. Te escribo si me bloqueo.'
    });
    assert.equal(respuesta.status, 201);
    assert.equal((await otro.get(`/api/mensajes/conversaciones/${convId}`)).status, 403);
    assert.equal((await otro.post(`/api/mensajes/conversaciones/${convId}`, { contenido: 'Intruso' })).status, 403);

    // Validaciones y búsqueda de contactos.
    assert.equal((await comprador.post(`/api/mensajes/conversaciones/${convId}`, { contenido: '   ' })).status, 400);
    assert.equal((await comprador.post(`/api/mensajes/conversaciones/${convId}`, { contenido: 'x'.repeat(2001) })).status, 400);
    const contactos = await comprador.get('/api/mensajes/contactos?q=Profe');
    assert.equal(contactos.status, 200);
    assert.ok(contactos.data.some(c => c.id === instructorId && c.rol === 'instructor'));
  });
});
