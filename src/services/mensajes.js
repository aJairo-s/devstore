const { db } = require('../db');
const { ApiError, txtMax } = require('../utils/http');
const { crearNotificacion } = require('./notificaciones');
const { emitir } = require('../realtime');

function usuarioBasico(id) {
  const u = db.prepare('SELECT id,nombre,apellidos,rol FROM usuarios WHERE id=?').get(Number(id));
  if (!u) return null;
  return { id: u.id, nombre: `${u.nombre} ${u.apellidos || ''}`.trim(), rol: u.rol };
}

function participantes(id) {
  return db.prepare('SELECT id,usuario_a,usuario_b,creado,actualizado FROM conversaciones WHERE id=?')
    .get(Number(id));
}

function esParticipante(conv, usuarioId) {
  return conv && (conv.usuario_a === Number(usuarioId) || conv.usuario_b === Number(usuarioId));
}

function exigirParticipante(conv, usuarioId) {
  if (!conv) throw new ApiError(404, 'Conversación no encontrada');
  if (!esParticipante(conv, usuarioId)) throw new ApiError(403, 'No participas en esta conversación');
  return conv;
}

function obtenerOCrear(usuarioId, otroId) {
  const a = Number(usuarioId);
  const b = Number(otroId);
  if (!Number.isInteger(b) || b <= 0) throw new ApiError(400, 'Selecciona un usuario válido');
  if (a === b) throw new ApiError(400, 'No puedes abrir una conversación contigo mismo');
  const otro = db.prepare('SELECT id,estado FROM usuarios WHERE id=?').get(b);
  if (!otro || otro.estado !== 'activo') throw new ApiError(404, 'Usuario no encontrado');
  const [x, y] = a < b ? [a, b] : [b, a];
  let conv = db.prepare('SELECT * FROM conversaciones WHERE usuario_a=? AND usuario_b=?').get(x, y);
  if (!conv) {
    const r = db.prepare('INSERT INTO conversaciones(usuario_a,usuario_b) VALUES(?,?)').run(x, y);
    conv = participantes(r.lastInsertRowid);
  }
  return { ...conv, otro: usuarioBasico(b) };
}

function conversacionesDe(usuarioId) {
  const id = Number(usuarioId);
  const filas = db.prepare(`
    SELECT c.id, c.usuario_a, c.usuario_b, c.creado, c.actualizado,
      CASE WHEN c.usuario_a=? THEN c.usuario_b ELSE c.usuario_a END AS otro_id,
      (SELECT contenido FROM mensajes m WHERE m.conversacion_id=c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje,
      (SELECT creado FROM mensajes m WHERE m.conversacion_id=c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_en,
      (SELECT emisor_id FROM mensajes m WHERE m.conversacion_id=c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_emisor,
      (SELECT COUNT(*) FROM mensajes m WHERE m.conversacion_id=c.id AND m.emisor_id<>? AND m.leido=0) AS no_leidos
    FROM conversaciones c
    WHERE c.usuario_a=? OR c.usuario_b=?
    ORDER BY COALESCE((SELECT creado FROM mensajes m WHERE m.conversacion_id=c.id ORDER BY m.id DESC LIMIT 1), c.actualizado) DESC,
      c.id DESC`).all(id, id, id, id);
  return filas.map(f => ({
    id: f.id,
    otro: usuarioBasico(f.otro_id),
    ultimo_mensaje: f.ultimo_mensaje,
    ultimo_en: f.ultimo_en,
    ultimo_emisor: f.ultimo_emisor,
    no_leidos: f.no_leidos,
    actualizado: f.actualizado
  }));
}

function mensajesDe(usuarioId, conversacionId, { limit = 300 } = {}) {
  const conv = exigirParticipante(participantes(conversacionId), usuarioId);
  const n = Math.min(500, Math.max(1, Number(limit) || 300));
  const mensajes = db.prepare(`
    SELECT m.id,m.conversacion_id,m.emisor_id,m.contenido,m.leido,m.creado,
           (u.nombre || ' ' || u.apellidos) AS emisor
    FROM mensajes m JOIN usuarios u ON u.id=m.emisor_id
    WHERE m.conversacion_id=? ORDER BY m.id ASC LIMIT ?`).all(conv.id, n);
  const marcados = db.prepare('UPDATE mensajes SET leido=1 WHERE conversacion_id=? AND emisor_id<>? AND leido=0')
    .run(conv.id, Number(usuarioId)).changes;
  return {
    conversacion: { ...conv, otro: usuarioBasico(conv.usuario_a === Number(usuarioId) ? conv.usuario_b : conv.usuario_a) },
    mensajes,
    marcados
  };
}

function enviar(usuarioId, conversacionId, contenido) {
  const conv = exigirParticipante(participantes(conversacionId), usuarioId);
  if (!txtMax(contenido, 2000))
    throw new ApiError(400, 'El mensaje es obligatorio y no puede superar 2000 caracteres');
  const texto = String(contenido).trim();
  if (texto.length < 1) throw new ApiError(400, 'El mensaje no puede estar vacío');
  const otroId = conv.usuario_a === Number(usuarioId) ? conv.usuario_b : conv.usuario_a;

  const r = db.prepare('INSERT INTO mensajes(conversacion_id,emisor_id,contenido) VALUES(?,?,?)')
    .run(conv.id, Number(usuarioId), texto);
  db.prepare('UPDATE conversaciones SET actualizado=CURRENT_TIMESTAMP WHERE id=?').run(conv.id);
  const mensaje = db.prepare(`
    SELECT m.id,m.conversacion_id,m.emisor_id,m.contenido,m.leido,m.creado,
           (u.nombre || ' ' || u.apellidos) AS emisor
    FROM mensajes m JOIN usuarios u ON u.id=m.emisor_id WHERE m.id=?`).get(Number(r.lastInsertRowid));

  crearNotificacion(otroId, {
    tipo: 'mensaje',
    titulo: `Nuevo mensaje de ${mensaje.emisor}`,
    mensaje: texto.length > 140 ? texto.slice(0, 137) + '…' : texto,
    enlace: `/mensajes.html?c=${conv.id}`
  });
  // Se emite a ambos para sincronizar otras pestañas del emisor.
  emitir([otroId], { type: 'mensaje', mensaje, conversacion_id: conv.id, propio: false });
  emitir([usuarioId], { type: 'mensaje', mensaje, conversacion_id: conv.id, propio: true });
  return { mensaje, otro: usuarioBasico(otroId) };
}

function noLeidos(usuarioId) {
  return db.prepare(`SELECT COUNT(*) n FROM mensajes m
    JOIN conversaciones c ON c.id=m.conversacion_id
    WHERE (c.usuario_a=? OR c.usuario_b=?) AND m.emisor_id<>? AND m.leido=0`)
    .get(Number(usuarioId), Number(usuarioId), Number(usuarioId)).n;
}

function marcarLeido(usuarioId, conversacionId) {
  const conv = exigirParticipante(participantes(conversacionId), usuarioId);
  const cambios = db.prepare('UPDATE mensajes SET leido=1 WHERE conversacion_id=? AND emisor_id<>? AND leido=0')
    .run(conv.id, Number(usuarioId)).changes;
  return { ok: true, marcados: cambios };
}

function contactos(usuarioId, q = '') {
  const id = Number(usuarioId);
  const busqueda = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  const where = ['u.id<>?', "u.estado='activo'"];
  const params = [id];
  if (busqueda) {
    where.push('(u.nombre LIKE ? OR u.apellidos LIKE ? OR u.email LIKE ?)');
    const like = `%${busqueda}%`;
    params.push(like, like, like);
  }
  const filas = db.prepare(`SELECT u.id,u.nombre,u.apellidos,u.rol
    FROM usuarios u WHERE ${where.join(' AND ')}
    ORDER BY CASE u.rol WHEN 'instructor' THEN 0 WHEN 'cliente' THEN 1 ELSE 2 END, u.nombre
    LIMIT 20`).all(...params);
  return filas.map(u => ({
    id: u.id,
    nombre: `${u.nombre} ${u.apellidos || ''}`.trim(),
    rol: u.rol
  }));
}

module.exports = {
  obtenerOCrear, conversacionesDe, mensajesDe, enviar, noLeidos,
  marcarLeido, contactos, usuarioBasico, esParticipante
};
