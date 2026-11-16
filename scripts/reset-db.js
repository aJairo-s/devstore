#!/usr/bin/env node
// Recrea la base de datos con el catálogo, los usuarios y la comunidad demo.
// Uso: npm run db:reset
const fs = require('fs');
const { DB_PATH } = require('../src/config');

if (DB_PATH === ':memory:') {
  console.log('DB_PATH es :memory:, no hay archivo que borrar.');
} else {
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log('Eliminado:', f);
    }
  }
}

const { db } = require('../src/db');
const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('Base de datos creada en:', DB_PATH);
console.log('Tablas:', tablas.map(t => t.name).join(', '));
console.log('Usuarios:', db.prepare('SELECT COUNT(*) n FROM usuarios').get().n);
console.log('Cursos:', db.prepare('SELECT COUNT(*) n FROM cursos').get().n);
console.log('\nCredenciales demo:');
console.log('  admin@devstore.com / Admin123!');
console.log('  ana@devstore.com / Demo1234! (instructora verificada)');
console.log('  diego@devstore.com / Demo1234! (instructor verificado)');
console.log('  elena@devstore.com / Demo1234! (instructora pendiente)');
console.log('  carla@devstore.com / Demo1234! (cliente con cursos)');
