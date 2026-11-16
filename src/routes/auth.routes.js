const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { loginLimiter, loginFallido, loginExitoso } = require('../middleware/rateLimit');
const {
  ApiError, asyncHandler, emailOk, passOk, txt, txtMax, normalizarEmail,
  entero, urlOpcional, jsonSeguro
} = require('../utils/http');

const router = express.Router();
const NIVELES = ['principiante', 'intermedio', 'avanzado'];

function esEmailDuplicado(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: usuarios.email/.test(err.message || ''));
}

function regenerarSesion(req) {
  return new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
}

function guardarSesion(req, user) {
  req.session.uid = user.id;
  req.session.rol = user.rol;
}

function perfilDe(user) {
  if (user.rol === 'cliente') {
    const p = db.prepare('SELECT * FROM perfiles_cliente WHERE usuario_id=?').get(user.id);
    return p ? { ...p, areas_interes: jsonSeguro(p.areas_interes) } : null;
  }
  if (user.rol === 'instructor') {
    return db.prepare(`SELECT usuario_id,titular,biografia,especialidad,anios_experiencia,pais,telefono,
      github_url,portafolio_url,linkedin_url,credenciales,estado_verificacion,motivo_rechazo,verificado_en
      FROM perfiles_instructor WHERE usuario_id=?`).get(user.id) || null;
  }
  return null;
}

function validarDatosComunes(body) {
  if (!txtMax(body.nombre, 80) || !txtMax(body.apellidos, 100))
    throw new ApiError(400, 'Nombre y apellidos son obligatorios');
  if (!emailOk(body.email)) throw new ApiError(400, 'El email no es válido');
  if (!passOk(body.password)) throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres');
  if (body.acepta_terminos !== true && body.acepta_terminos !== 1)
    throw new ApiError(400, 'Debes aceptar los términos y el código de conducta');
}

const crearCliente = db.transaction(data => {
  const user = db.prepare('INSERT INTO usuarios(nombre,apellidos,email,password_hash,rol) VALUES(?,?,?,?,?)')
    .run(data.nombre, data.apellidos, data.email, data.password_hash, 'cliente');
  const id = Number(user.lastInsertRowid);
  db.prepare(`INSERT INTO perfiles_cliente(usuario_id,telefono,pais,ciudad,nivel_experiencia,areas_interes,acepta_terminos)
    VALUES(?,?,?,?,?,?,1)`)
    .run(id, data.telefono, data.pais, data.ciudad, data.nivel_experiencia, JSON.stringify(data.areas_interes));
  return id;
});

const crearInstructor = db.transaction(data => {
  const user = db.prepare('INSERT INTO usuarios(nombre,apellidos,email,password_hash,rol) VALUES(?,?,?,?,?)')
    .run(data.nombre, data.apellidos, data.email, data.password_hash, 'instructor');
  const id = Number(user.lastInsertRowid);
  db.prepare(`INSERT INTO perfiles_instructor
    (usuario_id,titular,biografia,especialidad,anios_experiencia,pais,telefono,github_url,portafolio_url,linkedin_url,credenciales,estado_verificacion)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'pendiente')`)
    .run(id, data.titular, data.biografia, data.especialidad, data.anios_experiencia, data.pais,
      data.telefono, data.github_url, data.portafolio_url, data.linkedin_url, data.credenciales);
  return id;
});

// Registro de cliente con perfil extendido.
router.post('/registro/cliente', asyncHandler(async (req, res) => {
  const b = req.body || {};
  validarDatosComunes(b);
  if (!txtMax(b.telefono, 40)) throw new ApiError(400, 'El teléfono es obligatorio');
  if (!txtMax(b.pais, 80)) throw new ApiError(400, 'El país es obligatorio');
  if (!NIVELES.includes(b.nivel_experiencia)) throw new ApiError(400, 'Selecciona un nivel de experiencia válido');
  const areas = Array.isArray(b.areas_interes)
    ? [...new Set(b.areas_interes.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim()))]
    : [];
  if (!areas.length) throw new ApiError(400, 'Selecciona al menos un área de interés');
  const data = {
    nombre: b.nombre.trim(),
    apellidos: b.apellidos.trim(),
    email: normalizarEmail(b.email),
    password_hash: bcrypt.hashSync(b.password, 10),
    telefono: b.telefono.trim(),
    pais: b.pais.trim(),
    ciudad: txt(b.ciudad) ? b.ciudad.trim() : null,
    nivel_experiencia: b.nivel_experiencia,
    areas_interes: areas
  };
  let id;
  try {
    id = crearCliente(data);
  } catch (err) {
    if (esEmailDuplicado(err)) throw new ApiError(409, 'Ya existe una cuenta con ese email');
    throw err;
  }
  await regenerarSesion(req);
  guardarSesion(req, { id, rol: 'cliente' });
  res.status(201).json({ id, rol: 'cliente' });
}));

// Registro de instructor con evidencias y verificación pendiente.
router.post('/registro/instructor', asyncHandler(async (req, res) => {
  const b = req.body || {};
  validarDatosComunes(b);
  if (!txtMax(b.titular, 140)) throw new ApiError(400, 'El titular profesional es obligatorio');
  if (!txtMax(b.biografia, 1500) || b.biografia.trim().length < 40)
    throw new ApiError(400, 'La biografía debe tener al menos 40 caracteres');
  if (!txtMax(b.especialidad, 160)) throw new ApiError(400, 'La especialidad es obligatoria');
  const anios = entero(b.anios_experiencia);
  if (anios === null || anios < 0 || anios > 70) throw new ApiError(400, 'Los años de experiencia no son válidos');
  if (!txtMax(b.pais, 80)) throw new ApiError(400, 'El país es obligatorio');
  const github = urlOpcional(b.github_url, 'GitHub');
  const portafolio = urlOpcional(b.portafolio_url, 'Portafolio');
  const linkedin = urlOpcional(b.linkedin_url, 'LinkedIn');
  const credenciales = txt(b.credenciales) ? b.credenciales.trim().slice(0, 1500) : '';
  if (!github && !portafolio && !credenciales)
    throw new ApiError(400, 'Añade al menos una evidencia: GitHub, portafolio o credenciales');
  const data = {
    nombre: b.nombre.trim(),
    apellidos: b.apellidos.trim(),
    email: normalizarEmail(b.email),
    password_hash: bcrypt.hashSync(b.password, 10),
    titular: b.titular.trim(),
    biografia: b.biografia.trim(),
    especialidad: b.especialidad.trim(),
    anios_experiencia: anios,
    pais: b.pais.trim(),
    telefono: txt(b.telefono) ? b.telefono.trim() : null,
    github_url: github,
    portafolio_url: portafolio,
    linkedin_url: linkedin,
    credenciales
  };
  let id;
  try {
    id = crearInstructor(data);
  } catch (err) {
    if (esEmailDuplicado(err)) throw new ApiError(409, 'Ya existe una cuenta con ese email');
    throw err;
  }
  await regenerarSesion(req);
  guardarSesion(req, { id, rol: 'instructor' });
  res.status(201).json({ id, rol: 'instructor', estado_verificacion: 'pendiente' });
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const email = normalizarEmail(req.body && req.body.email);
  const password = req.body && req.body.password;
  if (!emailOk(email) || typeof password !== 'string')
    throw new ApiError(400, 'Email y contraseña son obligatorios');
  const user = db.prepare('SELECT * FROM usuarios WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    loginFallido(req);
    throw new ApiError(401, 'Email o contraseña incorrectos');
  }
  if (user.estado !== 'activo') throw new ApiError(403, 'Tu cuenta está suspendida');
  loginExitoso(req);
  await regenerarSesion(req);
  guardarSesion(req, user);
  res.json({ id: user.id, nombre: user.nombre, apellidos: user.apellidos, email: user.email, rol: user.rol });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.clearCookie('connect.sid').json({ ok: true }));
});

router.get('/me', auth, (req, res) => {
  res.json({
    id: req.user.id,
    nombre: req.user.nombre,
    apellidos: req.user.apellidos,
    email: req.user.email,
    rol: req.user.rol,
    estado: req.user.estado,
    creado: req.user.creado,
    perfil: perfilDe(req.user)
  });
});

module.exports = router;
module.exports.perfilDe = perfilDe;
module.exports.regenerarSesion = regenerarSesion;
