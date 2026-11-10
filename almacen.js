// Sprint 3 — Almacén / inventario (HU-07)
module.exports = (app, db, auth, rol) => {
  // La tabla `movimientos` la crea pedidos.js (mismo ciclo de vida); se asegura aquí por si acaso.
  db.exec(`CREATE TABLE IF NOT EXISTS movimientos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK(tipo IN ('entrada','salida','ajuste')),
    cantidad INTEGER NOT NULL CHECK(cantidad > 0),
    motivo TEXT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado TEXT DEFAULT CURRENT_TIMESTAMP)`);

  const ofertante = rol('vendedor', 'instructor');
  const admin = [auth, rol('administrador')];

  // Alcance: admin = todo; ofertante = solo sus productos
  const inventarioSql = (adminMode) => adminMode
    ? `SELECT p.id,p.titulo,p.tipo,p.stock,p.estado,p.categoria,u.nombre AS ofertante,
              CASE WHEN p.stock<=5 THEN 1 ELSE 0 END AS stock_bajo
       FROM productos p JOIN usuarios u ON u.id=p.ofertante_id ORDER BY p.stock ASC,p.id`
    : `SELECT p.id,p.titulo,p.tipo,p.stock,p.estado,p.categoria,u.nombre AS ofertante,
              CASE WHEN p.stock<=5 THEN 1 ELSE 0 END AS stock_bajo
       FROM productos p JOIN usuarios u ON u.id=p.ofertante_id
       WHERE p.ofertante_id=? ORDER BY p.stock ASC,p.id`;

  const movimientosSql = (adminMode) => adminMode
    ? `SELECT m.*,p.titulo FROM movimientos m JOIN productos p ON p.id=m.producto_id
       ORDER BY m.id DESC LIMIT 200`
    : `SELECT m.*,p.titulo FROM movimientos m JOIN productos p ON p.id=m.producto_id
       WHERE p.ofertante_id=? ORDER BY m.id DESC LIMIT 200`;

  // GET /api/almacen — admin: todo; ofertante: su inventario
  app.get('/api/almacen', auth, (req, res) => {
    const esAdmin = req.session.rol === 'administrador';
    if (!esAdmin && !['vendedor', 'instructor'].includes(req.session.rol))
      return res.status(403).json({ error: 'Sin permisos' });
    res.json(esAdmin
      ? db.prepare(inventarioSql(true)).all()
      : db.prepare(inventarioSql(false)).all(req.session.uid));
  });

  // POST /api/almacen/entrada — ofertante registra recepción de stock
  app.post('/api/almacen/entrada', auth, ofertante, (req, res) => {
    const producto_id = Number(req.body && req.body.producto_id);
    const cantidad = req.body && req.body.cantidad;
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : null;
    if (!Number.isInteger(cantidad) || cantidad <= 0)
      return res.status(400).json({ error: 'Cantidad debe ser un entero > 0' });
    const p = db.prepare('SELECT * FROM productos WHERE id=?').get(producto_id);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    if (p.ofertante_id !== req.session.uid) return res.status(403).json({ error: 'Producto ajeno' });
    db.transaction(() => {
      db.prepare('UPDATE productos SET stock=stock+?,actualizado=CURRENT_TIMESTAMP WHERE id=?')
        .run(cantidad, producto_id);
      db.prepare('INSERT INTO movimientos(producto_id,tipo,cantidad,motivo,usuario_id) VALUES(?,?,?,?,?)')
        .run(producto_id, 'entrada', cantidad, motivo || 'Entrada manual', req.session.uid);
    })();
    const stock = db.prepare('SELECT stock FROM productos WHERE id=?').get(producto_id).stock;
    res.status(201).json({ producto_id, stock });
  });

  // GET /api/almacen/movimientos — historial con el mismo alcance
  app.get('/api/almacen/movimientos', auth, (req, res) => {
    const esAdmin = req.session.rol === 'administrador';
    if (!esAdmin && !['vendedor', 'instructor'].includes(req.session.rol))
      return res.status(403).json({ error: 'Sin permisos' });
    res.json(esAdmin
      ? db.prepare(movimientosSql(true)).all()
      : db.prepare(movimientosSql(false)).all(req.session.uid));
  });
};
