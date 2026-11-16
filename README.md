# DevStore · Fase 3

Plataforma de **cursos de desarrollo de software**. El catálogo es público; las acciones privadas (perfil, panel de instructor, compras, foro y mensajería) requieren cuenta.

La Fase 3 añade:

- **Pago por QR**: el instructor sube su propio código QR desde el panel y el estudiante lo ve al elegir ese método en el checkout.
- **Datos de cobro del instructor** para transferencia bancaria y QR, con validación de configuración antes de permitir la compra.
- **Checkout más realista**: formulario de tarjeta con vista previa y validación local, datos bancarios copiables, pasos para escanear el QR, estado de procesamiento y comprobante.
- **Moneda Bs** en el catálogo, el editor, la analítica, el checkout y los comprobantes.

La Fase 2 añade:

- **Checkout simulado** con métodos de pago seleccionables (tarjeta, transferencia y PayPal) y compra inmediata de cursos gratuitos.
- **Notificaciones internas** de ventas, compras, foro, mensajes, verificación y revisión de cursos.
- **Analítica exclusiva del instructor**: ingresos, ventas, estudiantes, evolución mensual, rendimiento por curso y métodos de pago, siempre en datos agregados.
- **Foro por curso** con hilos, respuestas, fijado y cierre, reservado a participantes.
- **Mensajería directa en tiempo real** entre usuarios e instructores mediante WebSockets.

También conserva las bases de la Fase 1: catálogo por áreas, registro extendido, verificación manual de instructores, editor de cursos con YouTube o video local y revisión antes de publicar.

> Los pagos son **simulados**: no se integra ninguna pasarela real, no se realizan cargos y los datos de tarjeta nunca se envían ni se almacenan. Los datos bancarios y el QR son de demostración.

## Requisitos

- Node.js 22 o superior.
- npm.

## Puesta en marcha

```bash
npm install
npm run db:reset   # crea la base de datos y carga el catálogo demo
npm start
```

Abrir <http://localhost:3000>.

Para desarrollo con recarga del servidor:

```bash
npm run dev
```

### Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP. |
| `SECRET` | valor de desarrollo | Secreto de las sesiones y de la autenticación WebSocket. Cámbialo en producción. |
| `DB_PATH` | `devstore.db` | Ruta del archivo SQLite. Usa `:memory:` en pruebas. |
| `SEED_DEMO` | activo | `false` evita cargar usuarios, cursos y compras demo. Las categorías, métodos de pago y el administrador base siempre se crean. |
| `UPLOAD_DIR` | `uploads/` | Carpeta de archivos subidos (videos y códigos QR). |
| `VIDEO_MAX_MB` | `200` | Tamaño máximo por video local. |
| `NODE_ENV` | — | En `production` la cookie de sesión se marca `secure`. |

Los códigos QR se guardan en `uploads/qr/`, se validan por firma real (PNG, JPG o WebP) y tienen un límite de 3 MB. La carpeta `uploads/` está ignorada por git; los QR demo de Ana y Diego se copian desde `src/db/demo-qr-*.png` al iniciar.

## Cuentas demo

| Email | Contraseña | Rol |
|---|---|---|
| `admin@devstore.com` | `Admin123!` | Administrador |
| `ana@devstore.com` | `Demo1234!` | Instructora verificada |
| `diego@devstore.com` | `Demo1234!` | Instructor verificado |
| `elena@devstore.com` | `Demo1234!` | Instructora pendiente de verificación |
| `mateo@devstore.com` | `Demo1234!` | Instructor rechazado |
| `carla@devstore.com` | `Demo1234!` | Cliente con cursos y compras demo |
| `luis@devstore.com` | `Demo1234!` | Cliente con cursos y compras demo |

## Roles y privacidad

| Rol | Puede |
|---|---|
| **Cliente** | Ver el catálogo, gestionar su perfil, comprar cursos, consultar sus cursos y compras, participar en el foro de sus cursos y usar la mensajería. No accede a estadísticas de cursos ni a paneles internos. |
| **Instructor** | Crear y editar sus cursos, secciones y lecciones. Configurar **solo sus propios** datos de cobro y su código QR. Ve métricas agregadas de sus propios cursos y modera el foro de sus cursos. No ve datos personales de compradores ni compras de la plataforma. |
| **Administrador** | Verificar instructores, aprobar o rechazar cursos, gestionar usuarios, consultar compras y moderar cualquier foro. Es el único rol con acceso a compras de toda la plataforma. |

Un instructor **no verificado** puede preparar borradores y temario, pero no enviar cursos a revisión. La verificación exige al menos una evidencia: GitHub, portafolio o credenciales.

La privacidad se aplica también en las notificaciones: el aviso de venta indica los cursos vendidos, pero no el nombre, email ni otros datos del comprador. Los datos de cobro de un instructor solo se exponen a cuentas autenticadas durante el checkout; cada instructor edita únicamente los suyos y la administración puede consultarlos, pero no modificarlos desde el panel de instructor.

## Estructura del proyecto

```
server.js                  Arranque de Express, sesiones y WebSockets
src/config.js              Rutas y límites de configuración
src/realtime.js            Autenticación del upgrade y emisión de eventos WS
src/db/
  schema.sql               Esquema completo (Fase 3)
  seed.js                  Categorías, usuarios, cursos, compras, foro, chat y cobros demo
  demo-qr-*.png            Códigos QR de demostración para Ana y Diego
  index.js                 Conexión SQLite, migración incremental y siembra inicial
src/middleware/            Autenticación, RBAC, errores y rate limit
src/routes/                auth, perfil, categorías, cursos, lecciones,
                           instructor, instructores, admin, compras,
                           notificaciones, foro y mensajes
src/services/              cursos, compras, notificaciones, analítica y mensajes
src/utils/                 Validación HTTP, slugs y parsing de YouTube
public/                    Interfaz (HTML + CSS + JS sin framework)
tests/                     Pruebas de API y WebSocket con node:test
scripts/                   reset-db.js y manage-users.js
uploads/                   Videos y códigos QR subidos (ignorado por git)
```

## API principal

### Autenticación y perfil

- `POST /api/auth/registro/cliente`
- `POST /api/auth/registro/instructor`
- `POST /api/auth/login` · `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/perfil` · `PUT /api/perfil`
- `GET /api/perfil/instructor/verificacion`
- `POST /api/perfil/instructor/verificacion`

### Catálogo y contenido

- `GET /api/categorias`
- `GET /api/cursos?q=&categoria=&nivel=&orden=&precio_max=`
- `GET /api/cursos/:slug`
- `GET /api/lecciones/:id`
- `GET /api/lecciones/:id/video` — archivo local protegido

### Instructor

- `GET /api/instructor/resumen`
- `GET /api/instructor/analitica` — métricas agregadas de ventas y cursos
- `GET /api/instructor/cursos` · `POST /api/instructor/cursos`
- `GET /api/instructor/cursos/:id` · `PUT` · `DELETE`
- `POST /api/instructor/cursos/:id/enviar-revision`
- `POST /api/instructor/cursos/:id/secciones`
- `PUT /api/instructor/secciones/:id` · `DELETE`
- `PUT /api/instructor/cursos/:id/secciones/orden`
- `POST /api/instructor/secciones/:id/lecciones`
- `PUT /api/instructor/lecciones/:id` · `DELETE`
- `PUT /api/instructor/secciones/:id/lecciones/orden`
- `POST /api/instructor/lecciones/:id/video` — multipart, MP4/WebM
- `GET /api/instructor/pago` · `PUT /api/instructor/pago` — datos de cobro del propio instructor
- `POST /api/instructor/pago/qr` — multipart, PNG/JPG/WebP hasta 3 MB
- `DELETE /api/instructor/pago/qr`

### Administración

- `GET /api/admin/resumen`
- `GET /api/admin/instructores?estado=`
- `POST /api/admin/instructores/:id/verificar` · `/rechazar`
- `GET /api/admin/cursos?estado=`
- `POST /api/admin/cursos/:id/aprobar` · `/rechazar`
- `GET /api/admin/usuarios?q=&rol=`
- `PUT /api/admin/usuarios/:id` · `DELETE`
- `GET /api/admin/compras`

### Compras y métodos de pago

- `GET /api/metodos-pago`
- `GET /api/instructores/:id/pago` — datos de cobro para el checkout; requiere sesión
- `GET /api/instructores/:id/qr` — imagen del QR; requiere sesión y se sirve sin caché
- `POST /api/compras` — compra simulada; acepta `curso_ids`, `metodo_pago_id` y un `detalle_pago` seguro (omitido si el total es 0)
- `GET /api/compras/:id` — solo el comprador o la administración
- `GET /api/mis-cursos`
- `GET /api/mis-compras`

### Notificaciones

- `GET /api/notificaciones?limit=&no_leidas=`
- `GET /api/notificaciones/resumen`
- `POST /api/notificaciones/leer-todas`
- `POST /api/notificaciones/:id/leer`
- `DELETE /api/notificaciones/:id`

### Foro por curso

- `GET /api/cursos/:slug/foro` · `POST /api/cursos/:slug/foro`
- `GET /api/foro/hilos/:id`
- `POST /api/foro/hilos/:id/respuestas`
- `POST /api/foro/hilos/:id/cerrar` · `/fijar` — instructor del curso o administración
- `DELETE /api/foro/hilos/:id` · `DELETE /api/foro/respuestas/:id`

### Mensajería

- `GET /api/mensajes/conversaciones`
- `POST /api/mensajes/conversaciones` — crea o reutiliza la conversación con `usuario_id`
- `GET /api/mensajes/conversaciones/:id`
- `POST /api/mensajes/conversaciones/:id`
- `POST /api/mensajes/conversaciones/:id/leer`
- `GET /api/mensajes/no-leidos`
- `GET /api/mensajes/contactos?q=`

### Tiempo real

- `WS /api/realtime` — autenticado con la cookie de sesión `connect.sid`.
- Eventos del servidor: `ready`, `notificacion` y `mensaje`.
- Las notificaciones y los mensajes nuevos llegan al instante al destinatario; el chat también sincroniza otras pestañas del emisor.

## Compra simulada

1. Un cliente autenticado abre un curso publicado y pulsa **Comprar ahora**.
2. Elige uno de los métodos de pago activos y completa el detalle correspondiente. Los cursos gratuitos se inscriben sin método.
3. El servidor calcula el total en **Bs**, valida que el instructor tenga configurado el QR o la cuenta bancaria cuando el método lo requiere, y crea `compras`, `compra_items`, `pagos` e `inscripciones` con acceso inmediato.
4. El instructor recibe una notificación de venta y el cliente una de compra confirmada.
5. La operación es idempotente por curso: volver a comprar un curso ya inscrito devuelve `409`.

Detalles por método:

- **Tarjeta**: formulario con vista previa, formateo y validación Luhn en el navegador. Acepta vencimientos `MM/AA` o `MM/AAAA`, muestra errores junto a cada campo e incluye un botón para rellenar una tarjeta de demostración. Los datos de la tarjeta nunca se envían al servidor; solo se guarda una etiqueta como `Visa •••• 4242`. Las tarjetas `4242…`, `5555…`, `3782…` y `3056…` se aprueban en la simulación; `4000 0000 0000 0002` se rechaza.
- **Transferencia**: se muestran banco, titular, cuenta, tipo de cuenta, monto e instrucciones del instructor, con botón para copiar los datos. Si el instructor no configuró su cuenta, la compra devuelve `409`.
- **Pago por QR**: se muestra la imagen subida por el instructor, el monto y los pasos para escanear. Si no hay QR configurado, la compra devuelve `409`.
- **PayPal**: se simula la apertura de la pasarela y se confirma la compra sin cargos reales.

Al finalizar se muestra un comprobante con referencia, método y total. Todo el flujo está etiquetado como demostración.

## Videos

- **YouTube**: se acepta una URL (`watch`, `youtu.be`, `embed`, `shorts`, `live`) o un ID de 11 caracteres. Se incrusta con `youtube-nocookie.com`.
- **Archivo local**: se sube en MP4 o WebM (máximo 200 MB). Se guarda fuera de `public/` y solo se sirve mediante `/api/lecciones/:id/video` tras comprobar el acceso. El dueño del curso y la administración siempre pueden verlo; los clientes necesitan inscripción o que el curso sea gratuito.

## Revisión de cursos

1. El instructor crea un borrador y completa información, secciones y lecciones.
2. Todas las lecciones deben tener video para enviar el curso.
3. El curso pasa a **pendiente** y desaparece del catálogo público hasta su aprobación.
4. La administración lo aprueba (se publica) o lo rechaza con un motivo visible para el instructor.
5. Editar un curso aprobado lo devuelve a revisión.

## Pruebas

```bash
npm test
```

Las pruebas usan `DB_PATH=:memory:`, `SEED_DEMO=false` y `SECRET=test-secret`. Cubren autenticación, registros extendidos, RBAC, CRUD de cursos, secciones y lecciones, validación de YouTube, subida local protegida, flujo de aprobación, catálogo público, verificación de instructores y privacidad de compras. La Fase 2 añade compras simuladas, notificaciones, analítica agregada, foro con moderación, mensajería y entrega de eventos por WebSocket. La Fase 3 añade el método QR, privacidad y validación de los datos de cobro, subida de imágenes con validación de firma, compras por transferencia y QR, validación de tarjetas (Luhn, vencimiento `MM/AA`/`MM/AAAA`, marcas y tarjetas de prueba), y comprobaciones de la moneda Bs y de la ausencia de credenciales demo en la interfaz.

## Base de datos

`npm run db:reset` elimina y recrea `devstore.db` con el catálogo demo. Al arrancar, si la base no existe se crea y se siembra automáticamente. Las bases de fases anteriores se migran en caliente añadiendo las columnas nuevas y actualizando `user_version` a `3`. También se detecta el esquema antiguo (productos/pedidos) y se recrea la base actual.

Tablas: `usuarios`, `perfiles_cliente`, `perfiles_instructor`, `categorias`, `cursos`, `curso_secciones`, `curso_lecciones`, `metodos_pago`, `compras`, `compra_items`, `inscripciones`, `pagos`, `notificaciones`, `foro_hilos`, `foro_respuestas`, `conversaciones` y `mensajes`.

Columnas de la Fase 3: `perfiles_instructor.pago_banco`, `pago_titular`, `pago_cuenta`, `pago_tipo_cuenta`, `pago_instrucciones`, `pago_qr_path`, `pago_qr_nombre`, `pago_actualizado` y `pagos.detalle`.

Gestión puntual de usuarios por consola:

```bash
node scripts/manage-users.js list
node scripts/manage-users.js create Ana Torres ana2@devstore.com 'Clave123!' cliente
node scripts/manage-users.js passwd ana2@devstore.com 'NuevaClave123!'
node scripts/manage-users.js delete ana2@devstore.com
```

## Despliegue en Render

`render.yaml` define un servicio Node con `npm install` y `npm start`. En el plan gratuito el disco es efímero: la base se recrea y se siembra al reiniciar. Para persistencia, monta un disco y apunta `DB_PATH` a `/var/data/devstore.db`.

## Alcance de la Fase 3

Incluido: catálogo, cuentas, perfiles, verificación, editor, videos, revisión, checkout simulado con tarjeta, transferencia, QR y PayPal, configuración de cobros y QR por instructor, notificaciones, analítica del instructor, foro por curso y chat interno en tiempo real. Toda la interfaz muestra importes en **Bs**.

Fuera de alcance: pasarela de pago real y cobros, verificación automática de transferencias o QR, carrito persistente, reembolsos, progreso de lecciones, certificados, notificaciones por email/push y suscripciones.
