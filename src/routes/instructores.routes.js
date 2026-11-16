const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { UPLOAD_DIR } = require('../config');
const { auth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../utils/http');

const router = express.Router();

function instructorConCobro(id) {
  return db.prepare(`SELECT u.id,u.nombre,u.apellidos,u.email,
      p.pago_banco,p.pago_titular,p.pago_cuenta,p.pago_tipo_cuenta,
      p.pago_instrucciones,p.pago_qr_path,p.pago_qr_nombre,p.pago_actualizado
    FROM usuarios u
    JOIN perfiles_instructor p ON p.usuario_id=u.id
    WHERE u.id=? AND u.rol='instructor' AND u.estado='activo'`).get(Number(id));
}

function urlQr(fila) {
  if (!fila.pago_qr_path) return null;
  const version = encodeURIComponent(String(fila.pago_actualizado || '').replace(/[^0-9]/g, '').slice(0, 14));
  return `/api/instructores/${fila.id}/qr${version ? `?v=${version}` : ''}`;
}

// Datos de cobro simulados que el estudiante necesita para pagar.
// Solo se exponen a cuentas autenticadas y nunca incluyen datos del comprador.
router.get('/:id/pago', auth, asyncHandler(async (req, res) => {
  const fila = instructorConCobro(req.params.id);
  if (!fila) throw new ApiError(404, 'Instructor no encontrado');
  res.json({
    instructor_id: fila.id,
    instructor: `${fila.nombre} ${fila.apellidos}`.trim(),
    banco: fila.pago_banco || null,
    titular: fila.pago_titular || null,
    cuenta: fila.pago_cuenta || null,
    tipo_cuenta: fila.pago_tipo_cuenta || null,
    instrucciones: fila.pago_instrucciones || null,
    qr_url: urlQr(fila),
    qr_nombre: fila.pago_qr_nombre || null
  });
}));

router.get('/:id/qr', auth, asyncHandler(async (req, res) => {
  const fila = instructorConCobro(req.params.id);
  if (!fila || !fila.pago_qr_path) throw new ApiError(404, 'El instructor todavía no ha subido un código QR');

  const absoluto = path.resolve(UPLOAD_DIR, fila.pago_qr_path);
  const base = path.resolve(UPLOAD_DIR) + path.sep;
  if (!absoluto.startsWith(base)) throw new ApiError(400, 'Ruta de imagen inválida');
  if (!fs.existsSync(absoluto)) throw new ApiError(404, 'La imagen del código QR no está disponible');

  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(absoluto);
}));

module.exports = router;
