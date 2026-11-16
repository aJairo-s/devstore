const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../db');
const { VIDEO_DIR, VIDEO_MAX_MB, UPLOAD_DIR, QR_DIR } = require('../config');
const { auth, rol, instructorVerificado } = require('../middleware/auth');
const {
  ApiError, asyncHandler, txt, txtMax, entero, numero, urlOpcional
} = require('../utils/http');
const { parseYoutube } = require('../utils/youtube');
const { slugUnico, SELECT_RESUMEN, publico, estadisticasInstructor } = require('../services/cursos');
const { analiticaInstructor } = require('../services/analitica');
const { pagosPendientesInstructor, resolverPagoQr } = require('../services/compras');

const router = express.Router();
const NIVELES = ['principiante', 'intermedio', 'avanzado'];

fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(QR_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'tmp'), { recursive: true });

const upload = multer({
  dest: path.join(UPLOAD_DIR, 'tmp'),
  limits: { fileSize: VIDEO_MAX_MB * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const permitidos = ['video/mp4', 'video/webm'];
    if (!permitidos.includes(file.mimetype))
      return cb(new ApiError(400, 'Formato no permitido. Sube un archivo MP4 o WebM.'));
    cb(null, true);
  }
});

const IMAGENES_QR = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const uploadImagen = multer({
  dest: path.join(UPLOAD_DIR, 'tmp'),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!IMAGENES_QR[file.mimetype])
      return cb(new ApiError(400, 'Formato no permitido. Sube una imagen PNG, JPG o WebP.'));
    cb(null, true);
  }
});

/** Comprueba la firma real del archivo para no aceptar imágenes falsas. */
function firmaImagen(absoluto) {
  const buffer = Buffer.alloc(12);
  let fd;
  try {
    fd = fs.openSync(absoluto, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  if (buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function datosPagoInstructor(usuarioId) {
  const p = db.prepare(`SELECT pago_banco,pago_titular,pago_cuenta,pago_tipo_cuenta,pago_instrucciones,
      pago_qr_path,pago_qr_nombre,pago_actualizado
    FROM perfiles_instructor WHERE usuario_id=?`).get(usuarioId);
  if (!p) return null;
  return {
    banco: p.pago_banco || '',
    titular: p.pago_titular || '',
    cuenta: p.pago_cuenta || '',
    tipo_cuenta: p.pago_tipo_cuenta || '',
    instrucciones: p.pago_instrucciones || '',
    qr_url: p.pago_qr_path ? `/api/instructores/${usuarioId}/qr?t=${Date.now()}` : null,
    qr_nombre: p.pago_qr_nombre || null,
    actualizado: p.pago_actualizado || null
  };
}

router.use(auth, rol('instructor'));

/* ---------- Datos de cobro y código QR ---------- */

router.get('/pago', asyncHandler(async (req, res) => {
  res.json(datosPagoInstructor(req.user.id));
}));

router.put('/pago', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const limites = {
    banco: [120, 'El nombre del banco es demasiado largo'],
    titular: [120, 'El titular es demasiado largo'],
    cuenta: [60, 'El número de cuenta es demasiado largo'],
    tipo_cuenta: [40, 'El tipo de cuenta es demasiado largo'],
    instrucciones: [500, 'Las instrucciones son demasiado largas']
  };
  const datos = {};
  for (const [campo, [max, mensaje]] of Object.entries(limites)) {
    if (b[campo] !== undefined && b[campo] !== null && typeof b[campo] !== 'string')
      throw new ApiError(400, 'Datos de cobro inválidos');
    if (b[campo] && !txtMax(b[campo], max)) throw new ApiError(400, mensaje);
    datos[campo] = txt(b[campo]) ? b[campo].trim() : null;
  }
  db.prepare(`UPDATE perfiles_instructor SET pago_banco=?,pago_titular=?,pago_cuenta=?,pago_tipo_cuenta=?,
      pago_instrucciones=?,pago_actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`)
    .run(datos.banco, datos.titular, datos.cuenta, datos.tipo_cuenta, datos.instrucciones, req.user.id);
  res.json({ ok: true, pago: datosPagoInstructor(req.user.id) });
}));

router.post('/pago/qr', uploadImagen.single('qr'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Selecciona una imagen para tu código QR');
  const firma = firmaImagen(req.file.path);
  if (!firma) {
    fs.unlink(req.file.path, () => {});
    throw new ApiError(400, 'El archivo no es una imagen válida. Usa PNG, JPG o WebP.');
  }
  const previo = db.prepare('SELECT pago_qr_path FROM perfiles_instructor WHERE usuario_id=?').get(req.user.id);
  const nombre = `${crypto.randomUUID()}.${firma}`;
  const destino = path.join(QR_DIR, nombre);
  try {
    fs.renameSync(req.file.path, destino);
    const relativo = path.posix.join('qr', nombre);
    const original = String(req.file.originalname || 'codigo-qr').slice(0, 160);
    db.prepare(`UPDATE perfiles_instructor SET pago_qr_path=?,pago_qr_nombre=?,
        pago_actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`).run(relativo, original, req.user.id);
    if (previo && previo.pago_qr_path && previo.pago_qr_path !== relativo)
      borrarArchivo(previo.pago_qr_path);
    res.status(201).json({ ok: true, qr_url: `/api/instructores/${req.user.id}/qr?t=${Date.now()}`, qr_nombre: original });
  } catch (err) {
    fs.unlink(destino, () => {});
    throw err;
  }
}));

router.delete('/pago/qr', asyncHandler(async (req, res) => {
  const previo = db.prepare('SELECT pago_qr_path FROM perfiles_instructor WHERE usuario_id=?').get(req.user.id);
  db.prepare(`UPDATE perfiles_instructor SET pago_qr_path=NULL,pago_qr_nombre=NULL,
      pago_actualizado=CURRENT_TIMESTAMP WHERE usuario_id=?`).run(req.user.id);
  if (previo && previo.pago_qr_path) borrarArchivo(previo.pago_qr_path);
  res.json({ ok: true });
}));

function cursoPropio(id, instructorId) {
  return db.prepare('SELECT * FROM cursos WHERE id=? AND instructor_id=?').get(Number(id), instructorId);
}

function seccionPropia(id, instructorId) {
  return db.prepare(`SELECT s.*, c.id AS curso_id, c.instructor_id
    FROM curso_secciones s JOIN cursos c ON c.id=s.curso_id
    WHERE s.id=? AND c.instructor_id=?`).get(Number(id), instructorId);
}

function leccionPropia(id, instructorId) {
  return db.prepare(`SELECT l.*, s.curso_id, c.instructor_id
    FROM curso_lecciones l
    JOIN curso_secciones s ON s.id=l.seccion_id
    JOIN cursos c ON c.id=s.curso_id
    WHERE l.id=? AND c.instructor_id=?`).get(Number(id), instructorId);
}

function cursoCompleto(id) {
  const row = db.prepare(`${SELECT_RESUMEN} WHERE c.id=?`).get(Number(id));
  if (!row) return null;
  const secciones = db.prepare('SELECT id,titulo,orden FROM curso_secciones WHERE curso_id=? ORDER BY orden,id').all(row.id);
  const lecciones = db.prepare(`SELECT l.* FROM curso_lecciones l
    JOIN curso_secciones s ON s.id=l.seccion_id WHERE s.curso_id=? ORDER BY l.orden,l.id`).all(row.id);
  return {
    ...publico(row),
    secciones: secciones.map(s => ({
      id: s.id,
      titulo: s.titulo,
      orden: s.orden,
      lecciones: lecciones.filter(l => l.seccion_id === s.id).map(l => ({
        id: l.id,
        titulo: l.titulo,
        descripcion: l.descripcion,
        tipo_video: l.tipo_video,
        youtube_video_id: l.youtube_video_id,
        youtube_url: l.youtube_video_id ? `https://www.youtube.com/watch?v=${l.youtube_video_id}` : null,
        archivo_nombre: l.archivo_nombre,
        archivo_tamano: l.archivo_tamano,
        duracion_seg: l.duracion_seg,
        es_preview: !!l.es_preview,
        orden: l.orden
      }))
    }))
  };
}

function validarCurso(b, { parcial = false } = {}) {
  const out = {};
  if (!parcial || b.titulo !== undefined) {
    if (!txtMax(b.titulo, 140) || b.titulo.trim().length < 5)
      throw new ApiError(400, 'El título debe tener entre 5 y 140 caracteres');
    out.titulo = b.titulo.trim();
  }
  if (!parcial || b.resumen !== undefined) {
    if (!txtMax(b.resumen, 300) || b.resumen.trim().length < 15)
      throw new ApiError(400, 'El resumen debe tener entre 15 y 300 caracteres');
    out.resumen = b.resumen.trim();
  }
  if (!parcial || b.descripcion !== undefined) {
    if (!txtMax(b.descripcion, 5000) || b.descripcion.trim().length < 40)
      throw new ApiError(400, 'La descripción debe tener al menos 40 caracteres');
    out.descripcion = b.descripcion.trim();
  }
  if (!parcial || b.categoria_id !== undefined) {
    const cat = db.prepare('SELECT id FROM categorias WHERE id=?').get(entero(b.categoria_id));
    if (!cat) throw new ApiError(400, 'Selecciona una categoría válida');
    out.categoria_id = cat.id;
  }
  if (!parcial || b.precio !== undefined) {
    const precio = numero(b.precio);
    if (precio === null || precio < 0 || precio > 10000) throw new ApiError(400, 'El precio no es válido');
    out.precio = Math.round(precio * 100) / 100;
  }
  if (!parcial || b.nivel !== undefined) {
    if (!NIVELES.includes(b.nivel)) throw new ApiError(400, 'Selecciona un nivel válido');
    out.nivel = b.nivel;
  }
  if (!parcial || b.idioma !== undefined) {
    if (!txtMax(b.idioma, 40)) throw new ApiError(400, 'El idioma es obligatorio');
    out.idioma = b.idioma.trim();
  }
  if (!parcial || b.imagen_url !== undefined) out.imagen_url = urlOpcional(b.imagen_url, 'Imagen de portada');
  return out;
}

router.get('/resumen', asyncHandler(async (req, res) => {
  const perfil = db.prepare('SELECT estado_verificacion,motivo_rechazo FROM perfiles_instructor WHERE usuario_id=?').get(req.user.id);
  res.json({ ...estadisticasInstructor(req.user.id), verificacion: perfil || null });
}));

/* ---------- Validación de pagos por QR ---------- */
// Lista solo compras QR pendientes de los cursos del instructor, sin datos del comprador.
router.get('/pagos-qr', asyncHandler(async (req, res) => {
  res.json(pagosPendientesInstructor(req.user.id));
}));

router.post('/pagos-qr/:id/aprobar', asyncHandler(async (req, res) => {
  res.json(resolverPagoQr(req.params.id, req.user.id, true));
}));

router.post('/pagos-qr/:id/rechazar', asyncHandler(async (req, res) => {
  res.json(resolverPagoQr(req.params.id, req.user.id, false, (req.body || {}).motivo));
}));

router.get('/analitica', asyncHandler(async (req, res) => {
  res.json(analiticaInstructor(req.user.id, { meses: req.query.meses }));
}));

router.get('/cursos', asyncHandler(async (req, res) => {
  const rows = db.prepare(`${SELECT_RESUMEN} WHERE c.instructor_id=? ORDER BY c.id DESC`).all(req.user.id);
  res.json(rows.map(publico));
}));

router.post('/cursos', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const datos = validarCurso({
    titulo: b.titulo,
    resumen: b.resumen || 'Curso en preparación.',
    descripcion: b.descripcion || 'Descripción pendiente de completar por el instructor.',
    categoria_id: b.categoria_id,
    precio: b.precio === undefined ? 0 : b.precio,
    nivel: b.nivel || 'principiante',
    idioma: b.idioma || 'Español',
    imagen_url: b.imagen_url
  });
  const r = db.prepare(`INSERT INTO cursos
    (instructor_id,categoria_id,titulo,slug,resumen,descripcion,precio,nivel,idioma,imagen_url,estado)
    VALUES(?,?,?,?,?,?,?,?,?,?, 'borrador')`)
    .run(req.user.id, datos.categoria_id, datos.titulo, slugUnico(datos.titulo), datos.resumen,
      datos.descripcion, datos.precio, datos.nivel, datos.idioma, datos.imagen_url || null);
  const id = Number(r.lastInsertRowid);
  res.status(201).json({ id, estado: 'borrador', curso: cursoCompleto(id) });
}));

router.get('/cursos/:id', asyncHandler(async (req, res) => {
  const curso = cursoPropio(req.params.id, req.user.id);
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  res.json(cursoCompleto(curso.id));
}));

router.put('/cursos/:id', asyncHandler(async (req, res) => {
  const curso = cursoPropio(req.params.id, req.user.id);
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  if (curso.estado === 'archivado') throw new ApiError(409, 'El curso está archivado');
  const d = validarCurso(req.body || {});
  const reenvio = ['aprobado', 'rechazado'].includes(curso.estado);
  const nuevoEstado = reenvio ? 'pendiente' : curso.estado;
  const slug = curso.titulo !== d.titulo ? slugUnico(d.titulo, curso.id) : curso.slug;
  db.prepare(`UPDATE cursos SET categoria_id=?,titulo=?,slug=?,resumen=?,descripcion=?,precio=?,nivel=?,idioma=?,
    imagen_url=?,estado=?,motivo_rechazo=?,publicado_en=?,actualizado=CURRENT_TIMESTAMP WHERE id=?`)
    .run(d.categoria_id, d.titulo, slug, d.resumen, d.descripcion, d.precio, d.nivel, d.idioma,
      d.imagen_url || null, nuevoEstado, reenvio ? null : curso.motivo_rechazo,
      reenvio ? null : curso.publicado_en, curso.id);
  res.json({ ok: true, estado: nuevoEstado, curso: cursoCompleto(curso.id) });
}));

router.delete('/cursos/:id', asyncHandler(async (req, res) => {
  const curso = cursoPropio(req.params.id, req.user.id);
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  const inscritos = db.prepare('SELECT COUNT(*) n FROM inscripciones WHERE curso_id=?').get(curso.id).n;
  if (inscritos > 0) throw new ApiError(409, 'No puedes eliminar un curso con estudiantes inscritos');
  const archivos = db.prepare(`SELECT l.archivo_path FROM curso_lecciones l
    JOIN curso_secciones s ON s.id=l.seccion_id WHERE s.curso_id=? AND l.archivo_path IS NOT NULL`).all(curso.id);
  db.prepare('DELETE FROM cursos WHERE id=?').run(curso.id);
  archivos.forEach(a => borrarArchivo(a.archivo_path));
  res.json({ ok: true });
}));

router.post('/cursos/:id/enviar-revision', instructorVerificado, asyncHandler(async (req, res) => {
  const curso = cursoPropio(req.params.id, req.user.id);
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  if (curso.estado === 'pendiente') throw new ApiError(409, 'El curso ya está en revisión');
  if (curso.estado === 'archivado') throw new ApiError(409, 'El curso está archivado');
  const secciones = db.prepare('SELECT COUNT(*) n FROM curso_secciones WHERE curso_id=?').get(curso.id).n;
  if (!secciones) throw new ApiError(400, 'Añade al menos una sección antes de enviar el curso');
  const sinVideo = db.prepare(`SELECT COUNT(*) n FROM curso_lecciones l
    JOIN curso_secciones s ON s.id=l.seccion_id
    WHERE s.curso_id=? AND l.tipo_video IS NULL`).get(curso.id).n;
  if (sinVideo > 0) throw new ApiError(400, 'Todas las lecciones deben tener un video de YouTube o un archivo subido');
  const lecciones = db.prepare(`SELECT COUNT(*) n FROM curso_lecciones l
    JOIN curso_secciones s ON s.id=l.seccion_id WHERE s.curso_id=?`).get(curso.id).n;
  if (!lecciones) throw new ApiError(400, 'Añade al menos una lección antes de enviar el curso');
  db.prepare(`UPDATE cursos SET estado='pendiente',motivo_rechazo=NULL,publicado_en=NULL,actualizado=CURRENT_TIMESTAMP WHERE id=?`)
    .run(curso.id);
  res.json({ ok: true, estado: 'pendiente' });
}));

// ---------- Secciones ----------
router.post('/cursos/:id/secciones', asyncHandler(async (req, res) => {
  const curso = cursoPropio(req.params.id, req.user.id);
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  if (!txtMax(req.body && req.body.titulo, 140)) throw new ApiError(400, 'El título de la sección es obligatorio');
  const orden = db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM curso_secciones WHERE curso_id=?').get(curso.id).n;
  const r = db.prepare('INSERT INTO curso_secciones(curso_id,titulo,orden) VALUES(?,?,?)')
    .run(curso.id, req.body.titulo.trim(), orden);
  res.status(201).json({ id: Number(r.lastInsertRowid), titulo: req.body.titulo.trim(), orden });
}));

router.put('/secciones/:id', asyncHandler(async (req, res) => {
  const s = seccionPropia(req.params.id, req.user.id);
  if (!s) throw new ApiError(404, 'Sección no encontrada');
  if (!txtMax(req.body && req.body.titulo, 140)) throw new ApiError(400, 'El título de la sección es obligatorio');
  db.prepare('UPDATE curso_secciones SET titulo=? WHERE id=?').run(req.body.titulo.trim(), s.id);
  res.json({ ok: true });
}));

router.delete('/secciones/:id', asyncHandler(async (req, res) => {
  const s = seccionPropia(req.params.id, req.user.id);
  if (!s) throw new ApiError(404, 'Sección no encontrada');
  const archivos = db.prepare('SELECT archivo_path FROM curso_lecciones WHERE seccion_id=? AND archivo_path IS NOT NULL').all(s.id);
  db.prepare('DELETE FROM curso_secciones WHERE id=?').run(s.id);
  archivos.forEach(a => borrarArchivo(a.archivo_path));
  res.json({ ok: true });
}));

router.put('/cursos/:id/secciones/orden', asyncHandler(async (req, res) => {
  const curso = cursoPropio(req.params.id, req.user.id);
  if (!curso) throw new ApiError(404, 'Curso no encontrado');
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
  const propias = db.prepare('SELECT id FROM curso_secciones WHERE curso_id=?').all(curso.id).map(s => s.id);
  if (ids.length !== propias.length || !ids.every(id => propias.includes(id)))
    throw new ApiError(400, 'El orden enviado no coincide con las secciones del curso');
  db.transaction(() => ids.forEach((id, i) => db.prepare('UPDATE curso_secciones SET orden=? WHERE id=?').run(i, id)))();
  res.json({ ok: true });
}));

// ---------- Lecciones ----------
function datosLeccion(body, actual = null) {
  const titulo = body.titulo !== undefined ? body.titulo : actual && actual.titulo;
  if (!txtMax(titulo, 160) || titulo.trim().length < 3) throw new ApiError(400, 'El título de la lección es obligatorio');
  const descripcion = body.descripcion !== undefined
    ? (txt(body.descripcion) ? body.descripcion.trim().slice(0, 2000) : null)
    : (actual ? actual.descripcion : null);
  const duracion = body.duracion_seg !== undefined
    ? (body.duracion_seg === null || body.duracion_seg === '' ? null : entero(body.duracion_seg))
    : (actual ? actual.duracion_seg : null);
  if (duracion !== null && (duracion < 0 || duracion > 86400)) throw new ApiError(400, 'La duración no es válida');
  const es_preview = body.es_preview !== undefined ? (body.es_preview === true || body.es_preview === 1 || body.es_preview === '1' ? 1 : 0)
    : (actual ? actual.es_preview : 0);
  return { titulo: titulo.trim(), descripcion, duracion_seg: duracion, es_preview };
}

function videoDe(body, actual = null) {
  const tipo = body.tipo_video !== undefined ? body.tipo_video : (actual ? actual.tipo_video : null);
  if (!tipo) return { tipo_video: null, youtube_video_id: null, archivo_path: null };
  if (tipo === 'youtube') {
    const yt = parseYoutube(body.youtube_url || body.youtube_video_id);
    if (!yt && actual && actual.tipo_video === 'youtube' && actual.youtube_video_id
      && body.youtube_url === undefined && body.youtube_video_id === undefined)
      return { tipo_video: 'youtube', youtube_video_id: actual.youtube_video_id, archivo_path: null };
    if (!yt) throw new ApiError(400, 'La URL de YouTube no es válida');
    return { tipo_video: 'youtube', youtube_video_id: yt, archivo_path: null };
  }
  if (tipo === 'archivo') {
    if (actual && actual.archivo_path) return { tipo_video: 'archivo', youtube_video_id: null, archivo_path: actual.archivo_path };
    // La lección se crea primero y el archivo se sube en una petición multipart posterior.
    return { tipo_video: null, youtube_video_id: null, archivo_path: null };
  }
  throw new ApiError(400, 'Tipo de video inválido');
}

router.post('/secciones/:id/lecciones', asyncHandler(async (req, res) => {
  const s = seccionPropia(req.params.id, req.user.id);
  if (!s) throw new ApiError(404, 'Sección no encontrada');
  const d = datosLeccion(req.body || {});
  const v = videoDe(req.body || {});
  const orden = db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM curso_lecciones WHERE seccion_id=?').get(s.id).n;
  const r = db.prepare(`INSERT INTO curso_lecciones
    (seccion_id,titulo,descripcion,tipo_video,youtube_video_id,archivo_path,duracion_seg,es_preview,orden)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(s.id, d.titulo, d.descripcion, v.tipo_video, v.youtube_video_id, v.archivo_path,
      d.duracion_seg, d.es_preview, orden);
  res.status(201).json({ id: Number(r.lastInsertRowid), orden });
}));

router.put('/lecciones/:id', asyncHandler(async (req, res) => {
  const l = leccionPropia(req.params.id, req.user.id);
  if (!l) throw new ApiError(404, 'Lección no encontrada');
  const d = datosLeccion(req.body || {}, l);
  const v = videoDe(req.body || {}, l);
  if (l.archivo_path && v.archivo_path !== l.archivo_path) borrarArchivo(l.archivo_path);
  db.prepare(`UPDATE curso_lecciones SET titulo=?,descripcion=?,tipo_video=?,youtube_video_id=?,archivo_path=?,
    duracion_seg=?,es_preview=?,actualizado=CURRENT_TIMESTAMP WHERE id=?`)
    .run(d.titulo, d.descripcion, v.tipo_video, v.youtube_video_id, v.archivo_path,
      d.duracion_seg, d.es_preview, l.id);
  res.json({ ok: true });
}));

router.delete('/lecciones/:id', asyncHandler(async (req, res) => {
  const l = leccionPropia(req.params.id, req.user.id);
  if (!l) throw new ApiError(404, 'Lección no encontrada');
  db.prepare('DELETE FROM curso_lecciones WHERE id=?').run(l.id);
  if (l.archivo_path) borrarArchivo(l.archivo_path);
  res.json({ ok: true });
}));

router.put('/secciones/:id/lecciones/orden', asyncHandler(async (req, res) => {
  const s = seccionPropia(req.params.id, req.user.id);
  if (!s) throw new ApiError(404, 'Sección no encontrada');
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
  const propias = db.prepare('SELECT id FROM curso_lecciones WHERE seccion_id=?').all(s.id).map(l => l.id);
  if (ids.length !== propias.length || !ids.every(id => propias.includes(id)))
    throw new ApiError(400, 'El orden enviado no coincide con las lecciones de la sección');
  db.transaction(() => ids.forEach((id, i) => db.prepare('UPDATE curso_lecciones SET orden=? WHERE id=?').run(i, id)))();
  res.json({ ok: true });
}));

router.post('/lecciones/:id/video', upload.single('video'), asyncHandler(async (req, res) => {
  const l = leccionPropia(req.params.id, req.user.id);
  if (!l) {
    if (req.file) fs.unlink(req.file.path, () => {});
    throw new ApiError(404, 'Lección no encontrada');
  }
  if (!req.file) throw new ApiError(400, 'Selecciona un archivo de video');
  const ext = req.file.mimetype === 'video/webm' ? '.webm' : '.mp4';
  const nombre = `${crypto.randomUUID()}${ext}`;
  const destino = path.join(VIDEO_DIR, nombre);
  try {
    fs.renameSync(req.file.path, destino);
    const relativo = path.posix.join('videos', nombre);
    db.prepare(`UPDATE curso_lecciones SET tipo_video='archivo',youtube_video_id=NULL,archivo_path=?,
      archivo_nombre=?,archivo_tamano=?,actualizado=CURRENT_TIMESTAMP WHERE id=?`)
      .run(relativo, req.file.originalname, req.file.size, l.id);
    if (l.archivo_path && l.archivo_path !== relativo) borrarArchivo(l.archivo_path);
    res.status(201).json({ ok: true, archivo_nombre: req.file.originalname, archivo_tamano: req.file.size, video_url: `/api/lecciones/${l.id}/video` });
  } catch (err) {
    fs.unlink(destino, () => {});
    throw err;
  }
}));

function borrarArchivo(relativo) {
  if (!relativo) return;
  const absoluto = path.resolve(UPLOAD_DIR, relativo);
  const base = path.resolve(UPLOAD_DIR) + path.sep;
  if (absoluto.startsWith(base)) fs.unlink(absoluto, () => {});
}

module.exports = router;
