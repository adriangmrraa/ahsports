# 03 · API ROUTES — Inventario

> Catálogo completo de endpoints HTTP y server actions.
> Formato: `METHOD /path` — auth — descripción.

## A. Auth

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login email/password, crea cookie sesión |
| POST | `/api/auth/logout` | Sí | Destruye sesión y limpia cookie |
| (form) | `/login` | No | Pantalla de login (server component) |

## B. Productos

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/products` | admin | Alta de producto individual o conjunto; valida taxonomía general, lógica opcional de prenda, molde y componentes |
| GET | `/api/products/[id]` | admin | Detalle (uso interno, server components usan `db` directo) |
| PATCH | `/api/products/[id]` | admin | Editar categoría/subcategoría/tipo general, clasificación de prenda/molde o componentes del conjunto |
| DELETE | `/api/products/[id]` | admin | Soft-delete (`active=false`) |
| POST | `/api/products/[id]/sizes` | admin | Sincronizar batch preservando IDs; rechaza eliminar talles con recetas o prendas históricas |
| GET | `/api/garment-molds` | admin | Listar moldes base activos |
| POST | `/api/garment-molds` | admin | Crear molde con familia y medidas requeridas/opcionales |
| PATCH | `/api/garment-molds/[id]` | admin | Editar definición de medidas del molde |

## C. Insumos / Materiales

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/materials` | admin | Alta (F6: acepta `supplierId`, valida y denormaliza nombre) |
| PATCH | `/api/materials/[id]` | admin | Editar (F6: acepta `supplierId`; valida el estado final combinado, incluido `kilo` + `metersPerKilo > 0`) |
| (no DELETE) | — | — | Soft-delete vía `PATCH active=false` |

## C2. Proveedores (F6)

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/suppliers` | admin | Listar activos |
| POST | `/api/suppliers` | admin | Alta |
| GET | `/api/suppliers/[id]` | admin | Detalle (+ insumos vinculados en la página) |
| PATCH | `/api/suppliers/[id]` | admin | Editar / activar-desactivar |
| (no DELETE) | — | — | Soft-delete vía `PATCH active=false` |

## D. Técnicas

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/techniques` | admin | Alta |
| PATCH | `/api/techniques/[id]` | admin | Editar |

## E. Recetas (BOM)

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/recipes` | admin | Alta; valida que `sizeId` pertenezca al `productId` |
| POST | `/api/recipes/[id]/items` | admin | Agregar item con método `direct` (cantidad por prenda) o `yield` (prendas por unidad), merma y validación de unidad/rendimiento |
| PATCH | `/api/recipes/items/[itemId]` | admin | Editar material, método, cantidad/rendimiento y merma; mantiene `quantity` legado derivado |
| DELETE | `/api/recipes/items/[itemId]` | admin | Quitar item |

## F. Pricing rules

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/pricing-rules` | admin | Alta |
| PATCH | `/api/pricing-rules/[id]` | admin | Editar / activar / desactivar |

## G. Organizaciones + Contactos

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/organizations` | admin | Alta (puede incluir contacto inicial) |
| PATCH | `/api/organizations/[id]` | admin | Editar |
| POST | `/api/contacts` | admin | Alta contacto |
| PATCH | `/api/contacts/[id]` | admin | Editar (incl. status lead) |

## H. Pedidos + Líneas + Prendas

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/orders` | admin | Alta rápida (solo título + estado) |
| PATCH | `/api/orders/[id]` | admin | Editar notas, urgent, etc. |
| POST | `/api/orders/[id]/lines` | admin | Agregar línea (producto + cant + talle + técnica) |
| DELETE | `/api/order-lines/[id]` | admin | Quitar línea |
| (server action) | `confirmQuote({ orderId })` | admin | Ejecutar `quoteOrder()` server-side leyendo talles desde `order_items` y guardar snapshot por talle |
| POST | `/api/orders/[id]/stage` | admin | Cambiar stage Kanban + crea productionEvent |
| (server action) | `reQuoteOrder({ orderId, urgent })` | admin | Re-cotizar server-side por talle con snapshot nuevo (no pisa el anterior) |
| PATCH | `/api/order-items/[id]` | admin | Editar nombre/número/talle de una prenda |
| POST | `/api/order-items/[id]/stage` | admin | Cambiar stage individual |

## I. Pagos

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/payments` | admin | Registrar pago (kind, method, amount, reference) — recalcula bloqueo |
| DELETE | `/api/payments/[id]` | admin | Soft-delete (campo `cancelled`) |

## J. Adjuntos + Aplicaciones

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/attachments` | cliente/admin | Subir archivo (multipart). Acepta FormData con `orderId?`, `organizationId?`, `kind`, `uploadedByRole` |
| PATCH | `/api/attachments/[id]` | admin | Cambiar status, notes, version |
| DELETE | `/api/attachments/[id]` | admin | Soft-delete (`archivado` status) |
| POST | `/api/attachments/[id]/applications` | admin | Agregar aplicación (zone + view + technique + medidas) |
| DELETE | `/api/applications/[id]` | admin | Quitar |
| GET | `/api/attachments` | admin | Listado con filtros (`?orderId&organizationId&kind&status`) |

## K. Público (sin auth)

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/public/quote` | público | Wizard 5 pasos: crear pedido borrador con token |
| POST | `/api/public/quote/upload` | público | Upload de adjunto por cliente (vinculado a `publicToken`) |
| GET | `/api/public/order/[token]` | público | Datos seguros del pedido (sin costos internos) |

## L. Settings

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/settings` | admin | Upsert key-value |

## M. Server actions (alternativa a API routes)

Para mutaciones dentro de server components, usamos **server actions** en archivos del módulo:

- `src/app/actions/orders.ts` — `createOrder`, `createOrderLine`, `confirmQuote`, `reQuoteOrder`
- `src/app/actions/organizations.ts` — mutaciones de organizaciones y contactos
- `src/app/actions/payments.ts` — `registerPayment`, `cancelPayment`
- `src/app/actions/attachments.ts` — `uploadAttachment`, `setAttachmentStatus`, `addApplication`

Cada server action valida con Zod + verifica sesión + ejecuta la operación. Son equivalentes a las API routes, viven en el codebase y permiten type-safety end-to-end.

## N. Resumen

- Total endpoints API: ~30
- Server actions: ~20
- Auth requerida en todos EXCEPT `/api/auth/login`, `/api/public/*`, `/presupuesto/*`, `/seguimiento/*`, `/login`, `/`

---

## Detalles importantes

- **Body parsing**: API routes usan `req.json()` o `req.formData()`. Server actions reciben FormData o args tipados.
- **Errores**: `NextResponse.json({ error }, { status })` con códigos 400/401/404/500.
- **Validación**: Zod en TODA entrada. Server actions validan con `safeParse` antes de tocar DB.
- **CSRF**: server actions tienen CSRF protection built-in de Next.js. API routes usan cookie httpOnly + sameSite=lax.
