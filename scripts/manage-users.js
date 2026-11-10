#!/usr/bin/env node
// Gestión de usuarios directamente sobre la base de datos.
// Sirve para crear o restablecer usuarios que viajan como snapshot en el repo
// (útil en Render, donde el disco es efímero).
//
// Uso:
//   node scripts/manage-users.js list
//   node scripts/manage-users.js create <nombre> <email> <password> <rol>
//   node scripts/manage-users.js passwd <email> <password>
//   node scripts/manage-users.js delete <email>
//
// Respeta DB_PATH (igual que el servidor).
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const ROLES = ['cliente', 'vendedor', 'instructor', 'administrador'];
const rawPath = process.env.DB_PATH || 'devstore.db';
const dbPath = rawPath === ':memory:' ? rawPath : path.resolve(rawPath);
const db = new Database(dbPath);

const [cmd, ...args] = process.argv.slice(2);
const emailOk = e => typeof e === 'string' && /^\S+@\S+\.\S+$/.test(e);
const passOk = p => typeof p === 'string' && p.length >= 8;
const fail = msg => { console.error('✖ ' + msg); process.exit(1); };

switch (cmd) {
  case 'list': {
    console.table(db.prepare('SELECT id, nombre, email, rol FROM usuarios ORDER BY id').all());
    break;
  }
  case 'create': {
    const [nombre, email, password, rol] = args;
    if (!nombre || !emailOk(email) || !passOk(password) || !ROLES.includes(rol))
      fail('Uso: create <nombre> <email> <password(8+)> <cliente|vendedor|instructor|administrador>');
    try {
      const r = db.prepare('INSERT INTO usuarios(nombre,email,password_hash,rol) VALUES(?,?,?,?)')
        .run(nombre.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), rol);
      console.log(`✔ Usuario creado (id ${r.lastInsertRowid}): ${email}`);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') fail('Ese email ya existe');
      throw err;
    }
    break;
  }
  case 'passwd': {
    const [email, password] = args;
    if (!emailOk(email) || !passOk(password)) fail('Uso: passwd <email> <password(8+)>');
    const r = db.prepare('UPDATE usuarios SET password_hash=? WHERE email=?')
      .run(bcrypt.hashSync(password, 10), email.toLowerCase());
    if (!r.changes) fail('No existe un usuario con ese email');
    console.log(`✔ Contraseña actualizada: ${email}`);
    break;
  }
  case 'delete': {
    const [email] = args;
    if (!emailOk(email)) fail('Uso: delete <email>');
    const r = db.prepare('DELETE FROM usuarios WHERE email=?').run(email.toLowerCase());
    if (!r.changes) fail('No existe un usuario con ese email');
    console.log(`✔ Usuario eliminado: ${email}`);
    break;
  }
  default:
    console.log(`Uso:
  node scripts/manage-users.js list
  node scripts/manage-users.js create <nombre> <email> <password> <rol>
  node scripts/manage-users.js passwd <email> <password>
  node scripts/manage-users.js delete <email>

DB: ${dbPath}`);
    process.exit(cmd ? 1 : 0);
}
