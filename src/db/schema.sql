-- DevStore · Fase 2
-- Esquema orientado exclusivamente a cursos de desarrollo de software.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('cliente', 'instructor', 'administrador')),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido')),
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perfiles_cliente (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  telefono TEXT NOT NULL,
  pais TEXT NOT NULL,
  ciudad TEXT,
  nivel_experiencia TEXT NOT NULL CHECK (nivel_experiencia IN ('principiante', 'intermedio', 'avanzado')),
  areas_interes TEXT NOT NULL,
  acepta_terminos INTEGER NOT NULL DEFAULT 0 CHECK (acepta_terminos = 1),
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perfiles_instructor (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  titular TEXT NOT NULL,
  biografia TEXT NOT NULL,
  especialidad TEXT NOT NULL,
  anios_experiencia INTEGER NOT NULL CHECK (anios_experiencia >= 0),
  pais TEXT NOT NULL,
  telefono TEXT,
  github_url TEXT,
  portafolio_url TEXT,
  linkedin_url TEXT,
  credenciales TEXT NOT NULL DEFAULT '',
  estado_verificacion TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado')),
  motivo_rechazo TEXT,
  verificado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  verificado_en TEXT,
  -- Datos de cobro simulados que se muestran al estudiante durante el checkout.
  pago_banco TEXT,
  pago_titular TEXT,
  pago_cuenta TEXT,
  pago_tipo_cuenta TEXT,
  pago_instrucciones TEXT,
  pago_qr_path TEXT,
  pago_qr_nombre TEXT,
  pago_actualizado TEXT,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (github_url IS NOT NULL OR portafolio_url IS NOT NULL OR TRIM(credenciales) <> '')
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  icono TEXT,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instructor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  titulo TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  resumen TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  precio REAL NOT NULL DEFAULT 0 CHECK (precio >= 0),
  nivel TEXT NOT NULL CHECK (nivel IN ('principiante', 'intermedio', 'avanzado')),
  idioma TEXT NOT NULL DEFAULT 'Español',
  imagen_url TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'pendiente', 'aprobado', 'rechazado', 'archivado')),
  motivo_rechazo TEXT,
  publicado_en TEXT,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS curso_secciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS curso_lecciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seccion_id INTEGER NOT NULL REFERENCES curso_secciones(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo_video TEXT CHECK (tipo_video IS NULL OR tipo_video IN ('youtube', 'archivo')),
  youtube_video_id TEXT,
  archivo_path TEXT,
  archivo_nombre TEXT,
  archivo_tamano INTEGER,
  duracion_seg INTEGER CHECK (duracion_seg IS NULL OR duracion_seg >= 0),
  es_preview INTEGER NOT NULL DEFAULT 0 CHECK (es_preview IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (tipo_video IS NULL AND youtube_video_id IS NULL AND archivo_path IS NULL)
    OR (tipo_video = 'youtube' AND youtube_video_id IS NOT NULL AND archivo_path IS NULL)
    OR (tipo_video = 'archivo' AND archivo_path IS NOT NULL AND youtube_video_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS metodos_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'cancelada', 'reembolsada')),
  metodo_pago_id INTEGER REFERENCES metodos_pago(id) ON DELETE SET NULL,
  referencia TEXT,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compra_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  precio_unitario REAL NOT NULL CHECK (precio_unitario >= 0),
  UNIQUE (compra_id, curso_id)
);

CREATE TABLE IF NOT EXISTS inscripciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  compra_id INTEGER REFERENCES compras(id) ON DELETE SET NULL,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cliente_id, curso_id)
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  monto REAL NOT NULL CHECK (monto >= 0),
  metodo_pago_id INTEGER NOT NULL REFERENCES metodos_pago(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'completado', 'fallido')),
  referencia TEXT,
  -- Resumen seguro para el comprobante (nunca datos bancarios completos).
  detalle TEXT,
  -- Validación manual del pago (por ejemplo, QR confirmado por el instructor).
  verificado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  verificado_en TEXT,
  motivo_rechazo TEXT,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================ Fase 2 ============================
-- Notificaciones internas (ventas, foro, mensajes y avisos del sistema).
CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('venta', 'compra', 'foro', 'mensaje', 'sistema', 'verificacion', 'curso')),
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL DEFAULT '',
  enlace TEXT,
  leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0, 1)),
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foro de cada curso: hilos y respuestas.
CREATE TABLE IF NOT EXISTS foro_hilos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  fijado INTEGER NOT NULL DEFAULT 0 CHECK (fijado IN (0, 1)),
  cerrado INTEGER NOT NULL DEFAULT 0 CHECK (cerrado IN (0, 1)),
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS foro_respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hilo_id INTEGER NOT NULL REFERENCES foro_hilos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mensajería directa entre dos usuarios (cliente ↔ instructor o usuario ↔ usuario).
CREATE TABLE IF NOT EXISTS conversaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_a INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_b INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_a, usuario_b),
  CHECK (usuario_a < usuario_b)
);

CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  emisor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  leido INTEGER NOT NULL DEFAULT 0 CHECK (leido IN (0, 1)),
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cursos_estado ON cursos(estado);
CREATE INDEX IF NOT EXISTS idx_cursos_instructor ON cursos(instructor_id);
CREATE INDEX IF NOT EXISTS idx_cursos_categoria ON cursos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_secciones_curso ON curso_secciones(curso_id, orden);
CREATE INDEX IF NOT EXISTS idx_lecciones_seccion ON curso_lecciones(seccion_id, orden);
CREATE INDEX IF NOT EXISTS idx_inscripciones_cliente ON inscripciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_compras_cliente ON compras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_compra ON pagos(compra_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leida, creado);
CREATE INDEX IF NOT EXISTS idx_foro_hilos_curso ON foro_hilos(curso_id, actualizado);
CREATE INDEX IF NOT EXISTS idx_foro_respuestas_hilo ON foro_respuestas(hilo_id, creado);
CREATE INDEX IF NOT EXISTS idx_conversaciones_a ON conversaciones(usuario_a);
CREATE INDEX IF NOT EXISTS idx_conversaciones_b ON conversaciones(usuario_b);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON mensajes(conversacion_id, id);

PRAGMA user_version = 4;
