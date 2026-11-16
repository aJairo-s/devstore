const { WebSocketServer } = require('ws');
const cookie = require('cookie');
const signature = require('cookie-signature');
const { db } = require('./db');

const parseCookies = cookie.parseCookie || cookie.parse;

// Conexiones activas por usuario: Map<userId, Set<WebSocket>>.
const sockets = new Map();
let wss = null;

function rechazar(socket, code = 401) {
  try {
    socket.write(`HTTP/1.1 ${code} ${code === 403 ? 'Forbidden' : 'Unauthorized'}\r\nConnection: close\r\n\r\n`);
  } catch {}
  socket.destroy();
}

/**
 * Autentica el upgrade usando la cookie de sesión de Express.
 * El navegador envía `connect.sid`; se valida la firma y se busca la sesión
 * en el mismo MemoryStore que usa express-session.
 */
function attachRealtime(server, { store, secret }) {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return rechazar(socket, 400); }
    if (pathname !== '/api/realtime') return rechazar(socket, 404);

    let cookies;
    try { cookies = parseCookies(req.headers.cookie || ''); } catch { return rechazar(socket, 400); }
    const raw = cookies['connect.sid'];
    if (!raw) return rechazar(socket, 401);
    const value = String(raw);
    if (!value.startsWith('s:')) return rechazar(socket, 401);
    const sid = signature.unsign(value.slice(2), secret);
    if (!sid) return rechazar(socket, 401);

    store.get(sid, (err, session) => {
      if (err || !session || !session.uid) return rechazar(socket, 401);
      const user = db.prepare('SELECT id,nombre,apellidos,rol,estado FROM usuarios WHERE id=?').get(session.uid);
      if (!user || user.estado !== 'activo') return rechazar(socket, 403);
      wss.handleUpgrade(req, socket, head, ws => {
        ws.usuario = user;
        wss.emit('connection', ws);
      });
    });
  });

  wss.on('connection', ws => {
    const id = ws.usuario.id;
    let set = sockets.get(id);
    if (!set) { set = new Set(); sockets.set(id, set); }
    set.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg && msg.type === 'ping' && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
      }
    });
    ws.on('close', () => {
      const actuales = sockets.get(id);
      if (!actuales) return;
      actuales.delete(ws);
      if (!actuales.size) sockets.delete(id);
    });
    ws.send(JSON.stringify({ type: 'ready', userId: id, rol: ws.usuario.rol }));
  });

  // Latido para detectar conexiones muertas y liberar memoria.
  const intervalo = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, 30000);
  if (intervalo.unref) intervalo.unref();
  wss.on('close', () => clearInterval(intervalo));
  server.on('close', () => {
    clearInterval(intervalo);
    sockets.clear();
    try { wss.close(); } catch {}
    wss = null;
  });
  return wss;
}

/** Envía un evento a todos los sockets abiertos de los usuarios indicados. */
function emitir(usuarioIds, payload) {
  if (!wss || !payload) return 0;
  let data;
  try { data = JSON.stringify(payload); } catch { return 0; }
  let enviados = 0;
  for (const id of new Set((usuarioIds || []).map(Number).filter(Number.isInteger))) {
    const set = sockets.get(id);
    if (!set) continue;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(data); enviados++; } catch {}
      }
    }
  }
  return enviados;
}

function contarConectados() {
  return sockets.size;
}

module.exports = { attachRealtime, emitir, contarConectados };
