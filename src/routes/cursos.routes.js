const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler, numero, entero } = require('../utils/http');
const { listarCursos, detalleCurso } = require('../services/cursos');

const router = express.Router();

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const q = req.query;
  const nivel = ['principiante', 'intermedio', 'avanzado'].includes(q.nivel) ? q.nivel : '';
  const orden = ['nuevo', 'precio_asc', 'precio_desc', 'az', 'populares'].includes(q.orden) ? q.orden : 'nuevo';
  const precio_max = q.precio_max === undefined || q.precio_max === '' ? null : numero(q.precio_max);
  res.json(listarCursos({
    q: typeof q.q === 'string' ? q.q.slice(0, 100) : '',
    categoria: typeof q.categoria === 'string' ? q.categoria : '',
    nivel,
    orden,
    precio_max,
    gratis: q.gratis === '1' || q.gratis === 'true',
    limit: entero(q.limit, 50),
    offset: entero(q.offset, 0)
  }));
}));

router.get('/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const curso = detalleCurso(req.params.slug, req.user);
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  res.json(curso);
}));

module.exports = router;
