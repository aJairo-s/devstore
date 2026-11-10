# DevStore – Sprint 2: Gestión de Productos/Servicios (SDD)

Metodología: cada comportamiento tiene un ID `SPEC-xx.y` y un test con ese mismo ID en
`tests/sprint2.test.js`. No hay código sin spec (ver tabla de trazabilidad al final).

## Convenciones (consistencia con Sprint 1)
- **Ofertante** = usuario con rol `vendedor` o `instructor`.
- **Demandante** = usuario con rol `cliente`.
- **Administrador** = rol `administrador`.
- Estados de validación: `pendiente` | `aprobado` | `rechazado`.
- **Tipos de oferta** (documento de visión, 4.1): `fisico`, `digital`, `curso`.
- **Qué publica cada rol** (documento de visión, 3.2): `vendedor` -> `fisico` y `digital`; `instructor` -> `curso`.
- **Nivel del curso**: `principiante` | `intermedio` | `avanzado`; obligatorio si el tipo es `curso`, nulo en los demás.
- **Campos críticos** (su cambio devuelve a `pendiente`): `titulo`, `descripcion`, `precio`, `categoria`, `tipo`, `nivel`.
- **Campo no crítico**: `stock`.

## A. Modelo de datos
```
usuarios (Sprint 1)              productos (Sprint 2)
-------------------              --------------------------------------------
id PK                 1 ──── N   id PK
nombre                           ofertante_id FK -> usuarios.id (ON DELETE CASCADE)
email UNIQUE                     titulo        TEXT NOT NULL
password_hash                    descripcion   TEXT NOT NULL
rol                              precio        REAL NOT NULL CHECK(precio > 0)
creado                           categoria     TEXT NOT NULL
                                 tipo          TEXT CHECK IN (fisico, digital, curso)
                                 nivel         TEXT NULL CHECK IN (principiante, intermedio, avanzado)
                                               (tipo = 'curso' <=> nivel NOT NULL)
                                 stock         INTEGER NOT NULL DEFAULT 0 CHECK(>= 0)
                                 estado        TEXT CHECK IN (pendiente, aprobado, rechazado) DEFAULT 'pendiente'
                                 motivo_rechazo TEXT NULL
                                 creado, actualizado TEXT
```

## B. Specs por historia de usuario

### HU-01 Registro de producto/servicio (Ofertante)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-01.1 | Dado un ofertante autenticado, cuando envía título, descripción, precio > 0, categoría y tipo válidos, entonces responde 201 y el producto queda en estado `pendiente` vinculado a su `ofertante_id`. |
| SPEC-01.2 | Cuando falta un dato obligatorio (ej. título), entonces 400 y no se guarda nada. |
| SPEC-01.3 | Cuando el precio es 0, negativo o no numérico, entonces 400. |
| SPEC-01.4 | Dado un `cliente`, cuando intenta registrar un producto, entonces 403. |
| SPEC-01.5 | Sin sesión, entonces 401. |
| SPEC-01.6 | Persistencia: el producto aparece en `GET /api/productos/mios` del ofertante con su estado, y NO aparece en el catálogo público mientras esté pendiente. |
| SPEC-01.7 | Dado un `vendedor`, cuando intenta publicar un `curso`, entonces 403 y no se guarda. |
| SPEC-01.8 | Dado un `instructor`, cuando intenta publicar un producto `fisico` o `digital`, entonces 403. |
| SPEC-01.9 | Dado un `instructor`, cuando registra un curso con nivel válido, entonces 201 y `pendiente`, con el nivel guardado. Un `vendedor` sí puede publicar `digital`. |
| SPEC-01.10 | Cuando un curso no trae nivel o trae un nivel inválido, entonces 400. |
| SPEC-01.11 | Cuando el tipo no es `fisico`, `digital` ni `curso` (ej. `servicio`), entonces 400. |

### HU-02 Edición o eliminación (Ofertante)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-02.1 | Dado un producto `aprobado`, cuando el dueño cambia un campo crítico, entonces el estado vuelve a `pendiente`. |
| SPEC-02.2 | Dado un producto `aprobado`, cuando el dueño cambia solo `stock`, entonces sigue `aprobado`. |
| SPEC-02.3 | Dado un producto `rechazado`, cuando el dueño cambia un campo crítico, entonces pasa a `pendiente` y se limpia el motivo de rechazo. |
| SPEC-02.4 | Un ofertante no puede editar el producto de otro (403) y el producto no cambia. |
| SPEC-02.5 | Edición con datos incompletos o inválidos, entonces 400 y el producto no cambia. |
| SPEC-02.6 | El dueño puede eliminar su producto: 200 y deja de existir en la BD. |
| SPEC-02.7 | Un ofertante no puede eliminar el producto de otro (403). |
| SPEC-02.8 | Editar o eliminar un producto inexistente, entonces 404. |
| SPEC-02.9 | Dado un curso `aprobado`, cuando el instructor cambia su `nivel`, entonces vuelve a `pendiente`. |
| SPEC-02.10 | Un `vendedor` no puede cambiar su producto a tipo `curso` (403) y el producto no cambia. |
| SPEC-02.11 | Dado un producto `rechazado`, cuando el dueño cambia solo `stock`, entonces sigue `rechazado` y conserva su motivo. |

### HU-03 Validación de contenido (Administrador)
| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| SPEC-03.1 | El administrador lista los productos `pendiente` con `GET /api/admin/productos?estado=pendiente`. |
| SPEC-03.2 | Al aprobar un pendiente, pasa a `aprobado` y aparece en el catálogo público. |
| SPEC-03.3 | Al rechazar con motivo, pasa a `rechazado`, guarda el motivo y no aparece en el catálogo. |
| SPEC-03.4 | Rechazar sin motivo, entonces 400 y el producto sigue `pendiente`. |
| SPEC-03.5 | Aprobar/rechazar un producto que no está `pendiente`, entonces 409. |
| SPEC-03.6 | Un usuario que no es administrador no puede validar (403). |
| SPEC-03.7 | El catálogo público solo muestra `aprobado` (nunca pendiente ni rechazado). |
| SPEC-03.8 | Sin filtro (o con un estado inválido), el administrador ve productos de todos los estados. |

### Consistencia con Sprint 1
| ID | Spec |
|----|------|
| SPEC-00.1 | Al eliminar un usuario (CRUD de Sprint 1), sus productos se eliminan en cascada. |

## Trazabilidad
| Spec | Endpoint |
|------|----------|
| 01.x | `POST /api/productos`, `GET /api/productos/mios` |
| 02.x | `PUT /api/productos/:id`, `DELETE /api/productos/:id` |
| 03.x | `GET /api/admin/productos`, `POST /api/admin/productos/:id/aprobar`, `POST /api/admin/productos/:id/rechazar`, `GET /api/productos` |
| 00.1 | `DELETE /api/usuarios/:id` (Sprint 1) |
