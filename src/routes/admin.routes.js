const express = require('express');
const { db } = require('../db');
const { auth, rol } = require('../middleware/auth');
const { ApiError, asyncHandler, txt, txtMax, entero } = require('../utils/http');
const { SELECT_RESUMEN, publico, adminCompras } = require('../services/cursos');
const { crearNotificacion } = require('../services/notificaciones');

const router = express.Router();
const ROLES = ['cliente', 'instructor', 'administrador'];
const ESTADOS_VERIFICACION = ['pendiente', 'verificado', 'rechazado'];
const ESTADOS_CURSO = ['borrador', 'pendiente', 'aprobado', 'rechazado', 'archivado'];
const ESTADOS_USUARIO = ['activo', 'suspendido'];

router.use(auth, rol('administrador'));

router.get('/resumen', asyncHandler(async (req, res) => {
  const n = sql => db.prepare(sql).get().n;
  res.json({
    usuarios: n('SELECT COUNT(*) n FROM usuarios'),
    clientes: n("SELECT COUNT(*) n FROM usuarios WHERE rol='cliente'"),
    instructores: n("SELECT COUNT(*) n FROM usuarios WHERE rol='instructor'"),
    instructores_pendientes: n("SELECT COUNT(*) n FROM perfiles_instructor WHERE estado_verificacion='pendiente'"),
    cursos: n('SELECT COUNT(*) n FROM cursos'),
    cursos_pendientes: n("SELECT COUNT(*) n FROM cursos WHERE estado='pendiente'"),
    cursos_aprobados: n("SELECT COUNT(*) n FROM cursos WHERE estado='aprobado'"),
    compras: n('SELECT COUNT(*) n FROM compras')
  });
}));

// ---------- Verificación de instructores ----------
router.get('/instructores', asyncHandler(async (req, res) => {
  const estado = req.query.estado;
  const where = ESTADOS_VERIFICACION.includes(estado) ? 'WHERE p.estado_verificacion=?' : '';
  const params = where ? [estado] : [];
  const rows = db.prepare(`
    SELECT u.id, u.nombre, u.apellidos, u.email, u.estado AS estado_cuenta, u.creado,
           p.titular, p.biografia, p.especialidad, p.anios_experiencia, p.pais, p.telefono,
           p.github_url, p.portafolio_url, p.linkedin_url, p.credenciales,
           p.estado_verificacion, p.motivo_rechazo, p.verificado_en,
           (SELECT COUNT(*) FROM cursos c WHERE c.instructor_id=u.id) AS cursos
    FROM perfiles_instructor p JOIN usuarios u ON u.id=p.usuario_id
    ${where} ORDER BY CASE p.estado_verificacion WHEN 'pendiente' THEN 0 WHEN 'rechazado' THEN 1 ELSE 2 END, u.id`)
    .all(...params);
  res.json(rows.map(r => ({ ...r, nombre_completo: `${r.nombre} ${r.apellidos}`.trim() })));
}));

router.post('/instructores/:id/verificar', asyncHandler(async (req, res) => {
  const id = entero(req.params.id);
  const p = db.prepare('SELECT * FROM perfiles_instructor WHERE usuario_id=?').get(id);
  if (!p) throw new ApiError(404, 'Instructor no encontrado');
  if (p.estado_verificacion === 'verificado') throw new ApiError(409, 'El instructor ya está verificado');
  db.prepare(`UPDATE perfiles_instructor SET estado_verificacion='verificado',motivo_rechazo=NULL,
    verificado_por=?,verificado_en=CURRENT_TIMESTAMP,actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`)
    .run(req.user.id, id);
  crearNotificacion(id, {
    tipo: 'verificacion',
    titulo: 'Cuenta de instructor verificada',
    mensaje: 'Tu perfil ha sido aprobado. Ya puedes enviar cursos a revisión y publicarlos.',
    enlace: '/instructor.html'
  });
  res.json({ id, estado_verificacion: 'verificado' });
}));

router.post('/instructores/:id/rechazar', asyncHandler(async (req, res) => {
  const id = entero(req.params.id);
  const p = db.prepare('SELECT * FROM perfiles_instructor WHERE usuario_id=?').get(id);
  if (!p) throw new ApiError(404, 'Instructor no encontrado');
  if (p.estado_verificacion === 'verificado') throw new ApiError(409, 'No puedes rechazar un instructor ya verificado');
  const motivo = req.body && txt(req.body.motivo) ? req.body.motivo.trim().slice(0, 1000) : '';
  if (!motivo) throw new ApiError(400, 'El motivo del rechazo es obligatorio');
  db.prepare(`UPDATE perfiles_instructor SET estado_verificacion='rechazado',motivo_rechazo=?,
    verificado_por=?,verificado_en=CURRENT_TIMESTAMP,actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`)
    .run(motivo, req.user.id, id);
  crearNotificacion(id, {
    tipo: 'verificacion',
    titulo: 'Verificación rechazada',
    mensaje: motivo,
    enlace: '/perfil.html'
  });
  res.json({ id, estado_verificacion: 'rechazado', motivo_rechazo: motivo });
}));

// ---------- Aprobación de cursos ----------
router.get('/cursos', asyncHandler(async (req, res) => {
  const estado = req.query.estado;
  const where = ESTADOS_CURSO.includes(estado) ? 'WHERE c.estado=?' : '';
  const params = where ? [estado] : [];
  const rows = db.prepare(`${SELECT_RESUMEN} ${where} ORDER BY
    CASE c.estado WHEN 'pendiente' THEN 0 WHEN 'rechazado' THEN 1 WHEN 'borrador' THEN 2 ELSE 3 END, c.id DESC`)
    .all(...params);
  res.json(rows.map(publico));
}));

router.post('/cursos/:id/aprobar', asyncHandler(async (req, res) => {
  const c = db.prepare('SELECT * FROM cursos WHERE id=?').get(entero(req.params.id));
  if (!c) throw new ApiError(404, 'Curso no encontrado');
  if (c.estado !== 'pendiente') throw new ApiError(409, 'Solo se aprueban cursos pendientes de revisión');
  db.prepare(`UPDATE cursos SET estado='aprobado',motivo_rechazo=NULL,publicado_en=CURRENT_TIMESTAMP,
    actualizado=CURRENT_TIMESTAMP WHERE id=?`).run(c.id);
  crearNotificacion(c.instructor_id, {
    tipo: 'curso',
    titulo: 'Curso publicado',
    mensaje: `«${c.titulo}» ya está visible en el catálogo público.`,
    enlace: `/curso.html?slug=${encodeURIComponent(c.slug)}`
  });
  res.json({ id: c.id, estado: 'aprobado' });
}));

router.post('/cursos/:id/rechazar', asyncHandler(async (req, res) => {
  const c = db.prepare('SELECT * FROM cursos WHERE id=?').get(entero(req.params.id));
  if (!c) throw new ApiError(404, 'Curso no encontrado');
  if (c.estado !== 'pendiente') throw new ApiError(409, 'Solo se rechazan cursos pendientes de revisión');
  const motivo = req.body && txt(req.body.motivo) ? req.body.motivo.trim().slice(0, 1000) : '';
  if (!motivo) throw new ApiError(400, 'El motivo del rechazo es obligatorio');
  db.prepare("UPDATE cursos SET estado='rechazado',motivo_rechazo=?,actualizado=CURRENT_TIMESTAMP WHERE id=?")
    .run(motivo, c.id);
  crearNotificacion(c.instructor_id, {
    tipo: 'curso',
    titulo: 'Curso rechazado',
    mensaje: `«${c.titulo}»: ${motivo}`,
    enlace: `/editor-curso.html?id=${c.id}`
  });
  res.json({ id: c.id, estado: 'rechazado', motivo_rechazo: motivo });
}));

// ---------- Usuarios ----------
router.get('/usuarios', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rolFiltro = ROLES.includes(req.query.rol) ? req.query.rol : '';
  const where = [];
  const params = [];
  if (q) {
    where.push('(u.nombre LIKE ? OR u.apellidos LIKE ? OR u.email LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (rolFiltro) { where.push('u.rol=?'); params.push(rolFiltro); }
  const rows = db.prepare(`
    SELECT u.id,u.nombre,u.apellidos,u.email,u.rol,u.estado,u.creado,
           p.estado_verificacion,
           (SELECT COUNT(*) FROM cursos c WHERE c.instructor_id=u.id) AS cursos,
           (SELECT COUNT(*) FROM inscripciones i WHERE i.cliente_id=u.id) AS cursos_inscritos
    FROM usuarios u LEFT JOIN perfiles_instructor p ON p.usuario_id=u.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.id`).all(...params);
  res.json(rows.map(r => ({ ...r, nombre_completo: `${r.nombre} ${r.apellidos}`.trim() })));
}));

router.put('/usuarios/:id', asyncHandler(async (req, res) => {
  const id = entero(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(id);
  if (!u) throw new ApiError(404, 'Usuario no encontrado');
  const b = req.body || {};
  const nuevoRol = ROLES.includes(b.rol) ? b.rol : u.rol;
  const nuevoEstado = ESTADOS_USUARIO.includes(b.estado) ? b.estado : u.estado;
  if (id === req.user.id && (nuevoRol !== 'administrador' || nuevoEstado !== 'activo'))
    throw new ApiError(400, 'No puedes quitarte el rol de administrador ni suspenderte a ti mismo');
  if (!txtMax(b.nombre, 80) || !txtMax(b.apellidos, 100)) throw new ApiError(400, 'Nombre y apellidos son obligatorios');
  if (nuevoRol === 'instructor' && u.rol !== 'instructor') {
    const perfil = db.prepare('SELECT 1 FROM perfiles_instructor WHERE usuario_id=?').get(id);
    if (!perfil) throw new ApiError(400, 'El usuario necesita un perfil de instructor para tener ese rol');
  }
  db.prepare('UPDATE usuarios SET nombre=?,apellidos=?,rol=?,estado=?,actualizado=CURRENT_TIMESTAMP WHERE id=?')
    .run(b.nombre.trim(), b.apellidos.trim(), nuevoRol, nuevoEstado, id);
  res.json({ ok: true });
}));

router.delete('/usuarios/:id', asyncHandler(async (req, res) => {
  const id = entero(req.params.id);
  if (id === req.user.id) throw new ApiError(400, 'No puedes eliminar tu propia cuenta');
  const r = db.prepare('DELETE FROM usuarios WHERE id=?').run(id);
  if (!r.changes) throw new ApiError(404, 'Usuario no encontrado');
  res.json({ ok: true });
}));

// ---------- Compras (solo administración) ----------
router.get('/compras', asyncHandler(async (req, res) => {
  res.json(adminCompras());
}));

module.exports = router;
