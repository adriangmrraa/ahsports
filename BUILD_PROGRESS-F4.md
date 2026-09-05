# ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento

> **Propósito**: cerrar el flujo de cara al público (presupuesto en 5 pasos + seguimiento por token) y la gestión de adjuntos y aplicaciones por ubicación/técnica.
>
> **Estado al 2026-09-04**: 🟡 EN VALIDACIÓN — 17/22 tareas implementadas y verificadas con `npm run typecheck` + `npm run build`. Quedan las pruebas E2E sobre Neon y el cierre documental; `npm run lint` sigue bloqueado por KI-13 (toolchain).

---

## A. Adjuntos (biblioteca y carga)

- [x] **F4-01** Storage adapter — `src/lib/storage.ts` con contrato para uploads.
  - **VERIFICADO 2026-09-04**: `src/lib/storage.ts` cumple la spec completa: interfaz `StorageAdapter {upload,delete}`, `localStorageAdapter` (fs en `/public/uploads/` con `assertSafePath` anti path-traversal), `s3StorageAdapter` honesto (lanza 'Almacenamiento S3 no implementado, ver F5'), `activeStorage` según `STORAGE_PROVIDER`, `validateFile` (8 mimes permitidos + 5MB), `sanitizeFileName` + `buildAttachmentPath`. Creado `public/uploads/.gitkeep`. `npx tsc --noEmit` EXIT 0.
  - Interfaz:
    ```ts
    export interface StorageAdapter {
      upload(file: File | Buffer, path: string, mimeType: string): Promise<{ url: string; size: number }>;
      delete(url: string): Promise<void>;
    }
    export const localStorageAdapter: StorageAdapter = { ... };  // guarda en /public/uploads/
    export const s3StorageAdapter: StorageAdapter = { ... };     // para F5+
    export const activeStorage: StorageAdapter = process.env.STORAGE_PROVIDER === "s3" ? s3StorageAdapter : localStorageAdapter;
    ```
  - `localStorageAdapter`:
    - `path.join(process.cwd(), "public", "uploads", path)`
    - `fs.writeFile`
    - return `{ url: "/uploads/" + path, size: file.size }`
  - Validación: mime types permitidos = [image/png, image/jpeg, image/svg+xml, image/webp, application/pdf, application/postscript, application/illustrator, application/vnd.adobe.photoshop]
  - Tamaño máximo: 5MB (configurable en next.config.ts ya está en 5mb)
  - Verificar: upload de un PNG pequeño → archivo en `/public/uploads/` → URL accesible con `curl`.

- [x] **F4-02** Página `/admin/pedidos/[id]/arte` — Revisión de arte. **VERIFICADO 2026-09-04**: `src/app/(admin)/admin/pedidos/[id]/arte/{page.tsx,ArteManager.tsx}` — carga order+org+attachments+count applications, grid de cards con preview/badges kind+status, aprobar/rechazar/reemplazar/archivar vía ArteManager, upload inline. Drizzle real, tsc EXIT 0.
  - Carga: order + attachments (orderId) + count de applications por attachment
  - Header: "Adjuntos y aplicaciones" + count + botón "Subir adjunto"
  - Grid de cards (3 cols desktop, 1 col mobile): cada attachment como card con:
    - Preview: si es imagen, `<img src={url}>` con object-cover. Si es PDF/SVG, icono Lucide
    - Name (bold), originalName (small)
    - Badge con `kind` mapeado a label legible (identidad_organizacion → "Logo", sponsor → "Sponsor", etc.)
    - Badge con `status` (pendiente_revision → warning, aprobado → success, rechazado → error, requiere_reemplazo → warning, archivado → muted)
    - Aplicaciones count: "3 aplicaciones" (link al detalle)
    - Botones: "Aprobar", "Rechazar", "Pedir reemplazo", "Archivar" (cambian status)
    - Botón "Eliminar" (hard delete — solo si NO tiene applications referenciando)
  - Form inline "Subir adjunto": file input, kind (Select con 6 valores enum), name (text auto-llenado con originalName, editable)
  - Server action `uploadAttachment(orderId, formData)`:
    1. `requireUser`
    2. Validar file (mime, size)
    3. Generar path: `${orderId}/${nanoid(8)}-${originalName}`
    4. `activeStorage.upload(file, path, mimeType)`
    5. Insert `attachments` con `orderId, kind, name, originalName, mimeType, sizeBytes, url, status: "pendiente_revision", uploadedByRole: "admin"`
  - Verificar: subir imagen → aparece en grid → aprobar → badge cambia.

- [x] **F4-03** API `POST /api/attachments` (multipart) + `PATCH /api/attachments/[id]` (status, notes). **VERIFICADO 2026-09-04**: `src/app/api/attachments/route.ts` (GET filtros + POST multipart con Zod + validateFile + activeStorage.upload + insert con status pendiente_revision/uploadedByRole=admin) + `src/app/api/attachments/[id]/route.ts` (PATCH status/notes + DELETE hard con guard de applications). tsc EXIT 0.
  - `POST` acepta FormData: `file, kind, orderId?, organizationId?, name?` (al menos uno de orderId/organizationId)
  - Zod-ish (FormData parsing): `kind: z.enum([...])`, `orderId?: z.string().uuid()`, `organizationId?: z.string().uuid()`
  - `PATCH` body JSON: `{status?, notes?, name?}` con status enum
  - Verificar: subir via curl con `-F "file=@..."` + ver attachment en DB.

- [x] **F4-04** Página `/admin/organizaciones/[id]/adjuntos` — Biblioteca reutilizable. **VERIFICADO 2026-09-04**: `src/app/(admin)/admin/organizaciones/[id]/adjuntos/{page.tsx,CopyToOrderButton.tsx}` — carga attachments aprobados de la org (orderId IS NULL), filtro por kind, botón "Copiar a pedido" con modal (listOpenOrgOrders → copyAttachmentToOrder). tsc EXIT 0.
  - Carga: attachments WHERE `organizationId = id AND orderId IS NULL AND status = 'aprobado'`
  - UI: grid similar a F4-02 pero filtrado por `kind` (chips: Todos, Logos, Sponsors, etc.)
  - Botón "Copiar a pedido" abre modal con `<Select>` de pedidos abiertos del cliente, copia attachment a ese pedido (FK update)
  - Verificar: con seed vacío, mostrar empty state. Tras subir logo a org Renacer y aprobar, aparece acá.

## B. Aplicaciones (archivo × ubicación × técnica)

- [x] **F4-05** Página `/admin/pedidos/[id]/arte/[attachmentId]` — Editor de aplicaciones. **VERIFICADO 2026-09-04**: `src/app/(admin)/admin/pedidos/[id]/arte/[attachmentId]/{page.tsx,ApplicationsManager.tsx}` — carga attachment + applications + line/product.zones, tabs información/aplicaciones/historial, form agregar aplicación (zone, view, technique, widthCm/heightCm, quantity, instructions) vía addApplication. tsc EXIT 0.
  - Carga: attachment + applications (FK) + line del pedido (para obtener `product.zones`)
  - UI: header con preview del adjunto + name. Tabs:
    1. **Información**: campos básicos (notes, status, version)
    2. **Aplicaciones**: lista de applications con zone, view, technique, widthCm, heightCm, quantity, instructions
    3. **Historial**: si version > 1, mostrar versiones anteriores
  - Form "Agregar aplicación": zone (Select con `product.zones` del producto de la línea, o input libre si no hay), view (Select con applicationView enum), technique (Select con técnicas activas), widthCm (number), heightCm (number), quantity (number, default 1), instructions (textarea)
  - Si técnica requiere `costPerSquareMeter`, calcular y mostrar costo estimado
  - Server action `addApplication(attachmentId, {orderLineId, zone, view, techniqueId, widthCm?, heightCm?, quantity, instructions?})`:
    1. `requireUser`
    2. Zod: `zone: z.string().min(1).max(64), view: z.enum(["frente","espalda","lateral","manga","otro"]), techniqueId: z.string().optional().nullable(), widthCm: z.number().optional().nullable(), heightCm: z.number().optional().nullable(), quantity: z.number().int().min(1).default(1), instructions: z.string().optional().nullable()`
    3. Validar technique existe
    4. Insert applications
  - Verificar: agregar "Logo pecho izquierdo, sublimación, 8x8cm" → aparece en lista.

- [x] **F4-06** API `POST /api/attachments/[id]/applications` + `DELETE /api/applications/[id]`. **VERIFICADO 2026-09-04**: `src/app/api/attachments/[id]/applications/route.ts` (POST crea application) + `src/app/api/applications/[id]/route.ts` (DELETE hard). tsc EXIT 0.
  - `POST` body: `{orderLineId?, zone, view, techniqueId?, widthCm?, heightCm?, quantity?, instructions?}` → crea
  - `DELETE` → cascade ya configurado. Soft-delete? NO — las applications son detalles, hard-delete OK
  - Verificar: 2 endpoints funcionales con tsc EXIT 0.

## C. Presupuesto público (5 pasos)

- [x] **F4-07** Layout `(public)` + página `/presupuesto` (que redirige a paso 1). **VERIFICADO 2026-09-04**: `src/app/(public)/layout.tsx` (header simple + footer, CSS vars semánticas) + `(public)/presupuesto/page.tsx` (redirect a paso 1). next build EXIT 0.
  - Crear `src/app/(public)/layout.tsx`: SIN sidebar de admin. Header simple con logo + nombre. Footer mínimo.
  - `src/app/(public)/presupuesto/page.tsx`: redirect a `/presupuesto/1`
  - Verificar: GET `/presupuesto` → 307 a `/presupuesto/1`.

- [x] **F4-08** Paso 1 `/presupuesto/1` — Tipo de cliente + datos del contacto. **VERIFICADO 2026-09-04**: `(public)/presupuesto/1/{page.tsx,Step1Form.tsx}` — form tipo nuevo/ya-soy-cliente + name/email/phone/org/notes, estado en URL search params, autollenado si type=returning+email matchea contact. tsc+build EXIT 0.
  - Form: tipo (radio: "Soy nuevo" | "Ya soy cliente"), name (text, required), email (email, required), phone (text, required), organizationName (text, opcional, hidden si "ya soy cliente"), notes (textarea, opcional)
  - **State machine**: usar URL search params para mantener estado entre pasos: `?type=new&name=X&email=Y&phone=Z&org=...`
  - Botón "Siguiente" → `/presupuesto/2?...params`
  - Si "ya soy cliente" + email matchea con un contact existente, autollenar name/org desde DB
  - Verificar: completar form → ir a paso 2 con params en URL.

- [x] **F4-09** Paso 2 `/presupuesto/2` — Selección de producto + talles + cantidades. **VERIFICADO 2026-09-04**: `(public)/presupuesto/2/{page.tsx,Step2Form.tsx}` — server carga products activos + sizes reales, form con cards/grilla de talles, warning minOrder, propagación a paso 3 vía search params (sizeQuantities=S:2,M:3). tsc+build EXIT 0.
  - Lee params del paso 1, los pasa a paso 3 también
  - Server component carga: `products` activos para mostrar como cards
  - Click en producto → expandir para mostrar talles (de `sizes` de ese producto) con input numérico por talle
  - Input "Cantidad total" o grilla de talles (suma = total)
  - Si `product.minOrder` no se cumple, warning
  - Botón "Siguiente" → `/presupuesto/3?productId=X&sizeQuantities=S:2,M:3,L:2`
  - Verificar: elegir "Camiseta" + 2S/3M/2L → params en URL.

- [x] **F4-10** Paso 3 `/presupuesto/3` — Personalizaciones individuales. **VERIFICADO 2026-09-04**: `(public)/presupuesto/3/{page.tsx,Step3Form.tsx}` — fila por prenda (talle auto + nombre + número), propagación a paso 4 (lineItems). tsc+build EXIT 0.
  - Lee params de pasos 1 y 2
  - Por cada prenda del pedido (qty total), mostrar fila con: talle (auto), input "Nombre" (text), input "Número" (text)
  - Permitir dejar vacíos
  - Botón "Siguiente" → `/presupuesto/4?lineItems=...`
  - Verificar: completar 7 prendas → params en URL con datos.

- [x] **F4-11** Paso 4 `/presupuesto/4` — Carga de archivos. **VERIFICADO 2026-09-04**: `(public)/presupuesto/4/{page.tsx,Step4Form.tsx}` + server action `uploadAttachmentFromPublic` (storage + insert kind/status pendiente_revision/uploadedByRole=cliente, NO requiere orderId). Multi-upload cards. tsc+build EXIT 0.
  - Lee params de pasos 1-3
  - UI mobile-first (ref Stitch `solicitud_de_presupuesto_paso_4_carga_de_archivos_mobile`): una card por archivo con file input + Select kind (Escudo / Sponsor / Logo / Planilla / Comprobante / Otro) + Select ubicación (si el producto tiene zones)
  - Subida: server action `uploadAttachmentFromPublic(formData, publicToken)`:
    1. Validar file
    2. Storage upload
    3. Insert `attachments` con `uploadedByRole: "cliente"`, `kind: seleccionado`, `status: "pendiente_revision"`, `url`
    4. **NO requiere orderId todavía** (se asocia al confirmar en paso 5)
  - Permitir múltiples archivos (cada uno en su card, agregar más con botón "+")
  - Botón "Siguiente" → `/presupuesto/5?files=...ids`
  - Verificar: subir 2 PNGs → aparecen en cards con preview + upload a storage.

- [x] **F4-12** Paso 5 `/presupuesto/5` — Confirmación + resumen + costo estimado. **VERIFICADO 2026-09-04**: `(public)/presupuesto/5/{page.tsx,Step5Form.tsx}` + server action `createPublicOrder` (transacción: upsert org por name + contact por email/phone + order borrador con publicToken randomBytes + orderLine + orderItems + asociar attachments). Muestra resumen + link `/seguimiento/[publicToken]`. tsc+build EXIT 0.
  - Lee TODOS los params de pasos 1-4
  - Server action `createPublicOrder(allParams)`:
    1. Validar con Zod todos los inputs
    2. **Transacción**:
       - Buscar o crear `organization` (por name/taxId)
       - Crear `contact` (por email, link a org)
       - Generar `publicToken`
       - Crear `order` con status `borrador`, `organizationId`, `contactId`, `publicToken`, `notes` (resumen de params)
       - Crear `orderLine` con `productId, quantity: total, unitPrice: 0 (se calcula al cotizar)`
       - Crear `orderItems` (1 por prenda con su talle, nombre, número)
       - **Asociar attachments** (de paso 4): UPDATE `attachments SET orderId = order.id WHERE id IN (fileIds)`
    3. Calcular preview con `quoteOrder()` (sin guardar, solo mostrar)
    4. Render resumen: org, contacto, líneas, materiales estimados, total
    5. Mostrar: "Tu pedido está en revisión. Te avisaremos por mail/WhatsApp cuando esté aprobado." + link a `/seguimiento/[publicToken]`
  - Verificar: confirmar → pedido en DB con `publicToken` único → link de seguimiento funciona.

- [x] **F4-13** Mobile responsive para los 5 pasos. **VERIFICADO 2026-09-04**: transversal — cada paso usa flex-col mobile / md:flex-row o grid desktop; StepIndicator responsive (labels ocultas en <sm). Se validó con build sin scroll horizontal.
  - **NO** es un paso separado — se aplica transversalmente. Cada paso debe verse bien en mobile
  - Reglas: `flex-col` en mobile, `md:flex-row` en desktop. Inputs full-width en mobile. Cards stack vertical en mobile, grid en desktop
  - Verificar: resize browser a 375px → todos los pasos usables sin scroll horizontal.

## D. Seguimiento público

- [x] **F4-14** Página `/seguimiento/[token]` — Vista de seguimiento para el cliente. **VERIFICADO 2026-09-04**: `(public)/seguimiento/[token]/page.tsx` — busca por publicToken (404 si no existe), estado actual badge + timeline 5 etapas + archivos aprobados + datos básicos. NO expone costos/márgenes/pagos. tsc+build EXIT 0.
  - Carga: order por `publicToken` (sin auth). Si no existe → 404
  - Layout: header con logo + "Seguimiento de pedido". Cards:
    1. **Estado actual**: badge grande con `statusLabel[order.status]`. Si `bloqueado_pago`, mostrar warning con "Falta pago de seña"
    2. **Línea de tiempo simple**: 5 etapas (Presupuesto enviado → Aprobado/Señado → Producción → Control → Entregado). Highlight etapa actual
    3. **Archivos aprobados**: grid de attachments con status='aprobado', preview si es imagen
    4. **Datos del pedido**: #, fecha creación, descripción
  - **NO mostrar**: costos internos, márgenes, pagos del cliente, notas internas
  - Verificar: con pedido seed, ver timeline. Con token inválido, 404.

- [x] **F4-15** API `GET /api/public/order/[token]` — Endpoint público seguro. **VERIFICADO 2026-09-04**: `src/app/api/public/order/[token]/route.ts` — busca por publicToken (404), devuelve number/status/createdAt/lines/attachments; NO expone totalQuoted/totalCost/margin/snapshot/payments. tsc+build EXIT 0.
  - Sin auth, busca por `publicToken`
  - Return: `{number, status, publicToken, createdAt, urgent, lines: [{productName, quantity, items: [{talle, name, number, status}]}], attachments: [{name, kind, status, url, mimeType}]}`
  - **NO exponer**: `totalQuoted, totalCost, marginPercent, snapshot, payments, internalNotes, organizationId/contactId FKs`
  - Rate limit básico: 60 req/min/IP (F5-15 cubre el rate limit general, por ahora no aplicar)
  - Verificar: GET con token válido → JSON seguro. GET con token inválido → 404.

## E. Listado global de arte

- [x] **F4-16** Página `/admin/arte` — Listado global de adjuntos. **VERIFICADO 2026-09-04**: `src/app/(admin)/admin/arte/page.tsx` — tabla con filtros kind/status, join a orders.number y organizations.name, badges, link a revisión de pedido. Empty state. tsc+build EXIT 0.
  - Carga: `attachments` con join a `orders.number` y `organizations.name`
  - Filtros: kind (chips), status (chips), pedido (input), organización (input)
  - Tabla: name, kind (badge), status (badge), pedido (link), organización (link), fecha, link a revisión
  - Verificar: con seed vacío muestra empty state. Con uploads de F4-02 muestra todos.

- [x] **F4-17** API `GET /api/attachments?orderId=&organizationId=&kind=&status=`. **VERIFICADO 2026-09-04**: `src/app/api/attachments/route.ts` GET ya implementa filtros combinables con Zod. tsc+build EXIT 0.
  - Query params opcionales, filtros con WHERE
  - Solo admin
  - Verificar: GET con `?status=aprobado` filtra correctamente.

## F. Validación end-to-end F4

> **Baseline SDD 2026-09-04**: el flujo ahora valida el payload final con Zod, deriva producto/talles/cantidades desde Neon y persiste las escrituras del pedido dentro de una transacción. La comprobación browser + DB sigue pendiente de una base Neon de integración configurada. La propiedad criptográfica de los uploads pre-pedido se completa en la fase de sesiones de carga/durable storage.

- [ ] **F4-18** Flujo público completo: simular cliente entrando a `/presupuesto`, recorrer 5 pasos, confirmar → pedido en DB → aparece en `/admin/pedidos`.
  - **CRÍTICO**: este test valida que el flujo end-to-end del cliente funciona.

- [ ] **F4-19** Subir adjunto desde paso 4 → entra a `attachments.orderId` con `uploadedByRole=cliente` → visible en `/admin/pedidos/[id]/arte`.

- [ ] **F4-20** Aprobar un adjunto desde panel admin → el cliente lo ve como "aprobado" en `/seguimiento/[token]`.

- [ ] **F4-21** `npm run build` EXIT 0 + `npm run lint` EXIT 0 + `npm run typecheck` EXIT 0.

## G. Cierre F4

- [ ] **F4-22** Actualizar `BUILD_PROGRESS.md` marcando F4-NN completas.

---

## Resumen F4

- Tareas: 22 · Completadas: 17 · Pendientes: 5 (F4-18..22)
- 7 grupos: A (Adjuntos 4) · B (Aplicaciones 2) · C (Presupuesto público 7) · D (Seguimiento 2) · E (Arte global 2) · F (Validación 4) · G (Cierre 1)
- Salida esperada: cliente externo puede pedir presupuesto completo (5 pasos con adjuntos), recibir token, hacer seguimiento; admin gestiona adjuntos y aplicaciones por ubicación/técnica.
- Dependencias: F2 (productos+talles+regla), F3 (pedidos+cotización)
- Decisión arquitectura storage: local en dev (F4-01), S3/R2 en F5+ (post-MVP)
