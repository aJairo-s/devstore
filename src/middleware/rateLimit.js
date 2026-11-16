// Limitador sencillo en memoria para intentos fallidos de login.
const fallos = new Map();
const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS = 20;

const ipDe = req => req.ip || req.socket?.remoteAddress || 'desconocida';

function loginLimiter(req, res, next) {
  const ahora = Date.now();
  const prev = fallos.get(ipDe(req));
  if (prev && ahora - prev.inicio <= VENTANA_MS && prev.n >= MAX_FALLOS)
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.' });
  if (prev && ahora - prev.inicio > VENTANA_MS) fallos.delete(ipDe(req));
  next();
}

function loginFallido(req) {
  const ip = ipDe(req);
  const ahora = Date.now();
  const prev = fallos.get(ip);
  if (!prev || ahora - prev.inicio > VENTANA_MS) fallos.set(ip, { inicio: ahora, n: 1 });
  else prev.n += 1;
}

function loginExitoso(req) {
  fallos.delete(ipDe(req));
}

function limpiarRateLimit() {
  fallos.clear();
}

module.exports = { loginLimiter, loginFallido, loginExitoso, limpiarRateLimit };
