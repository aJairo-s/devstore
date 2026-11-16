const { db } = require('../db');
const { emitir } = require('../realtime');

const TIPOS = ['venta', 'compra', 'foro', 'mensaje', 'sistema', 'verificacion', 'curso'];

function una(id) {
  return db.prepare('SELECT * FROM notificaciones WHERE id=?').get(Number(id));
}

function crearNotificacion(usuarioId, { tipo = 'sistema', titulo, mensaje = '', enlace = null }) {
  if (!TIPOS.includes(tipo)) tipo = 'sistema';
  const r = db.prepare(`INSERT INTO notificaciones(usuario_id,tipo,titulo,mensaje,enlace)
    VALUES(?,?,?,?,?)`)
    .run(Number(usuarioId), tipo, String(titulo || 'Aviso').slice(0, 160),
      String(mensaje || '').slice(0, 1000), enlace ? String(enlace).slice(0, 300) : null);
  const notificacion = una(r.lastInsertRowid);
  emitir([usuarioId], { type: 'notificacion', notificacion });
  return notificacion;
}

function crearVarias(usuarioIds, datos) {
  return [...new Set((usuarioIds || []).map(Number).filter(Number.isInteger))]
    .map(id => crearNotificacion(id, datos));
}

function listarNotificaciones(usuarioId, { limit = 30, soloNoLeidas = false } = {}) {
  const n = Math.min(100, Math.max(1, Number(limit) || 30));
  const where = soloNoLeidas ? 'AND leida=0' : '';
  return db.prepare(`SELECT * FROM notificaciones WHERE usuario_id=? ${where}
    ORDER BY leida ASC, id DESC LIMIT ?`).all(Number(usuarioId), n);
}

function contarNoLeidas(usuarioId) {
  return db.prepare('SELECT COUNT(*) n FROM notificaciones WHERE usuario_id=? AND leida=0')
    .get(Number(usuarioId)).n;
}

function marcarLeida(usuarioId, id) {
  const r = db.prepare('UPDATE notificaciones SET leida=1 WHERE id=? AND usuario_id=?')
    .run(Number(id), Number(usuarioId));
  return r.changes > 0;
}

function marcarTodasLeidas(usuarioId) {
  return db.prepare('UPDATE notificaciones SET leida=1 WHERE usuario_id=? AND leida=0')
    .run(Number(usuarioId)).changes;
}

function eliminarNotificacion(usuarioId, id) {
  return db.prepare('DELETE FROM notificaciones WHERE id=? AND usuario_id=?')
    .run(Number(id), Number(usuarioId)).changes > 0;
}

module.exports = {
  crearNotificacion, crearVarias, listarNotificaciones, contarNoLeidas,
  marcarLeida, marcarTodasLeidas, eliminarNotificacion
};
