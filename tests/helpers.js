// Utilidades compartidas por las pruebas de las Fases 1 y 2.
// Debe importarse antes que el servidor para que la configuración use la BD efímera.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = ':memory:';
process.env.SEED_DEMO = 'false';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'devstore-test-'));
process.env.SECRET = 'test-secret';

const app = require('../server');
const { db } = require('../src/db');
const { limpiarRateLimit } = require('../src/middleware/rateLimit');

async function start() {
  limpiarRateLimit();
  const server = app.createServer();
  server.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    server,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function client(base) {
  let cookie = '';
  async function req(method, url, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers, body: payload });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookies.length) cookie = setCookies.map(c => c.split(';')[0]).join('; ');
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');
    return { status: res.status, data, headers: res.headers };
  }
  return {
    req,
    get: url => req('GET', url),
    post: (url, body) => req('POST', url, body),
    put: (url, body) => req('PUT', url, body),
    del: url => req('DELETE', url),
    get cookie() { return cookie; }
  };
}

const PASS = 'Secreta123!';

const datosCliente = (email, extra = {}) => ({
  nombre: 'Test',
  apellidos: 'Cliente',
  email,
  password: PASS,
  telefono: '+34 600 000 000',
  pais: 'España',
  ciudad: 'Madrid',
  nivel_experiencia: 'principiante',
  areas_interes: ['frontend', 'backend'],
  acepta_terminos: true,
  ...extra
});

const datosInstructor = (email, extra = {}) => ({
  nombre: 'Test',
  apellidos: 'Instructor',
  email,
  password: PASS,
  titular: 'Desarrollador full-stack',
  biografia: 'Desarrollador con experiencia construyendo aplicaciones web y APIs en producción, y formando equipos.',
  especialidad: 'Node.js y bases de datos',
  anios_experiencia: 6,
  pais: 'España',
  github_url: 'https://github.com/test-instructor',
  acepta_terminos: true,
  ...extra
});

async function registrarCliente(base, email, extra) {
  const c = client(base);
  const r = await c.post('/api/auth/registro/cliente', datosCliente(email, extra));
  if (r.status !== 201) throw new Error(`registro cliente ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}

async function registrarInstructor(base, email, extra) {
  const c = client(base);
  const r = await c.post('/api/auth/registro/instructor', datosInstructor(email, extra));
  if (r.status !== 201) throw new Error(`registro instructor ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}

async function login(base, email, password) {
  const c = client(base);
  const r = await c.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}

async function admin(base) {
  return login(base, 'admin@devstore.com', 'Admin123!');
}

async function categoriaId(base, slug = 'frontend') {
  const c = client(base);
  const r = await c.get('/api/categorias');
  const cat = r.data.find(x => x.slug === slug);
  if (!cat) throw new Error(`categoría ${slug} no encontrada`);
  return cat.id;
}

async function verificarInstructor(adminClient, instructorId) {
  const r = await adminClient.post(`/api/admin/instructores/${instructorId}/verificar`);
  if (r.status !== 200) throw new Error(`verificar instructor: ${r.status} ${JSON.stringify(r.data)}`);
  return r;
}

async function crearCurso(instructorClient, catId, extra = {}) {
  const r = await instructorClient.post('/api/instructor/cursos', {
    titulo: 'Curso de prueba de Node.js',
    categoria_id: catId,
    ...extra
  });
  if (r.status !== 201) throw new Error(`crear curso: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.id;
}

async function cursoCompleto(instructorClient, cursoId) {
  return (await instructorClient.get(`/api/instructor/cursos/${cursoId}`)).data;
}

async function crearLeccionYoutube(instructorClient, seccionId, extra = {}) {
  const r = await instructorClient.post(`/api/instructor/secciones/${seccionId}/lecciones`, {
    titulo: 'Lección de prueba',
    descripcion: 'Descripción de la lección',
    tipo_video: 'youtube',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duracion_seg: 600,
    ...extra
  });
  if (r.status !== 201) throw new Error(`crear lección: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.id;
}

module.exports = {
  app, db, start, client, PASS,
  datosCliente, datosInstructor,
  registrarCliente, registrarInstructor, login, admin,
  categoriaId, verificarInstructor, crearCurso, cursoCompleto, crearLeccionYoutube
};
