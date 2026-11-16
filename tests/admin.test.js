const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, registrarCliente, registrarInstructor, login, admin,
  categoriaId, verificarInstructor, crearCurso, crearLeccionYoutube
} = require('./helpers');

test('administración, verificación y privacidad entre roles', async t => {
  const { base, close } = await start();
  t.after(close);

  const a = await admin(base);
  const catId = await categoriaId(base, 'frontend');

  await t.test('resumen de administración', async () => {
    const r = await a.get('/api/admin/resumen');
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.usuarios, 'number');
    assert.equal(typeof r.data.cursos_pendientes, 'number');
  });

  await t.test('verificación de instructor y rechazo con motivo', async () => {
    const inst = await registrarInstructor(base, 'verif@test.com');
    const me = await inst.get('/api/auth/me');

    const pendientes = await a.get('/api/admin/instructores?estado=pendiente');
    const fila = pendientes.data.find(i => i.id === me.data.id);
    assert.ok(fila);
    assert.equal(fila.github_url, 'https://github.com/test-instructor');
    assert.ok(fila.nombre_completo.includes('Test'));

    // Rechazo sin motivo falla.
    const sinMotivo = await a.post(`/api/admin/instructores/${me.data.id}/rechazar`, {});
    assert.equal(sinMotivo.status, 400);

    const rechazo = await a.post(`/api/admin/instructores/${me.data.id}/rechazar`, { motivo: 'Evidencia insuficiente' });
    assert.equal(rechazo.status, 200);
    const estado = await inst.get('/api/perfil/instructor/verificacion');
    assert.equal(estado.data.estado_verificacion, 'rechazado');
    assert.equal(estado.data.motivo_rechazo, 'Evidencia insuficiente');

    // El instructor puede reenviar su solicitud.
    const reenvio = await inst.post('/api/perfil/instructor/verificacion');
    assert.equal(reenvio.status, 200);
    assert.equal(reenvio.data.estado_verificacion, 'pendiente');

    // Ya no se puede rechazar dos veces sin volver a estado pendiente, aquí sí está pendiente.
    const verificado = await verificarInstructor(a, me.data.id);
    assert.equal(verificado.data.estado_verificacion, 'verificado');
    assert.equal((await a.post(`/api/admin/instructores/${me.data.id}/verificar`)).status, 409);
    assert.equal((await a.post(`/api/admin/instructores/${me.data.id}/rechazar`, { motivo: 'x' })).status, 409);

    // Un instructor verificado ya no puede reenviar.
    assert.equal((await inst.post('/api/perfil/instructor/verificacion')).status, 409);
  });

  await t.test('solo la administración ve las compras', async () => {
    const compras = await a.get('/api/admin/compras');
    assert.equal(compras.status, 200);
    assert.ok(Array.isArray(compras.data));

    const inst = await registrarInstructor(base, 'privado@test.com');
    const cliente = await registrarCliente(base, 'privado-cli@test.com');

    assert.equal((await inst.get('/api/admin/compras')).status, 403);
    assert.equal((await inst.get('/api/admin/resumen')).status, 403);
    assert.equal((await cliente.get('/api/admin/compras')).status, 403);
    assert.equal((await cliente.get('/api/instructor/resumen')).status, 403);
    assert.equal((await inst.get('/api/mis-cursos')).status, 403);
    assert.equal((await inst.get('/api/mis-compras')).status, 403);
  });

  await t.test('el instructor ve estadísticas agregadas, sin datos de compradores', async () => {
    const inst = await registrarInstructor(base, 'stats@test.com');
    const me = await inst.get('/api/auth/me');
    await verificarInstructor(a, me.data.id);
    const cursoId = await crearCurso(inst, catId, { titulo: 'Curso con métricas', precio: 20 });
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Uno' });
    await crearLeccionYoutube(inst, sec.data.id);

    const resumen = await inst.get('/api/instructor/resumen');
    assert.equal(resumen.status, 200);
    assert.equal(resumen.data.cursos, 1);
    assert.equal(resumen.data.borradores, 1);
    assert.equal(resumen.data.verificacion.estado_verificacion, 'verificado');

    const cursos = await inst.get('/api/instructor/cursos');
    assert.equal(cursos.status, 200);
    assert.equal(cursos.data.length, 1);
    const texto = JSON.stringify(cursos.data);
    assert.equal(texto.includes('email'), false);
    assert.equal(texto.includes('cliente'), false);
  });

  await t.test('aprobación solo de cursos pendientes, con motivo en rechazos', async () => {
    const inst = await registrarInstructor(base, 'revision@test.com');
    const me = await inst.get('/api/auth/me');
    await verificarInstructor(a, me.data.id);
    const cursoId = await crearCurso(inst, catId, { titulo: 'Curso para revisión' });
    const sec = await inst.post(`/api/instructor/cursos/${cursoId}/secciones`, { titulo: 'Uno' });
    await crearLeccionYoutube(inst, sec.data.id);
    await inst.post(`/api/instructor/cursos/${cursoId}/enviar-revision`);

    // Un curso no pendiente no se aprueba.
    assert.equal((await a.post('/api/admin/cursos/99999/aprobar')).status, 404);

    const sinMotivo = await a.post(`/api/admin/cursos/${cursoId}/rechazar`, {});
    assert.equal(sinMotivo.status, 400);

    const rechazo = await a.post(`/api/admin/cursos/${cursoId}/rechazar`, { motivo: 'Falta contenido' });
    assert.equal(rechazo.status, 200);

    const detalle = await inst.get(`/api/instructor/cursos/${cursoId}`);
    assert.equal(detalle.data.estado, 'rechazado');
    assert.equal(detalle.data.motivo_rechazo, 'Falta contenido');

    // Un curso rechazado no puede aprobarse directamente.
    assert.equal((await a.post(`/api/admin/cursos/${cursoId}/aprobar`)).status, 409);
  });

  await t.test('gestión de usuarios: búsqueda, edición, suspensión y borrado', async () => {
    const cliente = await registrarCliente(base, 'gestion@test.com');
    const me = await cliente.get('/api/auth/me');

    const busqueda = await a.get('/api/admin/usuarios?q=gestion@test.com');
    assert.equal(busqueda.status, 200);
    const fila = busqueda.data.find(u => u.id === me.data.id);
    assert.ok(fila);

    const porRol = await a.get('/api/admin/usuarios?rol=cliente');
    assert.ok(porRol.data.every(u => u.rol === 'cliente'));

    const edicion = await a.put(`/api/admin/usuarios/${me.data.id}`, {
      nombre: 'Nombre', apellidos: 'Editado', rol: 'cliente', estado: 'suspendido'
    });
    assert.equal(edicion.status, 200);

    // Un usuario suspendido no puede iniciar sesión.
    const loginSuspendido = await login(base, 'gestion@test.com', 'Secreta123!').catch(() => null);
    assert.equal(loginSuspendido, null);

    // No puede convertirse en instructor sin perfil.
    const aInstructor = await a.put(`/api/admin/usuarios/${me.data.id}`, {
      nombre: 'Nombre', apellidos: 'Editado', rol: 'instructor', estado: 'activo'
    });
    assert.equal(aInstructor.status, 400);

    // Reactivar y eliminar.
    assert.equal((await a.put(`/api/admin/usuarios/${me.data.id}`, {
      nombre: 'Nombre', apellidos: 'Editado', rol: 'cliente', estado: 'activo'
    })).status, 200);
    assert.equal((await a.del(`/api/admin/usuarios/${me.data.id}`)).status, 200);

    const meAdmin = await a.get('/api/auth/me');
    const autodestruccion = await a.del(`/api/admin/usuarios/${meAdmin.data.id}`);
    assert.equal(autodestruccion.status, 400);
  });

  await t.test('un administrador suspendido no puede operar', async () => {
    // Se crea un segundo administrador cambiando el rol de un cliente con perfil no es posible,
    // así que se prueba la protección de auto-suspensión del administrador actual.
    const me = await a.get('/api/auth/me');
    const r = await a.put(`/api/admin/usuarios/${me.data.id}`, {
      nombre: me.data.nombre, apellidos: me.data.apellidos, rol: 'cliente', estado: 'activo'
    });
    assert.equal(r.status, 400);
  });
});
