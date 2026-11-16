const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DB_PATH } = require('../config');
const { seed, sembrarCobrosDemo } = require('./seed');

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
if (DB_PATH !== ':memory:') db.pragma('journal_mode = WAL');

function tablas() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
}

function esEsquemaLegacy() {
  const existentes = tablas();
  if (existentes.includes('productos') || existentes.includes('pedidos') || existentes.includes('movimientos')) return true;
  if (!existentes.includes('usuarios')) return false;
  const columnas = db.prepare('PRAGMA table_info(usuarios)').all().map(c => c.name);
  return !columnas.includes('apellidos');
}

function limpiarLegacy() {
  console.warn('[db] Esquema anterior detectado. Se recreará la base de datos actual.');
  const orden = [
    'mensajes', 'conversaciones', 'foro_respuestas', 'foro_hilos', 'notificaciones',
    'pagos', 'inscripciones', 'compra_items', 'compras',
    'curso_lecciones', 'curso_secciones', 'cursos',
    'perfiles_instructor', 'perfiles_cliente', 'metodos_pago', 'categorias',
    'movimientos', 'envios', 'pedido_detalles', 'pedidos', 'productos', 'usuarios'
  ];
  db.pragma('foreign_keys = OFF');
  for (const t of orden) db.exec(`DROP TABLE IF EXISTS ${t}`);
  db.pragma('foreign_keys = ON');
}

if (esEsquemaLegacy()) limpiarLegacy();

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

/**
 * Migración incremental para bases creadas en fases anteriores.
 * `CREATE TABLE IF NOT EXISTS` no añade columnas nuevas, así que se
 * comprueban una a una antes de alterar la tabla.
 */
function asegurarColumnas() {
  const nuevas = {
    perfiles_instructor: {
      pago_banco: 'TEXT',
      pago_titular: 'TEXT',
      pago_cuenta: 'TEXT',
      pago_tipo_cuenta: 'TEXT',
      pago_instrucciones: 'TEXT',
      pago_qr_path: 'TEXT',
      pago_qr_nombre: 'TEXT',
      pago_actualizado: 'TEXT'
    },
    pagos: {
      detalle: 'TEXT',
      verificado_por: 'INTEGER REFERENCES usuarios(id) ON DELETE SET NULL',
      verificado_en: 'TEXT',
      motivo_rechazo: 'TEXT'
    }
  };
  for (const [tabla, columnas] of Object.entries(nuevas)) {
    const existentes = new Set(db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name));
    for (const [columna, tipo] of Object.entries(columnas)) {
      if (!existentes.has(columna)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }
  db.pragma('user_version = 4');
}

asegurarColumnas();
seed(db);
sembrarCobrosDemo(db);

module.exports = { db, DB_PATH };
