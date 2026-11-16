class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const emailOk = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const passOk = p => typeof p === 'string' && p.length >= 8;
const txt = s => typeof s === 'string' && s.trim().length > 0;
const txtMax = (s, max) => txt(s) && s.trim().length <= max;
const normalizarEmail = e => String(e || '').trim().toLowerCase();

function entero(valor, defecto = null) {
  const n = Number(valor);
  return Number.isInteger(n) ? n : defecto;
}

function numero(valor, defecto = null) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : defecto;
}

function urlOk(valor) {
  if (!txt(valor)) return false;
  try {
    const u = new URL(valor.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function urlOpcional(valor, campo) {
  if (!txt(valor)) return null;
  if (!urlOk(valor)) throw new ApiError(400, `${campo} debe ser una URL http(s) válida`);
  return valor.trim();
}

function lista(valor, permitidos) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter(v => permitidos.includes(v)))];
}

function jsonSeguro(valor, defecto = []) {
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : defecto;
  } catch {
    return defecto;
  }
}

function paginacion(query) {
  const limit = Math.min(100, Math.max(1, entero(query.limit, 50)));
  const offset = Math.max(0, entero(query.offset, 0));
  return { limit, offset };
}

module.exports = {
  ApiError, asyncHandler, emailOk, passOk, txt, txtMax, normalizarEmail,
  entero, numero, urlOk, urlOpcional, lista, jsonSeguro, paginacion
};
