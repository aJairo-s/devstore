const { db } = require('../db');
const { slugify } = require('../utils/slug');
const { ApiError } = require('../utils/http');

const CAMPOS_RESUMEN = `
  c.id, c.instructor_id, c.categoria_id, c.titulo, c.slug, c.resumen, c.descripcion,
  c.precio, c.nivel, c.idioma, c.imagen_url, c.estado, c.motivo_rechazo,
  c.publicado_en, c.creado, c.actualizado,
  cat.nombre AS categoria, cat.slug AS categoria_slug, cat.icono AS categoria_icono,
  u.nombre AS instructor_nombre, u.apellidos AS instructor_apellidos,
  (SELECT COUNT(*) FROM curso_lecciones l
     JOIN curso_secciones s ON s.id = l.seccion_id
     WHERE s.curso_id = c.id) AS lecciones,
  (SELECT COALESCE(SUM(l.duracion_seg), 0) FROM curso_lecciones l
     JOIN curso_secciones s ON s.id = l.seccion_id
     WHERE s.curso_id = c.id) AS duracion_seg,
  (SELECT COUNT(*) FROM inscripciones i WHERE i.curso_id = c.id) AS estudiantes`;

const SELECT_RESUMEN = `
  SELECT ${CAMPOS_RESUMEN}
  FROM cursos c
  JOIN categorias cat ON cat.id = c.categoria_id
  JOIN usuarios u ON u.id = c.instructor_id`;

const ORDENES = {
  nuevo: 'c.publicado_en DESC, c.id DESC',
  precio_asc: 'c.precio ASC, c.id DESC',
  precio_desc: 'c.precio DESC, c.id DESC',
  az: 'c.titulo COLLATE NOCASE ASC',
  populares: 'estudiantes DESC, c.id DESC'
};

function instructorNombre(row) {
  return `${row.instructor_nombre || ''} ${row.instructor_apellidos || ''}`.trim();
}

function publico(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    resumen: row.resumen,
    descripcion: row.descripcion,
    precio: row.precio,
    nivel: row.nivel,
    idioma: row.idioma,
    imagen_url: row.imagen_url,
    estado: row.estado,
    motivo_rechazo: row.motivo_rechazo,
    publicado_en: row.publicado_en,
    categoria_id: row.categoria_id,
    categoria: { nombre: row.categoria, slug: row.categoria_slug, icono: row.categoria_icono },
    instructor: { id: row.instructor_id, nombre: instructorNombre(row) },
    lecciones: row.lecciones,
    duracion_seg: row.duracion_seg,
    estudiantes: row.estudiantes
  };
}

function listarCursos(filtros = {}) {
  const where = ["c.estado = 'aprobado'"];
  const params = [];
  if (filtros.q) {
    where.push('(c.titulo LIKE ? OR c.resumen LIKE ? OR c.descripcion LIKE ? OR cat.nombre LIKE ? OR (u.nombre || \' \' || u.apellidos) LIKE ?)');
    const like = `%${String(filtros.q).trim()}%`;
    params.push(like, like, like, like, like);
  }
  if (filtros.categoria) {
    where.push('cat.slug = ?');
    params.push(filtros.categoria);
  }
  if (filtros.nivel) {
    where.push('c.nivel = ?');
    params.push(filtros.nivel);
  }
  if (filtros.precio_max !== null && filtros.precio_max !== undefined) {
    where.push('c.precio <= ?');
    params.push(filtros.precio_max);
  }
  if (filtros.gratis) where.push('c.precio = 0');
  const orden = ORDENES[filtros.orden] || ORDENES.nuevo;
  const limit = Math.min(100, Math.max(1, Number(filtros.limit) || 50));
  const offset = Math.max(0, Number(filtros.offset) || 0);
  const sql = `${SELECT_RESUMEN} WHERE ${where.join(' AND ')} ORDER BY ${orden} LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset).map(publico);
}

function cursoPorSlug(slug) {
  return db.prepare(`${SELECT_RESUMEN} WHERE c.slug = ? AND c.estado = 'aprobado'`).get(slug);
}

function cursoPorId(id) {
  return db.prepare(`${SELECT_RESUMEN} WHERE c.id = ?`).get(Number(id));
}

function tieneAcceso(usuario, cursoId) {
  if (!usuario) return false;
  const curso = db.prepare('SELECT id,instructor_id,precio FROM cursos WHERE id=?').get(Number(cursoId));
  if (!curso) return false;
  if (usuario.rol === 'administrador') return true;
  if (usuario.rol === 'instructor' && curso.instructor_id === usuario.id) return true;
  // Todo cliente debe inscribirse, incluso en cursos gratuitos, antes de ver el contenido.
  return !!db.prepare('SELECT 1 FROM inscripciones WHERE cliente_id=? AND curso_id=?')
    .get(usuario.id, curso.id);
}

function curriculo(cursoId) {
  const secciones = db.prepare('SELECT id,titulo,orden FROM curso_secciones WHERE curso_id=? ORDER BY orden,id')
    .all(Number(cursoId));
  const lecciones = db.prepare(`
    SELECT l.id, l.seccion_id, l.titulo, l.descripcion, l.duracion_seg, l.es_preview,
           l.tipo_video, l.orden
    FROM curso_lecciones l
    JOIN curso_secciones s ON s.id = l.seccion_id
    WHERE s.curso_id = ?
    ORDER BY l.orden, l.id`).all(Number(cursoId));
  return secciones.map(s => ({
    id: s.id,
    titulo: s.titulo,
    lecciones: lecciones.filter(l => l.seccion_id === s.id).map(l => ({
      id: l.id,
      titulo: l.titulo,
      descripcion: l.descripcion,
      duracion_seg: l.duracion_seg,
      es_preview: !!l.es_preview,
      tipo_video: l.tipo_video,
      tiene_video: !!l.tipo_video
    }))
  }));
}

function compraPendienteDeCurso(clienteId, cursoId) {
  if (!clienteId) return null;
  return db.prepare(`
    SELECT co.id, co.referencia, co.total, co.creado,
           m.slug AS metodo_pago_slug, m.nombre AS metodo_pago
    FROM compras co
    JOIN compra_items ci ON ci.compra_id=co.id
    LEFT JOIN metodos_pago m ON m.id=co.metodo_pago_id
    WHERE co.cliente_id=? AND ci.curso_id=? AND co.estado='pendiente'
    ORDER BY co.id DESC LIMIT 1`).get(clienteId, Number(cursoId)) || null;
}

function detalleCurso(slug, usuario) {
  const row = cursoPorSlug(slug);
  if (!row) return null;
  const acceso = tieneAcceso(usuario, row.id);
  const pendiente = usuario && usuario.rol === 'cliente'
    ? compraPendienteDeCurso(usuario.id, row.id)
    : null;
  return {
    ...publico(row),
    id: row.id,
    instructor_id: row.instructor_id,
    acceso_completo: acceso,
    pago_pendiente: pendiente,
    secciones: curriculo(row.id)
  };
}

function leccionPorId(id) {
  return db.prepare(`
    SELECT l.*, s.curso_id, c.instructor_id, c.estado AS curso_estado, c.titulo AS curso_titulo, c.slug AS curso_slug
    FROM curso_lecciones l
    JOIN curso_secciones s ON s.id = l.seccion_id
    JOIN cursos c ON c.id = s.curso_id
    WHERE l.id = ?`).get(Number(id));
}

function estaInscrito(usuario, cursoId) {
  if (!usuario || usuario.rol !== 'cliente') return false;
  return !!db.prepare('SELECT 1 FROM inscripciones WHERE cliente_id=? AND curso_id=?')
    .get(usuario.id, Number(cursoId));
}

function puedeVerLeccion(usuario, leccion) {
  if (!leccion) return false;
  if (!usuario) return false;
  if (usuario.rol === 'administrador') return true;
  if (usuario.rol === 'instructor' && usuario.id === leccion.instructor_id) return true;
  // Ningún video es visible sin inscripción, ni siquiera si está marcado como vista previa.
  if (leccion.curso_estado === 'aprobado') return tieneAcceso(usuario, leccion.curso_id);
  // Quien ya compró el curso conserva el acceso aunque el instructor lo reenvíe a revisión.
  return estaInscrito(usuario, leccion.curso_id);
}

function datosLeccion(usuario, id) {
  const leccion = leccionPorId(id);
  if (!leccion) throw new ApiError(404, 'Lección no encontrada');
  if (!puedeVerLeccion(usuario, leccion)) throw new ApiError(403, 'Necesitas acceso al curso para ver esta lección');
  return {
    id: leccion.id,
    titulo: leccion.titulo,
    descripcion: leccion.descripcion,
    duracion_seg: leccion.duracion_seg,
    es_preview: !!leccion.es_preview,
    tipo_video: leccion.tipo_video,
    youtube_video_id: leccion.tipo_video === 'youtube' ? leccion.youtube_video_id : null,
    video_url: leccion.tipo_video === 'archivo' ? `/api/lecciones/${leccion.id}/video` : null,
    curso: { id: leccion.curso_id, titulo: leccion.curso_titulo, slug: leccion.curso_slug }
  };
}

function misCursos(clienteId) {
  return db.prepare(`
    SELECT ${CAMPOS_RESUMEN}, i.creado AS inscrito_en
    FROM cursos c
    JOIN categorias cat ON cat.id = c.categoria_id
    JOIN usuarios u ON u.id = c.instructor_id
    JOIN inscripciones i ON i.curso_id = c.id
    WHERE i.cliente_id = ?
    ORDER BY i.creado DESC`).all(clienteId).map(row => ({ ...publico(row), inscrito_en: row.inscrito_en }));
}

function estadisticasInstructor(instructorId) {
  const estados = db.prepare('SELECT estado, COUNT(*) n FROM cursos WHERE instructor_id=? GROUP BY estado').all(instructorId);
  const porEstado = Object.fromEntries(estados.map(e => [e.estado, e.n]));
  const cursos = db.prepare(`
    SELECT c.id, c.titulo, c.estado, c.precio,
           (SELECT COUNT(*) FROM inscripciones i WHERE i.curso_id=c.id) AS estudiantes,
           (SELECT COALESCE(SUM(ci.precio_unitario),0)
              FROM compra_items ci JOIN compras co ON co.id=ci.compra_id
              WHERE ci.curso_id=c.id AND co.estado='pagada') AS ingresos
    FROM cursos c WHERE c.instructor_id=? ORDER BY c.id DESC`).all(instructorId);
  return {
    cursos: estados.reduce((a, e) => a + e.n, 0),
    publicados: porEstado.aprobado || 0,
    pendientes: porEstado.pendiente || 0,
    borradores: porEstado.borrador || 0,
    rechazados: porEstado.rechazado || 0,
    estudiantes: cursos.reduce((a, c) => a + c.estudiantes, 0),
    ingresos: Math.round(cursos.reduce((a, c) => a + c.ingresos, 0) * 100) / 100,
    detalle: cursos.map(c => ({
      id: c.id, titulo: c.titulo, estado: c.estado, precio: c.precio,
      estudiantes: c.estudiantes, ingresos: Math.round(c.ingresos * 100) / 100
    }))
  };
}

function comprasDeCliente(clienteId) {
  const compras = db.prepare(`
    SELECT c.*, m.nombre AS metodo_pago, m.slug AS metodo_pago_slug,
      (SELECT p.motivo_rechazo FROM pagos p WHERE p.compra_id=c.id ORDER BY p.id DESC LIMIT 1) AS pago_motivo_rechazo
    FROM compras c LEFT JOIN metodos_pago m ON m.id=c.metodo_pago_id
    WHERE c.cliente_id=? ORDER BY c.id DESC`).all(clienteId);
  const items = db.prepare('SELECT ci.*, cu.titulo, cu.slug FROM compra_items ci JOIN cursos cu ON cu.id=ci.curso_id WHERE ci.compra_id=?');
  return compras.map(c => ({ ...c, items: items.all(c.id) }));
}

function adminCompras() {
  const compras = db.prepare(`
    SELECT c.*, m.nombre AS metodo_pago, u.nombre AS cliente_nombre, u.apellidos AS cliente_apellidos, u.email AS cliente_email
    FROM compras c
    LEFT JOIN metodos_pago m ON m.id=c.metodo_pago_id
    JOIN usuarios u ON u.id=c.cliente_id
    ORDER BY c.id DESC`).all();
  const items = db.prepare(`
    SELECT ci.*, cu.titulo, cu.slug, ins.nombre AS instructor
    FROM compra_items ci JOIN cursos cu ON cu.id=ci.curso_id
    JOIN usuarios ins ON ins.id=cu.instructor_id
    WHERE ci.compra_id=?`);
  return compras.map(c => ({
    ...c,
    cliente: `${c.cliente_nombre} ${c.cliente_apellidos}`.trim(),
    items: items.all(c.id)
  }));
}

function slugUnico(titulo, excluirId = null) {
  const base = slugify(titulo);
  let slug = base;
  let n = 2;
  while (true) {
    const row = db.prepare('SELECT id FROM cursos WHERE slug=?').get(slug);
    if (!row || (excluirId && row.id === Number(excluirId))) return slug;
    slug = `${base}-${n++}`;
  }
}

module.exports = {
  SELECT_RESUMEN, publico, instructorNombre, listarCursos, cursoPorSlug, cursoPorId,
  tieneAcceso, estaInscrito, curriculo, detalleCurso, leccionPorId, puedeVerLeccion, datosLeccion,
  misCursos, estadisticasInstructor, comprasDeCliente, adminCompras, slugUnico
};
