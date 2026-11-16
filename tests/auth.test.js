const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, client, registrarCliente, registrarInstructor, login, admin,
  datosCliente, datosInstructor, PASS
} = require('./helpers');

test('auth y registros', async t => {
  const { base, close } = await start();
  t.after(close);

  await t.test('health responde y la base está limpia de demos', async () => {
    const c = client(base);
    const r = await c.get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.equal(r.data.users, 1); // solo el administrador base
    assert.equal(r.data.cursos, 0);
  });

  await t.test('el catálogo público está vacío pero responde', async () => {
    const c = client(base);
    const r = await c.get('/api/cursos');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, []);
    const cats = await c.get('/api/categorias');
    assert.equal(cats.status, 200);
    assert.ok(cats.data.length >= 10);
  });

  await t.test('registro de cliente exige perfil extendido y términos', async () => {
    const c = client(base);
    const sinTelefono = await c.post('/api/auth/registro/cliente', datosCliente('a@test.com', { telefono: '' }));
    assert.equal(sinTelefono.status, 400);

    const sinAreas = await c.post('/api/auth/registro/cliente', datosCliente('b@test.com', { areas_interes: [] }));
    assert.equal(sinAreas.status, 400);

    const sinTerminos = await c.post('/api/auth/registro/cliente', datosCliente('c@test.com', { acepta_terminos: false }));
    assert.equal(sinTerminos.status, 400);

    const passCorta = await c.post('/api/auth/registro/cliente', datosCliente('d@test.com', { password: 'corta' }));
    assert.equal(passCorta.status, 400);
  });

  await t.test('registro de cliente correcto crea sesión y perfil', async () => {
    const c = await registrarCliente(base, 'cliente1@test.com');
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.rol, 'cliente');
    assert.equal(me.data.perfil.telefono, '+34 600 000 000');
    assert.deepEqual(me.data.perfil.areas_interes, ['frontend', 'backend']);
    assert.equal(me.data.password_hash, undefined);
  });

  await t.test('email duplicado devuelve 409', async () => {
    const c = client(base);
    const r = await c.post('/api/auth/registro/cliente', datosCliente('cliente1@test.com'));
    assert.equal(r.status, 409);
  });

  await t.test('registro de instructor exige evidencia', async () => {
    const c = client(base);
    const sinEvidencia = await c.post('/api/auth/registro/instructor', datosInstructor('inst0@test.com', {
      github_url: '', credenciales: '', portafolio_url: ''
    }));
    assert.equal(sinEvidencia.status, 400);

    const bioCorta = await c.post('/api/auth/registro/instructor', datosInstructor('inst00@test.com', { biografia: 'corta' }));
    assert.equal(bioCorta.status, 400);

    const urlMala = await c.post('/api/auth/registro/instructor', datosInstructor('inst01@test.com', { github_url: 'no-es-url' }));
    assert.equal(urlMala.status, 400);
  });

  await t.test('registro de instructor queda pendiente de verificación', async () => {
    const c = await registrarInstructor(base, 'inst1@test.com');
    const me = await c.get('/api/auth/me');
    assert.equal(me.data.rol, 'instructor');
    assert.equal(me.data.perfil.estado_verificacion, 'pendiente');
  });

  await t.test('login válido, inválido y sesión', async () => {
    const malo = client(base);
    const r = await malo.post('/api/auth/login', { email: 'cliente1@test.com', password: 'incorrecta' });
    assert.equal(r.status, 401);

    const c = await login(base, 'cliente1@test.com', PASS);
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.email, 'cliente1@test.com');

    const out = await c.post('/api/auth/logout');
    assert.equal(out.status, 200);
    const after = await c.get('/api/auth/me');
    assert.equal(after.status, 401);
  });

  await t.test('administrador base puede iniciar sesión', async () => {
    const a = await admin(base);
    const me = await a.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.rol, 'administrador');
  });

  await t.test('actualización de perfil de cliente', async () => {
    const c = await login(base, 'cliente1@test.com', PASS);
    const r = await c.put('/api/perfil', {
      nombre: 'Cliente',
      apellidos: 'Actualizado',
      email: 'cliente1@test.com',
      telefono: '+34 611 111 111',
      pais: 'España',
      ciudad: 'Valencia',
      nivel_experiencia: 'intermedio',
      areas_interes: ['datos-ia']
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const me = await c.get('/api/auth/me');
    assert.equal(me.data.apellidos, 'Actualizado');
    assert.equal(me.data.perfil.nivel_experiencia, 'intermedio');
    assert.deepEqual(me.data.perfil.areas_interes, ['datos-ia']);
  });

  await t.test('cambio de contraseña requiere la actual', async () => {
    const c = await login(base, 'cliente1@test.com', PASS);
    const malo = await c.put('/api/perfil', {
      nombre: 'Cliente', apellidos: 'Actualizado', email: 'cliente1@test.com',
      telefono: '+34 611 111 111', pais: 'España', nivel_experiencia: 'intermedio',
      areas_interes: ['datos-ia'], password: 'NuevaClave123!', password_actual: 'incorrecta'
    });
    assert.equal(malo.status, 400);
  });

  await t.test('RBAC: sin sesión no se accede a rutas privadas', async () => {
    const c = client(base);
    assert.equal((await c.get('/api/instructor/resumen')).status, 401);
    assert.equal((await c.get('/api/admin/resumen')).status, 401);
    assert.equal((await c.get('/api/mis-cursos')).status, 401);
  });
});
