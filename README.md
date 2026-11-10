# DevStore - Marketplace para programadores

Node.js + Express + SQLite (better-sqlite3) + frontend JS puro.

## Ejecutar
1. Instalar Node.js 18 o superior.
2. En esta carpeta: `npm install`
3. `npm start`
4. Abrir http://localhost:3000

Admin inicial: admin@devstore.com / Admin123!

## Módulos del sistema
| Módulo | Estado | Dónde |
|---|---|---|
| **Seguridad de usuarios** | ✅ Sprint 1 | `server.js` (registro, login, sesiones, roles, CRUD admin) |
| **Ecommerce** | ✅ Sprint 2–3 | `productos.js` (catálogo) + `pedidos.js` (checkout, pedidos) + carrito en `public/js/ui.js` |
| **Cobros** | ✅ Sprint 3 | `pedidos.js` (`POST /api/pedidos/:id/pago`, métodos tarjeta/transferencia/paypal, simulado) |
| **Distribución** | ✅ Sprint 3 | `pedidos.js` (`envios`: preparación → tránsito → entregado, panel admin) |
| **Almacén** | ✅ Sprint 3 | `almacen.js` (inventario, entradas, movimientos entrada/salida, stock bajo) |

## Cobertura por sprints

### Sprint 1 — Seguridad (RF)
- RF01 Registro: POST /api/registro (cliente, vendedor, instructor)
- RF02 Login/Logout: POST /api/login, POST /api/logout (sesión con cookie httpOnly)
- RF03 Perfil: GET/PUT /api/me
- RF15 CRUD de usuarios (solo administrador): GET/POST /api/usuarios, PUT/DELETE /api/usuarios/:id
- Contraseñas hasheadas con bcrypt; acceso restringido por rol.

### Sprint 2 — Gestión de productos/servicios (SDD)
- Specs formales: `specs/SPEC-sprint2.md`
- Specs ejecutables: `npm test` (31 tests SPEC-xx.y)
- Código: `productos.js`; UI: http://localhost:3000/productos.html
- Ofertante = rol vendedor (físico/digital) o instructor (curso, con nivel obligatorio). Campos críticos devuelven el producto a "pendiente" al editarse.

### Sprint 3 — Ecommerce, Cobros, Distribución y Almacén (SDD)
- Specs formales: `specs/SPEC-sprint3.md` (HU-04 checkout, HU-05 pagos, HU-06 envíos, HU-07 inventario)
- Specs ejecutables: `tests/sprint3.test.js` (26 tests SPEC-30.x/31.x/32.x/33.x)
- Código: `pedidos.js` + `almacen.js`; UI:
  - Carrito → "Finalizar compra" → dirección + método de pago → pedido pagado
  - Inicio (`index.html`): "Mis pedidos"; admin: pedidos/cobros y envíos
  - Productos (`productos.html`): ofertante registra entradas de stock y ve movimientos
- Ciclo de vida: `pendiente` → pago → `pagado` + envío `preparacion` → `en_transito` → `entregado`; cancelación solo antes de pagar (repon stock).
- Cada venta/cancelación/entrada deja registro en `movimientos` (almacén).

## Interfaz (rediseño visual)
- Tema **claro/oscuro**: se respeta `prefers-color-scheme` al inicio; botón ☀/🌙 en el header alterna y persiste en `localStorage` (`devstore_theme`). Anti-flash: snippet inline en el `<head>` de cada página.
- Acento **esmeralda** (`--accent: #10b981`) en lugar de azul; tokens en `public/css/variables.css`.
- Estilos modulares en `public/css/` (`styles.css` importa `variables`, `global`, `header`, `banners`, `products`, `animations`, `responsive`).
- `public/js/ui.js`: header compartido, tema, toasts, carrito + checkout en el navegador y animaciones de aparición. Respeta `prefers-reduced-motion`.
- `productos.html`: banner rotativo, categorías, búsqueda y filtros, tarjetas, cursos destacados, modal, paneles por rol y almacén.

> Si ya corriste una versión anterior sin las tablas del Sprint 3, borra `devstore.db` para que se recreen con el esquema completo (o arranca el servidor: las tablas nuevas se crean con `CREATE TABLE IF NOT EXISTS`).

## Tests
```bash
npm test   # 57 tests (Sprint 2: 31 + Sprint 3: 26)
```

## Despliegue

### Subir a GitHub
```bash
git remote add origin https://github.com/TU_USUARIO/devstore.git
git push -u origin main
```

### Desplegar en Render
1. En [render.com](https://render.com) → **New** → **Blueprint** y conecta el repo de GitHub.
   (También vale **New → Web Service** con Build `npm install` y Start `npm start`.)
2. Render lee `render.yaml` y crea el servicio web automáticamente:
   - Build: `npm install` · Start: `npm start` · Node 22.x
   - `SECRET` se genera automáticamente (sesiones).
3. Tras el primer deploy, la URL pública queda en el dashboard del servicio.

### Usuarios y datos en Render
`devstore.db` está versionado en el repo como **snapshot inicial**: cada deploy o
reinicio del servicio restaura ese archivo. Consecuencias en el plan **free**
(disco efímero):

- Los usuarios/productos/pedidos del snapshot están disponibles al arrancar.
- Lo que se cree **en tiempo de ejecución** (registros, compras) se pierde en el
  siguiente deploy/reinicio (incluido el spin-down por inactividad del plan free).
- Para persistencia real: adjunta un disco (planes de pago) en `/var/data` y define
  `DB_PATH=/var/data/devstore.db`, o usa una base de datos externa.

Credenciales de demo incluidas en el snapshot:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@devstore.com` | `Admin123!` | administrador |
| `lucia@devstore.com` | `Demo1234!` | vendedor |
| `marcos@devstore.com` | `Demo1234!` | vendedor |
| `ana@devstore.com` | `Demo1234!` | instructor |
| `diego@devstore.com` | `Demo1234!` | instructor |
| `carla@devstore.com` | `Demo1234!` | cliente |

Para gestionar usuarios que deben viajar en el snapshot:
```bash
node scripts/manage-users.js list
node scripts/manage-users.js create "Nombre" correo@ejemplo.com 'Password123' cliente
node scripts/manage-users.js passwd correo@ejemplo.com 'NuevaPassword123'
node scripts/manage-users.js delete correo@ejemplo.com
# luego: git add devstore.db && git commit && git push  → Render redespliega
```

### Diagnóstico
`GET /api/health` devuelve `{ ok, db, writable, users, node }` para comprobar en el
servicio desplegado qué base de datos se está usando y si acepta escrituras.

Notas:
- El servidor usa `process.env.PORT` (Render lo asigna); en local usa `3000`.
- El servidor nunca escribe fuera de `DB_PATH` y crea su directorio si no existe.
