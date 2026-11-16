const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { auth, rol } = require('../middleware/auth');
const { perfilDe } = require('./auth.routes');
const {
  ApiError, asyncHandler, emailOk, passOk, txt, txtMax, normalizarEmail,
  entero, urlOpcional, jsonSeguro
} = require('../utils/http');

const router = express.Router();
const NIVELES = ['principiante', 'intermedio', 'avanzado'];

router.get('/', auth, (req, res) => {
  res.json({ ...req.user, perfil: perfilDe(req.user) });
});

router.put('/', auth, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!txtMax(b.nombre, 80) || !txtMax(b.apellidos, 100))
    throw new ApiError(400, 'Nombre y apellidos son obligatorios');
  if (b.email !== undefined && !emailOk(b.email)) throw new ApiError(400, 'El email no es válido');

  if (b.password !== undefined && b.password !== '') {
    if (!passOk(b.password)) throw new ApiError(400, 'La nueva contraseña debe tener al menos 8 caracteres');
    if (typeof b.password_actual !== 'string' || !b.password_actual)
      throw new ApiError(400, 'Indica tu contraseña actual para cambiarla');
    const actual = db.prepare('SELECT password_hash FROM usuarios WHERE id=?').get(req.user.id);
    if (!bcrypt.compareSync(b.password_actual, actual.password_hash))
      throw new ApiError(400, 'La contraseña actual no es correcta');
  }

  let perfil;
  if (req.user.rol === 'cliente') {
    if (!txtMax(b.telefono, 40)) throw new ApiError(400, 'El teléfono es obligatorio');
    if (!txtMax(b.pais, 80)) throw new ApiError(400, 'El país es obligatorio');
    if (!NIVELES.includes(b.nivel_experiencia)) throw new ApiError(400, 'Nivel de experiencia inválido');
    const areas = Array.isArray(b.areas_interes)
      ? [...new Set(b.areas_interes.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim()))]
      : [];
    if (!areas.length) throw new ApiError(400, 'Selecciona al menos un área de interés');
    perfil = { telefono: b.telefono.trim(), pais: b.pais.trim(), ciudad: txt(b.ciudad) ? b.ciudad.trim() : null, nivel: b.nivel_experiencia, areas };
  } else if (req.user.rol === 'instructor') {
    perfil = validarPerfilInstructor(b);
  }

  try {
    db.transaction(() => {
      db.prepare('UPDATE usuarios SET nombre=?,apellidos=?,email=?,actualizado=CURRENT_TIMESTAMP WHERE id=?')
        .run(b.nombre.trim(), b.apellidos.trim(), normalizarEmail(b.email || req.user.email), req.user.id);
      if (b.password) db.prepare('UPDATE usuarios SET password_hash=? WHERE id=?')
        .run(bcrypt.hashSync(b.password, 10), req.user.id);
      if (req.user.rol === 'cliente') {
        if (!b.areas_interes) throw new ApiError(400, 'Datos de perfil incompletos');
        db.prepare(`UPDATE perfiles_cliente SET telefono=?,pais=?,ciudad=?,nivel_experiencia=?,areas_interes=?,actualizado=CURRENT_TIMESTAMP
          WHERE usuario_id=?`)
          .run(perfil.telefono, perfil.pais, perfil.ciudad, perfil.nivel, JSON.stringify(perfil.areas), req.user.id);
      } else if (req.user.rol === 'instructor') {
        db.prepare(`UPDATE perfiles_instructor SET titular=?,biografia=?,especialidad=?,anios_experiencia=?,pais=?,telefono=?,
          github_url=?,portafolio_url=?,linkedin_url=?,credenciales=?,actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`)
          .run(perfil.titular, perfil.biografia, perfil.especialidad, perfil.anios_experiencia, perfil.pais,
            perfil.telefono, perfil.github_url, perfil.portafolio_url, perfil.linkedin_url, perfil.credenciales, req.user.id);
      }
    })();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ApiError(409, 'Ya existe una cuenta con ese email');
    throw err;
  }
  res.json({ ok: true, perfil: perfilDe({ ...req.user, rol: req.user.rol }) });
}));

function validarPerfilInstructor(b) {
  if (!txtMax(b.titular, 140)) throw new ApiError(400, 'El titular profesional es obligatorio');
  if (!txtMax(b.biografia, 1500) || b.biografia.trim().length < 40)
    throw new ApiError(400, 'La biografía debe tener al menos 40 caracteres');
  if (!txtMax(b.especialidad, 160)) throw new ApiError(400, 'La especialidad es obligatoria');
  const anios = entero(b.anios_experiencia);
  if (anios === null || anios < 0 || anios > 70) throw new ApiError(400, 'Años de experiencia inválidos');
  if (!txtMax(b.pais, 80)) throw new ApiError(400, 'El país es obligatorio');
  const github = urlOpcional(b.github_url, 'GitHub');
  const portafolio = urlOpcional(b.portafolio_url, 'Portafolio');
  const linkedin = urlOpcional(b.linkedin_url, 'LinkedIn');
  const credenciales = txt(b.credenciales) ? b.credenciales.trim().slice(0, 1500) : '';
  if (!github && !portafolio && !credenciales)
    throw new ApiError(400, 'Añade al menos una evidencia: GitHub, portafolio o credenciales');
  return {
    titular: b.titular.trim(), biografia: b.biografia.trim(), especialidad: b.especialidad.trim(),
    anios_experiencia: anios, pais: b.pais.trim(), telefono: txt(b.telefono) ? b.telefono.trim() : null,
    github_url: github, portafolio_url: portafolio, linkedin_url: linkedin, credenciales
  };
}

router.get('/instructor/verificacion', auth, rol('instructor'), (req, res) => {
  const p = db.prepare(`SELECT estado_verificacion,motivo_rechazo,verificado_en,actualizado
    FROM perfiles_instructor WHERE usuario_id=?`).get(req.user.id);
  res.json(p || { estado_verificacion: 'pendiente' });
});

// Permite reenviar la solicitud tras corregir la evidencia.
router.post('/instructor/verificacion', auth, rol('instructor'), asyncHandler(async (req, res) => {
  const p = db.prepare('SELECT * FROM perfiles_instructor WHERE usuario_id=?').get(req.user.id);
  if (!p) throw new ApiError(404, 'Perfil de instructor no encontrado');
  if (p.estado_verificacion === 'verificado') throw new ApiError(409, 'Tu cuenta ya está verificada');
  if (p.estado_verificacion === 'pendiente') throw new ApiError(409, 'Tu solicitud ya está en revisión');
  db.prepare(`UPDATE perfiles_instructor SET estado_verificacion='pendiente',motivo_rechazo=NULL,actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`)
    .run(req.user.id);
  res.json({ estado_verificacion: 'pendiente' });
}));

module.exports = router;
