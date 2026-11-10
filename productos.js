// Sprint 2 - Gestión de productos/servicios (HU-01, HU-02, HU-03)
// Cada comportamiento responde a una spec de specs/SPEC-sprint2.md
module.exports = (app, db, auth, rol) => {
  db.exec(`CREATE TABLE IF NOT EXISTS productos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ofertante_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    precio REAL NOT NULL CHECK(precio > 0),
    categoria TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('fisico','digital','curso')),
    nivel TEXT CHECK(nivel IN ('principiante','intermedio','avanzado')),
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobado','rechazado')),
    motivo_rechazo TEXT,
    creado TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK((tipo = 'curso') = (nivel IS NOT NULL)))`);

  const TIPOS = ['fisico', 'digital', 'curso'];
  const NIVELES = ['principiante', 'intermedio', 'avanzado'];
  // Qué tipo puede publicar cada rol (documento de visión, 3.2)
  const PERMITIDOS = { vendedor: ['fisico', 'digital'], instructor: ['curso'] };
  const CRITICOS = ['titulo', 'descripcion', 'precio', 'categoria', 'tipo', 'nivel'];
  const txt = s => typeof s === 'string' && s.trim().length > 0;

  // Devuelve datos limpios o null si son inválidos
  const limpiar = b => {
    if (!b || !txt(b.titulo) || !txt(b.descripcion) || !txt(b.categoria) || !TIPOS.includes(b.tipo)) return null;
    const precio = typeof b.precio === 'number' ? b.precio : NaN;
    const stock = b.stock === undefined ? 0 : b.stock;
    if (!Number.isFinite(precio) || precio <= 0) return null;
    if (!Number.isInteger(stock) || stock < 0) return null;
    let nivel = null;
    if (b.tipo === 'curso') {
      if (!NIVELES.includes(b.nivel)) return null;   // el curso exige nivel
      nivel = b.nivel;
    }
    return { titulo: b.titulo.trim(), descripcion: b.descripcion.trim(), precio,
             categoria: b.categoria.trim(), tipo: b.tipo, nivel, stock };
  };
  const ofertante = rol('vendedor', 'instructor');
  const byId = id => db.prepare('SELECT * FROM productos WHERE id=?').get(Number(id));

  // HU-01 Registro (SPEC-01.x)
  app.post('/api/productos', auth, ofertante, (req, res) => {
    const d = limpiar(req.body);
    if (!d) return res.status(400).json({ error: 'Datos incompletos o inválidos' });
    if (!PERMITIDOS[req.session.rol].includes(d.tipo))
      return res.status(403).json({ error: `Un ${req.session.rol} no puede publicar tipo "${d.tipo}"` });
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO productos(ofertante_id,titulo,descripcion,precio,categoria,tipo,nivel,stock)
       VALUES(?,?,?,?,?,?,?,?)`)
      .run(req.session.uid, d.titulo, d.descripcion, d.precio, d.categoria, d.tipo, d.nivel, d.stock);
    res.status(201).json({ id: lastInsertRowid, estado: 'pendiente', ofertante_id: req.session.uid });
  });

  app.get('/api/productos/mios', auth, ofertante, (req, res) =>
    res.json(db.prepare('SELECT * FROM productos WHERE ofertante_id=? ORDER BY id DESC').all(req.session.uid)));

  // HU-02 Edición (SPEC-02.x): cambio crítico => vuelve a pendiente
  app.put('/api/productos/:id', auth, ofertante, (req, res) => {
    const p = byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    if (p.ofertante_id !== req.session.uid) return res.status(403).json({ error: 'Sin permisos' });
    const d = limpiar(req.body);
    if (!d) return res.status(400).json({ error: 'Datos incompletos o inválidos' });
    if (!PERMITIDOS[req.session.rol].includes(d.tipo))
      return res.status(403).json({ error: `Un ${req.session.rol} no puede publicar tipo "${d.tipo}"` });
    const critico = CRITICOS.some(k => d[k] !== p[k]);
    const estado = critico ? 'pendiente' : p.estado;
    const motivo = critico ? null : p.motivo_rechazo;
    db.prepare(`UPDATE productos SET titulo=?,descripcion=?,precio=?,categoria=?,tipo=?,nivel=?,stock=?,
                estado=?,motivo_rechazo=?,actualizado=CURRENT_TIMESTAMP WHERE id=?`)
      .run(d.titulo, d.descripcion, d.precio, d.categoria, d.tipo, d.nivel, d.stock, estado, motivo, p.id);
    res.json({ id: p.id, estado });
  });

  app.delete('/api/productos/:id', auth, ofertante, (req, res) => {
    const p = byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    if (p.ofertante_id !== req.session.uid) return res.status(403).json({ error: 'Sin permisos' });
    db.prepare('DELETE FROM productos WHERE id=?').run(p.id);
    res.json({ ok: true });
  });

  // HU-03 Validación (SPEC-03.x)
  const admin = [auth, rol('administrador')];
  app.get('/api/admin/productos', admin, (req, res) => {
    const e = req.query.estado;
    const sql = `SELECT p.*, u.nombre AS ofertante FROM productos p JOIN usuarios u ON u.id=p.ofertante_id`;
    res.json(['pendiente', 'aprobado', 'rechazado'].includes(e)
      ? db.prepare(sql + ' WHERE p.estado=? ORDER BY p.id').all(e)
      : db.prepare(sql + ' ORDER BY p.id').all());
  });

  const validar = (estado) => (req, res) => {
    const p = byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    if (p.estado !== 'pendiente') return res.status(409).json({ error: 'Solo se validan productos pendientes' });
    let motivo = null;
    if (estado === 'rechazado') {
      motivo = txt(req.body && req.body.motivo) ? req.body.motivo.trim() : null;
      if (!motivo) return res.status(400).json({ error: 'El motivo de rechazo es obligatorio' });
    }
    db.prepare('UPDATE productos SET estado=?,motivo_rechazo=?,actualizado=CURRENT_TIMESTAMP WHERE id=?')
      .run(estado, motivo, p.id);
    res.json({ id: p.id, estado });
  };
  app.post('/api/admin/productos/:id/aprobar', admin, validar('aprobado'));
  app.post('/api/admin/productos/:id/rechazar', admin, validar('rechazado'));

  // Catálogo público: solo aprobados (SPEC-03.7)
  app.get('/api/productos', (req, res) =>
    res.json(db.prepare(`SELECT p.id,p.titulo,p.descripcion,p.precio,p.categoria,p.tipo,p.nivel,p.stock,p.estado,
        u.nombre AS ofertante FROM productos p JOIN usuarios u ON u.id=p.ofertante_id
        WHERE p.estado='aprobado' ORDER BY p.id DESC`).all()));
};
