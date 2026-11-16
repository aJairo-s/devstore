const express = require('express');
const { auth, rol } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { misCursos, comprasDeCliente } = require('../services/cursos');
const { crearCompra, compraDeCliente } = require('../services/compras');

const router = express.Router();

router.get('/mis-cursos', auth, rol('cliente'), asyncHandler(async (req, res) => {
  res.json(misCursos(req.user.id));
}));

router.get('/mis-compras', auth, rol('cliente'), asyncHandler(async (req, res) => {
  res.json(comprasDeCliente(req.user.id));
}));

// Compra simulada de la Fase 2: registra compra, pago e inscripciones.
router.post('/compras', auth, rol('cliente'), asyncHandler(async (req, res) => {
  const compra = crearCompra(req.user, req.body || {});
  res.status(201).json(compra);
}));

router.get('/compras/:id', auth, asyncHandler(async (req, res) => {
  res.json(compraDeCliente(req.params.id, req.user));
}));

module.exports = router;
