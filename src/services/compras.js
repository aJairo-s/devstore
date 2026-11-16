const crypto = require('crypto');
const { db } = require('../db');
const { ApiError } = require('../utils/http');
const { crearNotificacion } = require('./notificaciones');

function metodosPago() {
  return db.prepare('SELECT id,nombre,slug,descripcion,orden FROM metodos_pago WHERE activo=1 ORDER BY orden,id').all();
}

function normalizarIds(valor) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map(Number).filter(n => Number.isInteger(n) && n > 0))];
}

function referencia() {
  return `DS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Texto corto y seguro para el comprobante; nunca datos bancarios completos. */
function detalleSeguro(valor) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return limpio || null;
}

/**
 * Los métodos que dependen de datos del instructor solo están disponibles
 * cuando este ya configuró su cuenta bancaria o su código QR.
 */
function validarDatosCobro(metodo, cursos) {
  if (metodo.slug !== 'qr' && metodo.slug !== 'transferencia') return;
  const ids = [...new Set(cursos.map(c => c.instructor_id))];
  const marcadores = ids.map(() => '?').join(',');
  const filas = db.prepare(`SELECT usuario_id,pago_banco,pago_cuenta,pago_titular,pago_qr_path
    FROM perfiles_instructor WHERE usuario_id IN (${marcadores})`).all(...ids);
  const porId = new Map(filas.map(f => [f.usuario_id, f]));
  const faltan = ids.filter(id => {
    const f = porId.get(id);
    if (!f) return true;
    return metodo.slug === 'qr'
      ? !f.pago_qr_path
      : !(f.pago_banco && f.pago_cuenta && f.pago_titular);
  });
  if (!faltan.length) return;
  throw new ApiError(409, metodo.slug === 'qr'
    ? 'El instructor todavía no ha configurado su código QR para este curso'
    : 'El instructor todavía no ha configurado sus datos de transferencia para este curso');
}

function compraConItems(id) {
  const compra = db.prepare(`SELECT c.*, m.nombre AS metodo_pago, m.slug AS metodo_pago_slug,
      u.nombre AS cliente_nombre, u.apellidos AS cliente_apellidos, u.email AS cliente_email,
      (SELECT p.detalle FROM pagos p WHERE p.compra_id=c.id ORDER BY p.id DESC LIMIT 1) AS pago_detalle,
      (SELECT p.estado FROM pagos p WHERE p.compra_id=c.id ORDER BY p.id DESC LIMIT 1) AS pago_estado,
      (SELECT p.referencia FROM pagos p WHERE p.compra_id=c.id ORDER BY p.id DESC LIMIT 1) AS pago_referencia,
      (SELECT p.motivo_rechazo FROM pagos p WHERE p.compra_id=c.id ORDER BY p.id DESC LIMIT 1) AS pago_motivo_rechazo,
      (SELECT p.verificado_en FROM pagos p WHERE p.compra_id=c.id ORDER BY p.id DESC LIMIT 1) AS pago_verificado_en
    FROM compras c
    LEFT JOIN metodos_pago m ON m.id=c.metodo_pago_id
    JOIN usuarios u ON u.id=c.cliente_id
    WHERE c.id=?`).get(Number(id));
  if (!compra) return null;
  compra.items = db.prepare(`SELECT ci.*, cu.titulo, cu.slug, cu.instructor_id,
      (u.nombre || ' ' || u.apellidos) AS instructor
    FROM compra_items ci
    JOIN cursos cu ON cu.id=ci.curso_id
    JOIN usuarios u ON u.id=cu.instructor_id
    WHERE ci.compra_id=? ORDER BY ci.id`).all(compra.id);
  return {
    ...compra,
    requiere_validacion: compra.metodo_pago_slug === 'qr' && compra.estado === 'pendiente',
    cliente: `${compra.cliente_nombre} ${compra.cliente_apellidos}`.trim()
  };
}

/**
 * Flujo de compra simulado.
 * Tarjeta, PayPal y transferencia se confirman al instante. El pago por QR
 * queda pendiente hasta que el instructor confirma que el dinero llegó.
 * No se realiza ningún cargo real.
 */
function crearCompra(cliente, body) {
  const cursoIds = normalizarIds(body && (body.curso_ids || body.cursos));
  if (!cursoIds.length) throw new ApiError(400, 'Selecciona al menos un curso');
  if (cursoIds.length > 20) throw new ApiError(400, 'No puedes comprar más de 20 cursos a la vez');

  const marcadores = cursoIds.map(() => '?').join(',');
  const cursos = db.prepare(`SELECT id,titulo,slug,precio,instructor_id,estado
    FROM cursos WHERE id IN (${marcadores})`).all(...cursoIds);
  if (cursos.length !== cursoIds.length) throw new ApiError(400, 'Alguno de los cursos no existe');

  const noPublicados = cursos.filter(c => c.estado !== 'aprobado');
  if (noPublicados.length)
    throw new ApiError(409, `Solo puedes comprar cursos publicados: ${noPublicados.map(c => c.titulo).join(', ')}`);

  const inscritos = db.prepare(`SELECT cu.titulo FROM inscripciones i JOIN cursos cu ON cu.id=i.curso_id
    WHERE i.cliente_id=? AND i.curso_id IN (${marcadores})`).all(cliente.id, ...cursoIds);
  if (inscritos.length)
    throw new ApiError(409, `Ya tienes acceso a: ${inscritos.map(i => i.titulo).join(', ')}`);

  // Evita duplicar una compra que ya está esperando validación manual.
  const enRevision = db.prepare(`SELECT DISTINCT cu.titulo
    FROM compras co
    JOIN compra_items ci ON ci.compra_id=co.id
    JOIN cursos cu ON cu.id=ci.curso_id
    WHERE co.cliente_id=? AND co.estado='pendiente' AND ci.curso_id IN (${marcadores})`)
    .all(cliente.id, ...cursoIds);
  if (enRevision.length)
    throw new ApiError(409, `Ya tienes un pago pendiente de validación para: ${enRevision.map(i => i.titulo).join(', ')}`);

  const total = Math.round(cursos.reduce((a, c) => a + Number(c.precio || 0), 0) * 100) / 100;
  let metodo = null;
  if (total > 0) {
    const metodoId = Number(body && body.metodo_pago_id);
    metodo = db.prepare('SELECT * FROM metodos_pago WHERE id=? AND activo=1').get(metodoId);
    if (!metodo) throw new ApiError(400, 'Selecciona un método de pago válido');
    validarDatosCobro(metodo, cursos);
  }

  const requiereValidacion = total > 0 && metodo.slug === 'qr';
  const instructores = [...new Set(cursos.map(c => c.instructor_id))];
  if (requiereValidacion && instructores.length > 1)
    throw new ApiError(400, 'El pago por QR se valida por instructor: compra en una sola operación cursos de un mismo instructor');

  const detallePago = total > 0 ? detalleSeguro(body && body.detalle_pago) : null;

  const ref = referencia();
  const avisos = [];
  let compraId;

  db.transaction(() => {
    const estado = requiereValidacion ? 'pendiente' : 'pagada';
    const compra = db.prepare(`INSERT INTO compras(cliente_id,total,estado,metodo_pago_id,referencia)
      VALUES(?,?,?,?,?)`)
      .run(cliente.id, total, estado, metodo ? metodo.id : null, ref);
    compraId = Number(compra.lastInsertRowid);

    const itemInsert = db.prepare('INSERT INTO compra_items(compra_id,curso_id,precio_unitario) VALUES(?,?,?)');
    const inscInsert = db.prepare('INSERT INTO inscripciones(cliente_id,curso_id,compra_id) VALUES(?,?,?)');
    for (const c of cursos) {
      itemInsert.run(compraId, c.id, c.precio);
      // El acceso solo se crea al confirmar el pago. Con QR lo hará el instructor.
      if (!requiereValidacion) inscInsert.run(cliente.id, c.id, compraId);
    }
    if (total > 0) {
      db.prepare(`INSERT INTO pagos(compra_id,monto,metodo_pago_id,estado,referencia,detalle)
        VALUES(?,?,?,?,?,?)`).run(compraId, total, metodo.id,
          requiereValidacion ? 'pendiente' : 'completado', ref, detallePago);
    }

    const porInstructor = new Map();
    for (const c of cursos) {
      if (!porInstructor.has(c.instructor_id)) porInstructor.set(c.instructor_id, []);
      porInstructor.get(c.instructor_id).push(c);
    }
    for (const [instructorId, propios] of porInstructor) {
      avisos.push([instructorId, requiereValidacion ? {
        tipo: 'venta',
        titulo: 'Pago por QR pendiente de validación',
        mensaje: `Hay un pago por QR por confirmar para: ${propios.map(c => c.titulo).join(', ')}. Revisa que el dinero haya llegado y autoriza el acceso.`,
        enlace: '/instructor.html#pagos-qr'
      } : {
        tipo: 'venta',
        titulo: propios.length === 1 ? 'Nueva venta de tu curso' : `Nuevas ventas: ${propios.length} cursos`,
        mensaje: `Se inscribieron en: ${propios.map(c => c.titulo).join(', ')}.`,
        enlace: '/instructor.html#analitica'
      }]);
    }
    avisos.push([cliente.id, requiereValidacion ? {
      tipo: 'compra',
      titulo: 'Pago por QR en revisión',
      mensaje: `Registramos tu pago para ${cursos.map(c => c.titulo).join(', ')}. El instructor debe confirmar la recepción del dinero antes de habilitar el acceso.`,
      enlace: '/perfil.html#mis-compras'
    } : {
      tipo: 'compra',
      titulo: 'Compra confirmada',
      mensaje: `Ya tienes acceso a ${cursos.map(c => c.titulo).join(', ')}.`,
      enlace: '/perfil.html#mis-cursos'
    }]);
  })();

  // Las notificaciones se emiten fuera de la transacción para no avisar si hubo rollback.
  avisos.forEach(([usuarioId, datos]) => crearNotificacion(usuarioId, datos));

  return compraConItems(compraId);
}

/** Compras con pago por QR pendientes de validación, limitadas a los cursos del instructor. */
function pagosPendientesInstructor(instructorId) {
  const id = Number(instructorId);
  const filas = db.prepare(`
    SELECT co.id AS compra_id, co.referencia, co.total, co.creado,
           m.nombre AS metodo_pago, m.slug AS metodo_pago_slug,
           p.id AS pago_id, p.estado AS pago_estado, p.referencia AS pago_referencia,
           p.detalle AS pago_detalle
    FROM compras co
    JOIN pagos p ON p.compra_id=co.id
    JOIN metodos_pago m ON m.id=co.metodo_pago_id
    WHERE co.estado='pendiente' AND p.estado='pendiente' AND m.slug='qr'
      AND EXISTS (SELECT 1 FROM compra_items ci JOIN cursos c ON c.id=ci.curso_id
                  WHERE ci.compra_id=co.id AND c.instructor_id=?)
      AND NOT EXISTS (SELECT 1 FROM compra_items ci JOIN cursos c ON c.id=ci.curso_id
                  WHERE ci.compra_id=co.id AND c.instructor_id<>?)
    ORDER BY co.creado ASC, co.id ASC`).all(id, id);
  const items = db.prepare(`SELECT ci.curso_id, c.titulo, c.slug, ci.precio_unitario AS precio
    FROM compra_items ci JOIN cursos c ON c.id=ci.curso_id
    WHERE ci.compra_id=? ORDER BY ci.id`);
  return filas.map(f => ({ ...f, items: items.all(f.compra_id) }));
}

/**
 * Aprueba o rechaza un pago por QR. Solo el instructor de los cursos puede
 * resolverlo y nunca recibe datos personales del comprador.
 */
function resolverPagoQr(compraId, instructorId, aprobar, motivo = null) {
  const compra = db.prepare(`
    SELECT co.*, m.slug AS metodo_pago_slug,
           p.id AS pago_id, p.estado AS pago_estado
    FROM compras co
    JOIN metodos_pago m ON m.id=co.metodo_pago_id
    JOIN pagos p ON p.compra_id=co.id
    WHERE co.id=?`).get(Number(compraId));
  if (!compra || compra.metodo_pago_slug !== 'qr')
    throw new ApiError(404, 'Pago por QR no encontrado');

  const items = db.prepare(`SELECT ci.curso_id, c.titulo, c.instructor_id
    FROM compra_items ci JOIN cursos c ON c.id=ci.curso_id
    WHERE ci.compra_id=? ORDER BY ci.id`).all(compra.id);
  // Se oculta la existencia del pago a instructores ajenos.
  if (!items.length || items.some(i => i.instructor_id !== Number(instructorId)))
    throw new ApiError(404, 'Pago por QR no encontrado');

  if (compra.estado !== 'pendiente' || compra.pago_estado !== 'pendiente')
    throw new ApiError(409, 'Este pago ya fue procesado');

  const motivoLimpio = typeof motivo === 'string'
    ? motivo.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
    : '';
  if (!aprobar && motivoLimpio.length > 300)
    throw new ApiError(400, 'El motivo es demasiado largo');

  if (aprobar) {
    db.transaction(() => {
      const cambiado = db.prepare(`UPDATE compras SET estado='pagada', actualizado=CURRENT_TIMESTAMP
        WHERE id=? AND estado='pendiente'`).run(compra.id);
      if (!cambiado.changes) throw new ApiError(409, 'Este pago ya fue procesado');
      db.prepare(`UPDATE pagos SET estado='completado', verificado_por=?, verificado_en=CURRENT_TIMESTAMP,
          motivo_rechazo=NULL WHERE id=? AND estado='pendiente'`).run(instructorId, compra.pago_id);
      const inscribir = db.prepare('INSERT OR IGNORE INTO inscripciones(cliente_id,curso_id,compra_id) VALUES(?,?,?)');
      for (const item of items) inscribir.run(compra.cliente_id, item.curso_id, compra.id);
    })();
    crearNotificacion(compra.cliente_id, {
      tipo: 'compra',
      titulo: 'Pago por QR confirmado',
      mensaje: `El instructor confirmó tu pago. Ya tienes acceso a ${items.map(i => i.titulo).join(', ')}.`,
      enlace: '/perfil.html#mis-cursos'
    });
    return { ok: true, compra_id: compra.id, estado: 'pagada' };
  }

  db.transaction(() => {
    const cambiado = db.prepare(`UPDATE compras SET estado='cancelada', actualizado=CURRENT_TIMESTAMP
      WHERE id=? AND estado='pendiente'`).run(compra.id);
    if (!cambiado.changes) throw new ApiError(409, 'Este pago ya fue procesado');
    db.prepare(`UPDATE pagos SET estado='fallido', verificado_por=?, verificado_en=CURRENT_TIMESTAMP,
        motivo_rechazo=? WHERE id=? AND estado='pendiente'`)
      .run(instructorId, motivoLimpio || 'El instructor no pudo confirmar la recepción del pago.', compra.pago_id);
  })();
  crearNotificacion(compra.cliente_id, {
    tipo: 'compra',
    titulo: 'Pago por QR rechazado',
    mensaje: motivoLimpio
      ? `El instructor no pudo confirmar tu pago: ${motivoLimpio}`
      : 'El instructor no pudo confirmar la recepción del pago. Puedes intentarlo de nuevo o contactar con el instructor.',
    enlace: '/perfil.html#mis-compras'
  });
  return { ok: true, compra_id: compra.id, estado: 'cancelada' };
}

function compraDeCliente(id, usuario) {
  const compra = compraConItems(id);
  if (!compra) throw new ApiError(404, 'Compra no encontrada');
  if (usuario.rol !== 'administrador' && compra.cliente_id !== usuario.id)
    throw new ApiError(403, 'No puedes consultar esta compra');
  return compra;
}

module.exports = { metodosPago, crearCompra, compraDeCliente, compraConItems };
