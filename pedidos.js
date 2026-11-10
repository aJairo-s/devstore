// Sprint 3 — Ecommerce (HU-04), Cobros (HU-05) y Distribución (HU-06)
module.exports = (app, db, auth, rol) => {
  db.exec(`CREATE TABLE IF NOT EXISTS pedidos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    direccion TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0 CHECK(total >= 0),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','pagado','cancelado','entregado')),
    creado TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS pedido_detalles(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL CHECK(cantidad > 0),
    precio_unitario REAL NOT NULL CHECK(precio_unitario > 0));
  CREATE TABLE IF NOT EXISTS pagos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    monto REAL NOT NULL CHECK(monto > 0),
    metodo TEXT NOT NULL CHECK(metodo IN ('tarjeta','transferencia','paypal')),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','completado','fallido')),
    referencia TEXT,
    creado TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS envios(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    destino TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'preparacion' CHECK(estado IN ('preparacion','en_transito','entregado')),
    tracking TEXT UNIQUE,
    creado TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS movimientos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK(tipo IN ('entrada','salida','ajuste')),
    cantidad INTEGER NOT NULL CHECK(cantidad > 0),
    motivo TEXT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado TEXT DEFAULT CURRENT_TIMESTAMP)`);

  const METODOS = ['tarjeta', 'transferencia', 'paypal'];
  const ESTADOS_ENVIO = ['preparacion', 'en_transito', 'entregado'];
  const txt = s => typeof s === 'string' && s.trim().length > 0;
  const byId = id => db.prepare('SELECT * FROM pedidos WHERE id=?').get(Number(id));
  const registrarMov = db.prepare(
    'INSERT INTO movimientos(producto_id,tipo,cantidad,motivo,usuario_id) VALUES(?,?,?,?,?)');

  const detalleDe = pid => db.prepare(
    `SELECT d.id,d.producto_id,d.cantidad,d.precio_unitario,p.titulo,p.tipo
     FROM pedido_detalles d JOIN productos p ON p.id=d.producto_id WHERE d.pedido_id=?`).all(pid);
  const envioDe = pid => db.prepare('SELECT * FROM envios WHERE pedido_id=?').get(pid);
  const pagoDe = pid => db.prepare('SELECT * FROM pagos WHERE pedido_id=? ORDER BY id DESC').get(pid);
  const armar = p => ({ ...p, detalles: detalleDe(p.id), pago: pagoDe(p.id) || null, envio: envioDe(p.id) || null });

  // ===== HU-04 Checkout (Ecommerce) =====
  app.post('/api/pedidos', auth, (req, res) => {
    const { direccion, items } = req.body || {};
    if (!txt(direccion) || !Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'Dirección y al menos un item son obligatorios' });
    for (const it of items)
      if (!it || !Number.isInteger(it.cantidad) || it.cantidad <= 0)
        return res.status(400).json({ error: 'Cantidades inválidas' });

    try {
      const result = db.transaction(() => {
        let total = 0;
        const lines = [];
        for (const it of items) {
          const p = db.prepare('SELECT * FROM productos WHERE id=?').get(Number(it.id));
          if (!p || p.estado !== 'aprobado')
            throw Object.assign(new Error('Producto no disponible'), { code: 'INV' });
          if (p.stock < it.cantidad)
            throw Object.assign(new Error(`Sin stock suficiente: ${p.titulo}`), { code: 'STOCK' });
          total += p.precio * it.cantidad;
          lines.push({ p, cantidad: it.cantidad });
        }
        const { lastInsertRowid } = db.prepare(
          'INSERT INTO pedidos(cliente_id,direccion,total) VALUES(?,?,?)')
          .run(req.session.uid, direccion.trim(), Math.round(total * 100) / 100);
        for (const { p, cantidad } of lines) {
          db.prepare('INSERT INTO pedido_detalles(pedido_id,producto_id,cantidad,precio_unitario) VALUES(?,?,?,?)')
            .run(lastInsertRowid, p.id, cantidad, p.precio);
          db.prepare('UPDATE productos SET stock=stock-?,actualizado=CURRENT_TIMESTAMP WHERE id=?')
            .run(cantidad, p.id);
          registrarMov.run(p.id, 'salida', cantidad, `Venta pedido #${lastInsertRowid}`, req.session.uid);
        }
        return lastInsertRowid;
      })();
      res.status(201).json({ id: result, estado: 'pendiente' });
    } catch (e) {
      if (e.code === 'INV') return res.status(400).json({ error: e.message });
      if (e.code === 'STOCK') return res.status(409).json({ error: e.message });
      throw e;
    }
  });

  app.get('/api/pedidos', auth, (req, res) =>
    res.json(db.prepare('SELECT * FROM pedidos WHERE cliente_id=? ORDER BY id DESC')
      .all(req.session.uid).map(armar)));

  app.get('/api/pedidos/:id', auth, (req, res) => {
    const p = byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (p.cliente_id !== req.session.uid && req.session.rol !== 'administrador')
      return res.status(403).json({ error: 'Sin permisos' });
    res.json(armar(p));
  });

  app.post('/api/pedidos/:id/cancelar', auth, (req, res) => {
    const p = byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (p.cliente_id !== req.session.uid) return res.status(403).json({ error: 'Sin permisos' });
    if (p.estado !== 'pendiente')
      return res.status(409).json({ error: 'Solo se cancelan pedidos pendientes de pago' });
    db.transaction(() => {
      for (const d of detalleDe(p.id)) {
        db.prepare('UPDATE productos SET stock=stock+?,actualizado=CURRENT_TIMESTAMP WHERE id=?')
          .run(d.cantidad, d.producto_id);
        registrarMov.run(d.producto_id, 'entrada', d.cantidad, `Cancelación de pedido #${p.id}`, req.session.uid);
      }
      db.prepare("UPDATE pedidos SET estado='cancelado',actualizado=CURRENT_TIMESTAMP WHERE id=?").run(p.id);
    })();
    res.json({ id: p.id, estado: 'cancelado' });
  });

  // ===== HU-05 Cobros =====
  app.post('/api/pedidos/:id/pago', auth, (req, res) => {
    const p = byId(req.params.id);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (p.cliente_id !== req.session.uid) return res.status(403).json({ error: 'Sin permisos' });
    if (p.estado !== 'pendiente') return res.status(409).json({ error: 'El pedido no está pendiente de pago' });
    const metodo = req.body && req.body.metodo;
    if (!METODOS.includes(metodo))
      return res.status(400).json({ error: 'Método de pago inválido' });

    const tracking = 'TRK' + String(p.id).padStart(6, '0') + Math.random().toString(36).slice(2, 6).toUpperCase();
    const ref = 'PAY-' + Date.now().toString(36).toUpperCase() + '-' + p.id;
    db.transaction(() => {
      db.prepare('INSERT INTO pagos(pedido_id,monto,metodo,estado,referencia) VALUES(?,?,?,?,?)')
        .run(p.id, p.total, metodo, 'completado', ref);
      db.prepare("UPDATE pedidos SET estado='pagado',actualizado=CURRENT_TIMESTAMP WHERE id=?").run(p.id);
      db.prepare('INSERT INTO envios(pedido_id,destino,tracking) VALUES(?,?,?)')
        .run(p.id, p.direccion, tracking);
    })();
    res.json({ id: p.id, estado: 'pagado', pago: { metodo, monto: p.total, referencia: ref }, envio: { estado: 'preparacion', tracking } });
  });

  // ===== HU-06 Distribución =====
  app.get('/api/admin/pedidos', auth, rol('administrador'), (req, res) => {
    const e = req.query.estado;
    const sql = `SELECT p.*, u.nombre AS cliente, u.email
       FROM pedidos p JOIN usuarios u ON u.id=p.cliente_id`;
    const rows = ['pendiente', 'pagado', 'cancelado', 'entregado'].includes(e)
      ? db.prepare(sql + ' WHERE p.estado=? ORDER BY p.id DESC').all(e)
      : db.prepare(sql + ' ORDER BY p.id DESC').all();
    res.json(rows.map(p => ({ ...p, detalles: detalleDe(p.id), pago: pagoDe(p.id) || null, envio: envioDe(p.id) || null })));
  });

  app.get('/api/admin/envios', auth, rol('administrador'), (req, res) =>
    res.json(db.prepare(
      `SELECT e.*, p.id AS pedido_id, p.estado AS pedido_estado, u.nombre AS comprador, p.total
       FROM envios e JOIN pedidos p ON p.id=e.pedido_id JOIN usuarios u ON u.id=p.cliente_id
       ORDER BY e.id`).all()));

  app.put('/api/admin/envios/:id', auth, rol('administrador'), (req, res) => {
    const e = db.prepare('SELECT * FROM envios WHERE id=?').get(Number(req.params.id));
    if (!e) return res.status(404).json({ error: 'Envío no encontrado' });
    const nuevo = req.body && req.body.estado;
    if (!ESTADOS_ENVIO.includes(nuevo))
      return res.status(400).json({ error: 'Estado inválido' });
    const orden = { preparacion: 0, en_transito: 1, entregado: 2 };
    if (orden[nuevo] <= orden[e.estado])
      return res.status(400).json({ error: `Transición inválida: ${e.estado} → ${nuevo}` });
    db.transaction(() => {
      db.prepare('UPDATE envios SET estado=?,actualizado=CURRENT_TIMESTAMP WHERE id=?').run(nuevo, e.id);
      if (nuevo === 'entregado')
        db.prepare("UPDATE pedidos SET estado='entregado',actualizado=CURRENT_TIMESTAMP WHERE id=?").run(e.pedido_id);
    })();
    res.json({ id: e.id, pedido_id: e.pedido_id, estado: nuevo });
  });
};
