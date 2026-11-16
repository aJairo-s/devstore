function notFound(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

function errorHandler(err, req, res, _next) {
  if (err && err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido' });
  if (err && err.name === 'MulterError')
    return res.status(400).json({ error: `Error al subir el archivo: ${err.message}` });
  const status = Number(err && err.status) || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({
    error: err && err.message ? err.message : 'Error interno del servidor',
    ...(err && err.details ? { details: err.details } : {})
  });
}

module.exports = { notFound, errorHandler };
