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
| POST | `/api/products` | admin | Alta de producto |
| GET | `/api/products/[id]` | admin | Detalle (uso interno, server components usan `db` directo) |
| PATCH | `/api/products/[id]` | admin | Editar |
| DELETE | `/api/products/[id]` | admin | Soft-delete (`active=false`) |
| POST | `/api/products/[id]/sizes` | admin | Reemplazar batch de talles |

## C. Insumos / Materiales

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/materials` | admin | Alta |
| PATCH | `/api/materials/[id]` | admin | Editar |
| (no DELETE) | — | — | Soft-delete vía `PATCH active=false` |

## D. Técnicas

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/techniques` | admin | Alta |
| PATCH | `/api/techniques/[id]` | admin | Editar |

## E. Recetas (BOM)

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/recipes` | admin | Alta |
| POST | `/api/recipes/[id]/items` | admin | Agregar item (material + qty + waste) |
| DELETE | `/api/recipes/items/[id]` | admin | Quitar item |

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
| POST | `/api/orders/[id]/quote` | admin | Ejecutar `quoteOrder()` y guardar snapshot |
| POST | `/api/orders/[id]/stage` | admin | Cambiar stage Kanban + crea productionEvent |
| POST | `/api/orders/[id]/re-quote` | admin | Re-cotizar con snapshot nuevo (no pisa el anterior) |
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

- `lib/actions/orders.ts` — `createOrder`, `addOrderLine`, `quoteOrderAction`, `changeStage`, `reQuoteOrder`
- `lib/actions/products.ts` — `createProduct`, `updateProduct`, `deleteProduct`, `saveSizes`
- `lib/actions/materials.ts` — `createMaterial`, `updateMaterial`
- `lib/actions/payments.ts` — `registerPayment`, `cancelPayment`
- `lib/actions/attachments.ts` — `uploadAttachment`, `setAttachmentStatus`, `addApplication`

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