const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { ApiError, asyncHandler, txt, txtMax } = require('../utils/http');
const { tieneAcceso } = require('../services/cursos');
const { crearNotificacion } = require('../services/notificaciones');

const router = express.Router();

function cursoPorSlug(slug) {
  return db.prepare('SELECT id,titulo,slug,instructor_id,precio,estado FROM cursos WHERE slug=?')
    .get(String(slug));
}

function cursoDelHilo(hiloId) {
  return db.prepare(`SELECT f.*, c.titulo AS curso_titulo, c.slug AS curso_slug,
      c.instructor_id, c.precio, c.estado AS curso_estado
    FROM foro_hilos f JOIN cursos c ON c.id=f.curso_id
    WHERE f.id=?`).get(Number(hiloId));
}

function exigirAcceso(usuario, curso) {
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  if (!tieneAcceso(usuario, curso.id))
    throw new ApiError(403, 'Inscríbete en el curso para participar en su foro');
  return curso;
}

function esModerador(usuario, curso) {
  return usuario.rol === 'administrador' || (usuario.rol === 'instructor' && curso.instructor_id === usuario.id);
}

function texto(valor, min, max, campo) {
  if (!txtMax(valor, max) || String(valor).trim().length < min)
    throw new ApiError(400, `${campo} debe tener entre ${min} y ${max} caracteres`);
  return String(valor).trim();
}

function autor(usuarioId) {
  return db.prepare('SELECT id, nombre, apellidos, rol FROM usuarios WHERE id=?').get(Number(usuarioId));
}

function nombre(u) {
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim();
}

function hilosDelCurso(cursoId) {
  return db.prepare(`
    SELECT f.id, f.titulo, f.contenido, f.fijado, f.cerrado, f.creado, f.actualizado,
           f.usuario_id, (u.nombre || ' ' || u.apellidos) AS autor, u.rol AS autor_rol,
           (SELECT COUNT(*) FROM foro_respuestas r WHERE r.hilo_id=f.id) AS respuestas,
           (SELECT COUNT(*) FROM foro_respuestas r WHERE r.hilo_id=f.id) +
           (SELECT COUNT(*) FROM foro_hilos fr WHERE fr.id=f.id) AS mensajes
    FROM foro_hilos f JOIN usuarios u ON u.id=f.usuario_id
    WHERE f.curso_id=?
    ORDER BY f.fijado DESC, f.actualizado DESC, f.id DESC`).all(Number(cursoId));
}

router.get('/cursos/:slug/foro', auth, asyncHandler(async (req, res) => {
  const curso = exigirAcceso(req.user, cursoPorSlug(req.params.slug));
  res.json({
    curso: { id: curso.id, titulo: curso.titulo, slug: curso.slug },
    puede_moderar: esModerador(req.user, curso),
    hilos: hilosDelCurso(curso.id)
  });
}));

router.post('/cursos/:slug/foro', auth, asyncHandler(async (req, res) => {
  const curso = exigirAcceso(req.user, cursoPorSlug(req.params.slug));
  const b = req.body || {};
  const titulo = texto(b.titulo, 5, 140, 'El título');
  const contenido = texto(b.contenido, 10, 5000, 'El mensaje');
  const r = db.prepare('INSERT INTO foro_hilos(curso_id,usuario_id,titulo,contenido) VALUES(?,?,?,?)')
    .run(curso.id, req.user.id, titulo, contenido);

  if (req.user.id !== curso.instructor_id) {
    const instructor = autor(curso.instructor_id);
    if (instructor) {
      crearNotificacion(instructor.id, {
        tipo: 'foro',
        titulo: `Nueva pregunta en ${curso.titulo}`,
        mensaje: `${nombre(req.user)} abrió «${titulo}».`,
        enlace: `/curso.html?slug=${encodeURIComponent(curso.slug)}#foro`
      });
    }
  }
  const hilo = db.prepare('SELECT * FROM foro_hilos WHERE id=?').get(Number(r.lastInsertRowid));
  res.status(201).json({ hilo });
}));

router.get('/foro/hilos/:id', auth, asyncHandler(async (req, res) => {
  const hilo = cursoDelHilo(req.params.id);
  if (!hilo) throw new ApiError(404, 'Hilo no encontrado');
  const curso = { id: hilo.curso_id, instructor_id: hilo.instructor_id };
  exigirAcceso(req.user, curso);
  const respuestas = db.prepare(`
    SELECT r.id, r.contenido, r.creado, r.actualizado, r.usuario_id,
           (u.nombre || ' ' || u.apellidos) AS autor, u.rol AS autor_rol
    FROM foro_respuestas r JOIN usuarios u ON u.id=r.usuario_id
    WHERE r.hilo_id=? ORDER BY r.id ASC`).all(hilo.id);
  const autorHilo = autor(hilo.usuario_id);
  res.json({
    hilo: {
      id: hilo.id,
      titulo: hilo.titulo,
      contenido: hilo.contenido,
      fijado: !!hilo.fijado,
      cerrado: !!hilo.cerrado,
      creado: hilo.creado,
      actualizado: hilo.actualizado,
      usuario_id: hilo.usuario_id,
      autor: autorHilo ? nombre(autorHilo) : 'Usuario',
      autor_rol: autorHilo ? autorHilo.rol : null,
      curso: { id: hilo.curso_id, titulo: hilo.curso_titulo, slug: hilo.curso_slug }
    },
    respuestas,
    puede_moderar: esModerador(req.user, curso)
  });
}));

router.post('/foro/hilos/:id/respuestas', auth, asyncHandler(async (req, res) => {
  const hilo = cursoDelHilo(req.params.id);
  if (!hilo) throw new ApiError(404, 'Hilo no encontrado');
  const curso = { id: hilo.curso_id, instructor_id: hilo.instructor_id };
  exigirAcceso(req.user, curso);
  const moderador = esModerador(req.user, curso);
  if (hilo.cerrado && !moderador) throw new ApiError(409, 'Este hilo está cerrado');
  const contenido = texto((req.body || {}).contenido, 2, 5000, 'La respuesta');
  const r = db.prepare('INSERT INTO foro_respuestas(hilo_id,usuario_id,contenido) VALUES(?,?,?)')
    .run(hilo.id, req.user.id, contenido);
  db.prepare('UPDATE foro_hilos SET actualizado=CURRENT_TIMESTAMP WHERE id=?').run(hilo.id);

  const destinatarios = new Set();
  if (req.user.id !== hilo.instructor_id) destinatarios.add(hilo.instructor_id);
  if (req.user.id !== hilo.usuario_id) destinatarios.add(hilo.usuario_id);
  destinatarios.delete(req.user.id);
  const enlace = `/curso.html?slug=${encodeURIComponent(hilo.curso_slug)}#foro`;
  for (const destinatario of destinatarios) {
    const u = autor(destinatario);
    if (!u) continue;
    crearNotificacion(destinatario, {
      tipo: 'foro',
      titulo: `Nueva respuesta en ${hilo.curso_titulo}`,
      mensaje: `${nombre(req.user)} respondió en «${hilo.titulo}».`,
      enlace
    });
  }
  const respuesta = db.prepare('SELECT * FROM foro_respuestas WHERE id=?').get(Number(r.lastInsertRowid));
  res.status(201).json({ respuesta });
}));

router.delete('/foro/hilos/:id', auth, asyncHandler(async (req, res) => {
  const hilo = cursoDelHilo(req.params.id);
  if (!hilo) throw new ApiError(404, 'Hilo no encontrado');
  const curso = { id: hilo.curso_id, instructor_id: hilo.instructor_id };
  exigirAcceso(req.user, curso);
  const puede = hilo.usuario_id === req.user.id || esModerador(req.user, curso);
  if (!puede) throw new ApiError(403, 'No puedes eliminar este hilo');
  db.prepare('DELETE FROM foro_hilos WHERE id=?').run(hilo.id);
  res.json({ ok: true });
}));

router.delete('/foro/respuestas/:id', auth, asyncHandler(async (req, res) => {
  const respuesta = db.prepare(`SELECT r.*, f.curso_id, f.usuario_id AS hilo_usuario_id,
      c.instructor_id
    FROM foro_respuestas r
    JOIN foro_hilos f ON f.id=r.hilo_id
    JOIN cursos c ON c.id=f.curso_id
    WHERE r.id=?`).get(Number(req.params.id));
  if (!respuesta) throw new ApiError(404, 'Respuesta no encontrada');
  const curso = { id: respuesta.curso_id, instructor_id: respuesta.instructor_id };
  exigirAcceso(req.user, curso);
  const puede = respuesta.usuario_id === req.user.id || esModerador(req.user, curso);
  if (!puede) throw new ApiError(403, 'No puedes eliminar esta respuesta');
  db.prepare('DELETE FROM foro_respuestas WHERE id=?').run(respuesta.id);
  res.json({ ok: true });
}));

router.post('/foro/hilos/:id/cerrar', auth, asyncHandler(async (req, res) => {
  const hilo = cursoDelHilo(req.params.id);
  if (!hilo) throw new ApiError(404, 'Hilo no encontrado');
  if (!esModerador(req.user, { id: hilo.curso_id, instructor_id: hilo.instructor_id }))
    throw new ApiError(403, 'Solo el instructor o la administración pueden cerrar hilos');
  const valor = req.body && typeof req.body.valor === 'boolean' ? (req.body.valor ? 1 : 0) : (hilo.cerrado ? 0 : 1);
  db.prepare('UPDATE foro_hilos SET cerrado=?,actualizado=CURRENT_TIMESTAMP WHERE id=?').run(valor, hilo.id);
  res.json({ ok: true, cerrado: !!valor });
}));

router.post('/foro/hilos/:id/fijar', auth, asyncHandler(async (req, res) => {
  const hilo = cursoDelHilo(req.params.id);
  if (!hilo) throw new ApiError(404, 'Hilo no encontrado');
  if (!esModerador(req.user, { id: hilo.curso_id, instructor_id: hilo.instructor_id }))
    throw new ApiError(403, 'Solo el instructor o la administración pueden fijar hilos');
  const valor = req.body && typeof req.body.valor === 'boolean' ? (req.body.valor ? 1 : 0) : (hilo.fijado ? 0 : 1);
  db.prepare('UPDATE foro_hilos SET fijado=? WHERE id=?').run(valor, hilo.id);
  res.json({ ok: true, fijado: !!valor });
}));

module.exports = router;
