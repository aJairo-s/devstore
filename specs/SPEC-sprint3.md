# DevStore – Sprint 3: Ecommerce, Cobros, Distribución y Almacén (SDD)

Metodología consistente con Sprints 1–2: cada comportamiento tiene un ID `SPEC-3x.y`
y un test con ese mismo ID en `tests/sprint3.test.js`.

## Convenciones
- **Comprador** = cualquier usuario autenticado (típicamente `cliente`).
- **Ofertante** = `vendedor` (físico/digital) o `instructor` (curso).
- **Administrador** = rol `administrador`.
- **Ciclo de vida del pedido**: `pendiente` → `pagado` → (`envio`: `preparacion` → `en_transito` → `entregado`) → `entregado`; o `cancelado` (solo antes de pagar).
- **Pago simulado**: métodos `tarjeta` | `transferencia` | `paypal`; siempre `completado` si el método es válido (sin pasarela real).
- **Almacén**: cada variación de `productos.stock` deja un registro en `movimientos` (`entrada` | `salida` | `ajuste`).

## A. Modelo de datos
```
usuarios / productos (Sprint 1–2)

pedidos                     pedido_detalles
---------------------------- ----------------------------
id PK                       id PK
cliente_id FK -> usuarios   pedido_id FK -> pedidos (CASCADE)
direccion TEXT NOT NULL     producto_id FK -> productos (CASCADE)
total REAL CHECK(>= 0)      cantidad INTEGER CHECK(> 0)
estado TEXT                 precio_unitario REAL CHECK(> 0)
  IN (pendiente, pagado,
      cancelado, entregado)
creado, actualizado

pagos                       envios
---------------------------- ----------------------------
id PK                       id PK
pedido_id FK -> pedidos      pedido_id FK -> pedidos (UNIQUE, CASCADE)
monto REAL CHECK(> 0)        destino TEXT NOT NULL
metodo TEXT                  estado TEXT
  IN (tarjeta,                 IN (preparacion, en_transito,
      transferencia, paypal)       entregado)
estado TEXT                  tracking TEXT UNIQUE
  IN (pendiente,              creado, actualizado
      completado, fallido)
referencia TEXT
creado

movimientos (Almacén)
----------------------------
id PK
producto_id FK -> productos (CASCADE)
tipo TEXT IN (entrada, salida, ajuste)
cantidad INTEGER CHECK(> 0)
motivo TEXT
usuario_id FK -> usuarios (SET NULL)
creado
```

## B. Specs por módulo

### HU-04 Checkout / pedidos (Ecommerce)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-30.1 | Dado un usuario autenticado con items válidos (id + cantidad > 0), cuando envía `POST /api/pedidos` con dirección, entonces 201, el pedido queda `pendiente` con total = Σ(precio×cantidad), se crean los detalles y el stock de productos `fisico`/`curso` con stock se decrementa. |
| SPEC-30.2 | Sin sesión → 401. |
| SPEC-30.3 | Sin dirección, sin items o cantidad ≤ 0 → 400 y no se crea nada. |
| SPEC-30.4 | Producto inexistente, no aprobado o sin stock suficiente → 400/409 y no se crea el pedido (rollback). |
| SPEC-30.5 | El comprador ve su pedido en `GET /api/pedidos` con detalles; otro usuario no ve los pedidos ajenos. |
| SPEC-30.6 | `POST /api/pedidos/:id/cancelar` con pedido `pendiente` → `cancelado` y el stock se repone (movimiento `entrada`). |
| SPEC-30.7 | Cancelar un pedido ya pagado o ajeno → 409/403. |
| SPEC-30.8 | Pedido inexistente → 404. |

### HU-05 Cobros (pagos)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-31.1 | Dado un pedido `pendiente` del comprador, cuando paga con método válido → 200, pago `completado`, pedido `pagado` y se crea el `envio` en `preparacion`. |
| SPEC-31.2 | Método fuera de tarjeta/transferencia/paypal → 400 y el pedido sigue `pendiente`. |
| SPEC-31.3 | Pagar un pedido que no está `pendiente` → 409. |
| SPEC-31.4 | Pagar pedido ajeno → 403; inexistente → 404; sin sesión → 401. |
| SPEC-31.5 | `GET /api/pedidos/:id` devuelve el pago asociado (monto = total del pedido). |

### HU-06 Distribución (envíos)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-32.1 | Al pagar se crea un envío con destino = dirección del pedido y estado `preparacion`. |
| SPEC-32.2 | El administrador lista envíos con `GET /api/admin/envios`. |
| SPEC-32.3 | `PUT /api/admin/envios/:id` con transición válida (`preparacion`→`en_transito`→`entregado`) actualiza el envío; al `entregado` el pedido pasa a `entregado`. |
| SPEC-32.4 | Transición inválida (p. ej. `entregado`→`preparacion`) → 400. |
| SPEC-32.5 | No-admin → 403; envío inexistente → 404. |
| SPEC-32.6 | El comprador ve el estado de envío de su pedido en `GET /api/pedidos` (campo `envio`). |

### HU-07 Almacén (inventario)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-33.1 | Cada checkout registra un movimiento `salida` por producto vendido y el stock disminuye. |
| SPEC-33.2 | El vendedor/instructor registra una entrada con `POST /api/almacen/entrada` (producto propio, cantidad > 0) → stock incrementado + movimiento `entrada`. |
| SPEC-33.3 | Entrada con producto ajeno, cantidad ≤ 0 o inexistente → 403/400. |
| SPEC-33.4 | `GET /api/almacen` devuelve el inventario: admin ve todos; ofertante solo los suyos; sin sesión → 401; cliente → 403. |
| SPEC-33.5 | `GET /api/almacen/movimientos` respeta el mismo alcance que el inventario. |
| SPEC-33.6 | Cancelar pedido repone stock y registra movimiento `entrada` con motivo "Cancelación de pedido #id". |
| SPEC-33.7 | Productos con stock ≤ 5 se marcan `stock_bajo` en `GET /api/almacen`. |

## Trazabilidad
| Spec | Endpoint |
|------|----------|
| 30.x | `POST /api/pedidos`, `GET /api/pedidos`, `GET /api/pedidos/:id`, `POST /api/pedidos/:id/cancelar` |
| 31.x | `POST /api/pedidos/:id/pago` |
| 32.x | `GET /api/admin/pedidos`, `GET /api/admin/envios`, `PUT /api/admin/envios/:id` |
| 33.x | `GET /api/almacen`, `POST /api/almacen/entrada`, `GET /api/almacen/movimientos` |

## Integración con UI
- Carrito (`ui.js`): "Finalizar compra" → `POST /api/pedidos` → `POST /api/pedidos/:id/pago`.
- `index.html`: sección "Mis pedidos"; admin: pedidos y envíos.
- `productos.html`: ofertante: entrada de stock e historial de movimientos.
