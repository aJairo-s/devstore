const { db } = require('../db');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesClave(fecha) {
  return String(fecha || '').slice(0, 7);
}

function etiquetaMes(clave) {
  const [anio, mes] = clave.split('-');
  return `${MESES[Number(mes) - 1] || mes} ${anio}`;
}

function redondear(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** métricas agregadas de un instructor. Nunca incluye datos de compradores. */
function analiticaInstructor(instructorId, { meses = 6 } = {}) {
  const id = Number(instructorId);
  const ventas = db.prepare(`
    SELECT ci.curso_id, ci.precio_unitario AS precio, co.creado, co.id AS compra_id,
           COALESCE(m.nombre, 'Sin método') AS metodo
    FROM compra_items ci
    JOIN compras co ON co.id = ci.compra_id
    JOIN cursos c ON c.id = ci.curso_id
    LEFT JOIN metodos_pago m ON m.id = co.metodo_pago_id
    WHERE c.instructor_id = ? AND co.estado = 'pagada'
    ORDER BY co.creado ASC, ci.id ASC`).all(id);

  const cursos = db.prepare(`
    SELECT c.id, c.titulo, c.slug, c.estado, c.precio,
           (SELECT COUNT(*) FROM inscripciones i WHERE i.curso_id=c.id) AS estudiantes,
           (SELECT COUNT(*) FROM foro_hilos f WHERE f.curso_id=c.id) AS hilos,
           (SELECT COUNT(*) FROM foro_respuestas fr
              JOIN foro_hilos f ON f.id=fr.hilo_id WHERE f.curso_id=c.id) AS respuestas
    FROM cursos c WHERE c.instructor_id=? ORDER BY c.id DESC`).all(id);

  const estudiantes = db.prepare(`
    SELECT COUNT(DISTINCT i.cliente_id) n
    FROM inscripciones i JOIN cursos c ON c.id=i.curso_id
    WHERE c.instructor_id=?`).get(id).n;

  const ingresos = redondear(ventas.reduce((a, v) => a + Number(v.precio || 0), 0));
  const totalVentas = ventas.length;

  // Serie de los últimos N meses, rellenando los meses sin ventas.
  const n = Math.min(24, Math.max(1, Number(meses) || 6));
  const ahora = new Date();
  const claves = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1));
    claves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const porMes = new Map(claves.map(c => [c, { ingresos: 0, ventas: 0 }]));
  for (const v of ventas) {
    const clave = mesClave(v.creado);
    const fila = porMes.get(clave);
    if (!fila) continue;
    fila.ingresos += Number(v.precio || 0);
    fila.ventas += 1;
  }
  const serie = claves.map(clave => ({
    mes: clave,
    etiqueta: etiquetaMes(clave),
    ingresos: redondear(porMes.get(clave).ingresos),
    ventas: porMes.get(clave).ventas
  }));

  const porCurso = cursos.map(c => {
    const propias = ventas.filter(v => v.curso_id === c.id);
    return {
      id: c.id,
      titulo: c.titulo,
      slug: c.slug,
      estado: c.estado,
      precio: c.precio,
      estudiantes: c.estudiantes,
      ingresos: redondear(propias.reduce((a, v) => a + Number(v.precio || 0), 0)),
      ventas: propias.length,
      hilos: c.hilos,
      respuestas: c.respuestas
    };
  }).sort((a, b) => b.ingresos - a.ingresos || b.estudiantes - a.estudiantes);

  const metodos = new Map();
  for (const v of ventas) {
    const fila = metodos.get(v.metodo) || { metodo: v.metodo, ingresos: 0, ventas: 0 };
    fila.ingresos += Number(v.precio || 0);
    fila.ventas += 1;
    metodos.set(v.metodo, fila);
  }
  const porMetodo = [...metodos.values()]
    .map(m => ({ ...m, ingresos: redondear(m.ingresos) }))
    .sort((a, b) => b.ingresos - a.ingresos);

  const tituloPorCurso = new Map(cursos.map(c => [c.id, c.titulo]));
  const recientes = ventas.slice(-8).reverse().map(v => ({
    curso: tituloPorCurso.get(v.curso_id) || 'Curso',
    fecha: v.creado,
    precio: v.precio,
    metodo: v.metodo
  }));

  return {
    resumen: {
      ingresos,
      ventas: totalVentas,
      estudiantes,
      ticket_medio: totalVentas ? redondear(ingresos / totalVentas) : 0,
      cursos_total: cursos.length,
      cursos_publicados: cursos.filter(c => c.estado === 'aprobado').length,
      hilos: cursos.reduce((a, c) => a + c.hilos, 0),
      respuestas: cursos.reduce((a, c) => a + c.respuestas, 0)
    },
    serie,
    por_curso: porCurso,
    por_metodo: porMetodo,
    recientes,
    generado: new Date().toISOString()
  };
}

module.exports = { analiticaInstructor, redondear };
