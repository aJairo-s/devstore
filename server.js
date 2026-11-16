const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { db, DB_PATH } = require('./src/db');
const { notFound, errorHandler } = require('./src/middleware/errors');
const { attachRealtime } = require('./src/realtime');

const app = express();
const SECRET = process.env.SECRET || 'devstore-fase-3-cambiar-en-produccion';
const sessionStore = new session.MemoryStore();
const sessionMiddleware = session({
  store: sessionStore,
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 2
  }
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use(sessionMiddleware);

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/perfil', require('./src/routes/perfil.routes'));
app.use('/api/categorias', require('./src/routes/categorias.routes'));
app.use('/api/cursos', require('./src/routes/cursos.routes'));
app.use('/api/lecciones', require('./src/routes/lecciones.routes'));
app.use('/api/instructor', require('./src/routes/instructor.routes'));
app.use('/api/instructores', require('./src/routes/instructores.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/notificaciones', require('./src/routes/notificaciones.routes'));
app.use('/api/mensajes', require('./src/routes/mensajes.routes'));
app.use('/api', require('./src/routes/foro.routes'));
app.use('/api', require('./src/routes/compras.routes'));
app.use('/api', require('./src/routes/meta.routes'));

app.use('/api', notFound);
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));
app.use(errorHandler);

app.locals.db = db;
app.locals.DB_PATH = DB_PATH;
app.locals.sessionStore = sessionStore;
app.locals.sessionMiddleware = sessionMiddleware;
app.locals.secret = SECRET;

function createServer() {
  const server = http.createServer(app);
  attachRealtime(server, { store: sessionStore, secret: SECRET });
  return server;
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  createServer().listen(PORT, () =>
    console.log(`DevStore escuchando en http://localhost:${PORT} · DB: ${DB_PATH}`));
}

app.createServer = createServer;

module.exports = app;
