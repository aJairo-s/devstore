const express = require('express');
const { db, DB_PATH } = require('../db');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/health', asyncHandler(async (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  const cursos = db.prepare('SELECT COUNT(*) AS n FROM cursos').get().n;
  let writable = true;
  try {
    db.exec('CREATE TABLE IF NOT EXISTS __health_probe(x INTEGER); DROP TABLE __health_probe;');
  } catch {
    writable = false;
  }
  res.json({
    ok: true,
    db: DB_PATH,
    writable,
    users,
    cursos,
    version: 3,
    node: process.version
  });
}));

router.get('/metodos-pago', asyncHandler(async (req, res) => {
  res.json(db.prepare('SELECT id,nombre,slug,descripcion,orden FROM metodos_pago WHERE activo=1 ORDER BY orden,id').all());
}));

module.exports = router;
