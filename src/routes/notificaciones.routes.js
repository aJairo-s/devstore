const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../utils/http');
const {
  listarNotificaciones, contarNoLeidas, marcarLeida, marcarTodasLeidas, eliminarNotificacion
} = require('../services/notificaciones');

const router = express.Router();
router.use(auth);

router.get('/', asyncHandler(async (req, res) => {
  const soloNoLeidas = req.query.no_leidas === '1' || req.query.no_leidas === 'true';
  const limit = Number(req.query.limit) || 30;
  res.json({
    items: listarNotificaciones(req.user.id, { limit, soloNoLeidas }),
    no_leidas: contarNoLeidas(req.user.id)
  });
}));

router.get('/resumen', asyncHandler(async (req, res) => {
  res.json({ no_leidas: contarNoLeidas(req.user.id) });
}));

// Debe declararse antes de /:id/leer para no colisionar con un id numérico.
router.post('/leer-todas', asyncHandler(async (req, res) => {
  const marcadas = marcarTodasLeidas(req.user.id);
  res.json({ ok: true, marcadas, no_leidas: 0 });
}));

router.post('/:id/leer', asyncHandler(async (req, res) => {
  if (!marcarLeida(req.user.id, req.params.id)) throw new ApiError(404, 'Notificación no encontrada');
  res.json({ ok: true, no_leidas: contarNoLeidas(req.user.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!eliminarNotificacion(req.user.id, req.params.id)) throw new ApiError(404, 'Notificación no encontrada');
  res.json({ ok: true, no_leidas: contarNoLeidas(req.user.id) });
}));

module.exports = router;
