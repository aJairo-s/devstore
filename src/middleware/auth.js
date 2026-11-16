const { db } = require('../db');
const { ApiError } = require('../utils/http');

function auth(req, res, next) {
  if (!req.session || !req.session.uid) return res.status(401).json({ error: 'No autenticado' });
  const user = db.prepare('SELECT id,nombre,apellidos,email,rol,estado,creado FROM usuarios WHERE id=?').get(req.session.uid);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Sesión no válida' });
  }
  if (user.estado !== 'activo') return res.status(403).json({ error: 'Tu cuenta está suspendida' });
  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  if (!req.session || !req.session.uid) {
    req.user = null;
    return next();
  }
  const user = db.prepare('SELECT id,nombre,apellidos,email,rol,estado,creado FROM usuarios WHERE id=?').get(req.session.uid);
  req.user = user && user.estado === 'activo' ? user : null;
  next();
}

function rol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permisos para esta acción' });
    next();
  };
}

function instructorVerificado(req, res, next) {
  if (!req.user || req.user.rol !== 'instructor')
    return res.status(403).json({ error: 'Solo instructores pueden realizar esta acción' });
  const perfil = db.prepare('SELECT estado_verificacion FROM perfiles_instructor WHERE usuario_id=?').get(req.user.id);
  if (!perfil || perfil.estado_verificacion !== 'verificado')
    return res.status(403).json({ error: 'Tu cuenta de instructor aún no está verificada' });
  next();
}

function apiError(status, message) {
  return new ApiError(status, message);
}

module.exports = { auth, optionalAuth, rol, instructorVerificado, apiError };
