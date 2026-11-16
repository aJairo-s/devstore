const express = require('express');
const { db } = require('../db');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT cat.id, cat.nombre, cat.slug, cat.descripcion, cat.icono, cat.orden,
           (SELECT COUNT(*) FROM cursos c WHERE c.categoria_id=cat.id AND c.estado='aprobado') AS cursos
    FROM categorias cat ORDER BY cat.orden, cat.nombre`).all();
  res.json(rows);
}));

module.exports = router;
