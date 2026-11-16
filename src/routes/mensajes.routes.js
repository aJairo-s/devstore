const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const {
  obtenerOCrear, conversacionesDe, mensajesDe, enviar, noLeidos, marcarLeido, contactos
} = require('../services/mensajes');

const router = express.Router();
router.use(auth);

router.get('/conversaciones', asyncHandler(async (req, res) => {
  res.json(conversacionesDe(req.user.id));
}));

router.post('/conversaciones', asyncHandler(async (req, res) => {
  const conv = obtenerOCrear(req.user.id, (req.body || {}).usuario_id);
  res.status(201).json(conv);
}));

router.get('/conversaciones/:id', asyncHandler(async (req, res) => {
  res.json(mensajesDe(req.user.id, req.params.id, { limit: req.query.limit }));
}));

router.post('/conversaciones/:id', asyncHandler(async (req, res) => {
  res.status(201).json(enviar(req.user.id, req.params.id, (req.body || {}).contenido));
}));

router.post('/conversaciones/:id/leer', asyncHandler(async (req, res) => {
  res.json(marcarLeido(req.user.id, req.params.id));
}));

router.get('/no-leidos', asyncHandler(async (req, res) => {
  res.json({ no_leidos: noLeidos(req.user.id) });
}));

router.get('/contactos', asyncHandler(async (req, res) => {
  res.json(contactos(req.user.id, req.query.q));
}));

module.exports = router;
