const express = require('express');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../config');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../utils/http');
const { datosLeccion, leccionPorId, puedeVerLeccion } = require('../services/cursos');

const router = express.Router();

router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  res.json(datosLeccion(req.user, req.params.id));
}));

router.get('/:id/video', optionalAuth, asyncHandler(async (req, res) => {
  const leccion = leccionPorId(req.params.id);
  if (!leccion || leccion.tipo_video !== 'archivo' || !leccion.archivo_path)
    throw new ApiError(404, 'Video no encontrado');
  if (!puedeVerLeccion(req.user, leccion)) throw new ApiError(403, 'Necesitas acceso al curso para ver este video');

  const absoluto = path.resolve(UPLOAD_DIR, leccion.archivo_path);
  const base = path.resolve(UPLOAD_DIR) + path.sep;
  if (!absoluto.startsWith(base)) throw new ApiError(400, 'Ruta de video inválida');
  if (!fs.existsSync(absoluto)) throw new ApiError(404, 'El archivo de video no está disponible');
  res.sendFile(absoluto);
}));

module.exports = router;
