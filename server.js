const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

// Ruta absoluta y directorio garantizado (p. ej. /var/data con un disco en Render).
// ':memory:' se mantiene tal cual para los tests.
const DB_PATH = process.env.DB_PATH === ':memory:'
  ? ':memory:'
  : path.resolve(process.env.DB_PATH || 'devstore.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS usuarios(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('cliente','vendedor','instructor','administrador')),
  creado TEXT DEFAULT CURRENT_TIMESTAMP)`);

if (!db.prepare("SELECT 1 FROM usuarios WHERE rol='administrador'").get())
  db.prepare('INSERT INTO usuarios(nombre,email,password_hash,rol) VALUES(?,?,?,?)')
    .run('Admin', 'admin@devstore.com', bcrypt.hashSync('Admin123!', 10), 'administrador');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SECRET || 'cambiar-en-produccion',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 2 }
}));

// Diagnóstico de despliegue (sin datos sensibles): permite ver si la DB
// existe, si se puede escribir y cuántos usuarios hay.
app.get('/api/health', (req, res) => {
  try {
    const users = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
    let writable = true;
    try { db.exec('CREATE TABLE IF NOT EXISTS __health_probe(x INTEGER); DROP TABLE __health_probe;'); }
    catch { writable = false; }
    res.json({ ok: true, db: DB_PATH, writable, users, node: process.version });
  } catch (err) {
    console.error('Health check falló:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const ROLES = ['cliente', 'vendedor', 'instructor', 'administrador'];
const PUBLICOS = ['cliente', 'vendedor', 'instructor'];
const COLS = 'id,nombre,email,rol,creado';
const emailOk = e => typeof e === 'string' && /^\S+@\S+\.\S+$/.test(e);
const passOk = p => typeof p === 'string' && p.length >= 8;

const auth = (req, res, next) =>
  req.session.uid ? next() : res.status(401).json({ error: 'No autenticado' });
const rol = (...r) => (req, res, next) =>
  r.includes(req.session.rol) ? next() : res.status(403).json({ error: 'Sin permisos' });

// RF01 Registro (solo roles públicos)
app.post('/api/registro', (req, res) => {
  const { nombre, email, password, rol: r } = req.body;
  if (!nombre || !emailOk(email) || !passOk(password) || !PUBLICOS.includes(r))
    return res.status(400).json({ error: 'Datos inválidos (password mínimo 8 caracteres)' });
  try {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO usuarios(nombre,email,password_hash,rol) VALUES(?,?,?,?)')
      .run(nombre.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), r);
    res.status(201).json({ id: lastInsertRowid });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'El email ya existe' });
    console.error('Error de base de datos al guardar usuario:', err);
    res.status(500).json({ error: 'Error interno al guardar el usuario' });
  }
});

// RF02 Login / Logout
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get((email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  req.session.regenerate(() => {
    req.session.uid = u.id; req.session.rol = u.rol;
    res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });
  });
});
app.post('/api/logout', (req, res) =>
  req.session.destroy(() => res.clearCookie('connect.sid').json({ ok: true })));

// RF03 Perfil propio
app.get('/api/me', auth, (req, res) =>
  res.json(db.prepare(`SELECT ${COLS} FROM usuarios WHERE id=?`).get(req.session.uid)));
app.put('/api/me', auth, (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !emailOk(email) || (password && !passOk(password)))
    return res.status(400).json({ error: 'Datos inválidos' });
  try {
    db.prepare('UPDATE usuarios SET nombre=?,email=? WHERE id=?')
      .run(nombre.trim(), email.toLowerCase(), req.session.uid);
    if (password) db.prepare('UPDATE usuarios SET password_hash=? WHERE id=?')
      .run(bcrypt.hashSync(password, 10), req.session.uid);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'El email ya existe' });
    console.error('Error de base de datos al guardar usuario:', err);
    res.status(500).json({ error: 'Error interno al guardar el usuario' });
  }
});

// RF15 CRUD completo de usuarios (solo administrador)
const admin = [auth, rol('administrador')];
app.get('/api/usuarios', admin, (req, res) =>
  res.json(db.prepare(`SELECT ${COLS} FROM usuarios ORDER BY id`).all()));
app.post('/api/usuarios', admin, (req, res) => {
  const { nombre, email, password, rol: r } = req.body;
  if (!nombre || !emailOk(email) || !passOk(password) || !ROLES.includes(r))
    return res.status(400).json({ error: 'Datos inválidos' });
  try {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO usuarios(nombre,email,password_hash,rol) VALUES(?,?,?,?)')
      .run(nombre.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), r);
    res.status(201).json({ id: lastInsertRowid });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'El email ya existe' });
    console.error('Error de base de datos al guardar usuario:', err);
    res.status(500).json({ error: 'Error interno al guardar el usuario' });
  }
});
app.put('/api/usuarios/:id', admin, (req, res) => {
  const { nombre, email, password, rol: r } = req.body;
  if (!nombre || !emailOk(email) || !ROLES.includes(r) || (password && !passOk(password)))
    return res.status(400).json({ error: 'Datos inválidos' });
  try {
    db.prepare('UPDATE usuarios SET nombre=?,email=?,rol=? WHERE id=?')
      .run(nombre.trim(), email.toLowerCase(), r, req.params.id);
    if (password) db.prepare('UPDATE usuarios SET password_hash=? WHERE id=?')
      .run(bcrypt.hashSync(password, 10), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'El email ya existe' });
    console.error('Error de base de datos al guardar usuario:', err);
    res.status(500).json({ error: 'Error interno al guardar el usuario' });
  }
});
app.delete('/api/usuarios/:id', admin, (req, res) => {
  if (+req.params.id === req.session.uid)
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  db.prepare('DELETE FROM usuarios WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Sprint 2: Gestión de productos/servicios =====
require('./productos')(app, db, auth, rol);
// ===== Sprint 3: Ecommerce, Cobros, Distribución y Almacén =====
require('./pedidos')(app, db, auth, rol);
require('./almacen')(app, db, auth, rol);

const PORT = process.env.PORT || 3000;
if (require.main === module)
  app.listen(PORT, () => console.log(`DevStore escuchando en el puerto ${PORT} · DB: ${DB_PATH}`));
module.exports = app;
