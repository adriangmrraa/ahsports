# 02 · ARCHITECTURE — AH Sports OS

## 1. Stack

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Framework | **Next.js 15** App Router + React 19 | Server components por defecto, server actions para mutaciones, streaming nativo |
| Lenguaje | **TypeScript 5.7 strict** | Tipado estricto en todo el codebase. `tsc --noEmit` debe pasar EXIT 0 antes de cada commit |
| ORM | **Drizzle ORM 0.45** | Tipos generados desde schema, queries type-safe, migraciones explícitas. Más liviano que Prisma, mejor DX que SQL crudo |
| DB | **Neon Postgres** (serverless HTTP driver) | Serverless-friendly (HTTP no requiere conexión persistente), gratis hasta 0.5GB, escala automático |
| Styling | **Tailwind CSS v4** con `@theme` | Sin config legacy, CSS-first, design tokens semánticos |
| UI primitives | Custom (Button, Card, Input, Table) en `src/components/ui/` | Suficiente para el MVP. shadcn/ui se agregaría en F6 si crece |
| Iconos | **Lucide React** | Tree-shakeable, sin CDN runtime |
| Validación | **Zod 3.x** | Schemas compartidos client/server |
| Auth | **Cookie firmada con scrypt + HMAC-SHA256** | Sin NextAuth ni Lucia. Más simple, control total, suficiente para taller con N usuarios |
| Fechas | `Intl.DateTimeFormat` nativo | Sin moment/dayjs |

## 2. Estructura de carpetas

```
App de gestion/
├── src/
│   ├── app/
│   │   ├── (admin)/              # Rutas protegidas (requieren sesión)
│   │   │   ├── layout.tsx        # Sidebar Kinetic Industrial + requireUser
│   │   │   └── admin/
│   │   │       ├── page.tsx              # /admin (dashboard)
│   │   │       ├── pedidos/              # /admin/pedidos + kanban + ficha + planilla + arte + ficha técnica
│   │   │       ├── productos/            # /admin/productos + talles + recetas
│   │   │       ├── insumos/              # /admin/insumos
│   │   │       ├── recetas/              # /admin/recetas (vista global)
│   │   │       ├── organizaciones/       # /admin/organizaciones + perfil
│   │   │       ├── caja/                 # /admin/caja
│   │   │       ├── pagos/                # /admin/pagos
│   │   │       ├── arte/                 # /admin/arte (listado global adjuntos)
│   │   │       └── configuracion/        # /admin/configuracion
│   │   ├── (public)/             # Rutas públicas (sin auth)
│   │   │   └── presupuesto/[step]/       # 5 pasos del wizard público
│   │   ├── seguimiento/[token]/  # Vista pública de seguimiento
│   │   ├── login/                # Pantalla de login
│   │   ├── api/                  # API routes (auth, products, materials, orders, etc.)
│   │   ├── globals.css           # Design tokens Tailwind v4
│   │   ├── layout.tsx            # Root layout (fonts, metadata)
│   │   └── page.tsx              # Landing pública
│   ├── components/
│   │   ├── ui/                   # Primitivos: Button, Card, Input, Table, Badge
│   │   └── layout/               # Sidebar (en (admin)/layout.tsx por ahora)
│   ├── db/
│   │   ├── schema.ts             # 19 tablas + 11 enums Drizzle
│   │   ├── client.ts             # Neon HTTP driver + drizzle wrapper
│   │   ├── seed.ts               # Datos demo (F2-20)
│   │   └── migrations/           # Generadas por drizzle-kit
│   └── lib/
│       ├── auth.ts               # scrypt + cookie firmada + session helpers
│       ├── pricing.ts            # Motor de cotización quoteOrder() + snapshot
│       └── utils.ts              # cn, formatCurrency, formatDate, generatePublicToken
├── docs/                         # Esta carpeta
├── BUILD_PROGRESS.md             # Índice maestro
├── BUILD_PROGRESS-F0..F5.md      # Checkpoints por fase
├── PENDIENTES.md                 # Lo que queda post-MVP
├── drizzle.config.ts
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
└── .env.example
```

## 3. Capas y responsabilidades

| Capa | Responsabilidad |
|------|-----------------|
| `app/` | Routing + composición de UI. Server components hacen fetch directo a `db` |
| `api/` | Endpoints HTTP que aceptan JSON o FormData. Mutaciones que NO encajan como server actions |
| `lib/` | Lógica pura (pricing, format, auth helpers). Sin acceso a React ni Next.js types |
| `db/` | Schema + cliente. Único punto que importa `drizzle-orm` |
| `components/ui/` | UI agnóstica de dominio. Solo presentación + props tipadas |

## 4. Decisiones arquitectónicas

| ID | Decisión | ADR |
|----|----------|-----|
| D1 | **Neon en vez de Supabase** | Pedido explícito del usuario. Neon HTTP driver ideal para serverless en Render. Sin Auth provider (lo construimos nosotros con scrypt) |
| D2 | **Drizzle en vez de Prisma** | Tipos generados automáticamente, migraciones SQL explícitas, mejor DX en serverless. Equivalente a la decisión de AdminYa |
| D3 | **Sin NextAuth** | Solo 4 roles fijos (admin, gerencia, diseñador, operario). Cookie firmada con scrypt es suficiente y evita dependencia pesada |
| D4 | **Tailwind v4 (no v3)** | `@theme` block, CSS-first config. Migración futura más simple |
| D5 | **No shadcn/ui** | El design system "Kinetic Industrial" es muy específico (cyan+amber+violet sobre midnight). shadcn agrega defaults light/dark genéricos que chocarían |
| D6 | **Snapshot de pricing en `orders.snapshot jsonb`** | Trazabilidad: cambios futuros de materiales/técnicas NO alteran pedidos ya cotizados (§4.7 relevamiento) |
| D7 | **Receta más específica gana** | Al cotizar, el motor busca recipe con `(sizeId + techniqueId)` > `(sizeId)` > `(techniqueId)` > `(general)`. Permite excepciones explícitas |
| D8 | **Historial de snapshots append-only + minAdvance del snapshot** | `orders.snapshot_history jsonb` preserva cotizaciones previas (confirm y re-quote hacen append, nunca overwrite). El bloqueo por seña usa el `minAdvancePercent` de la regla freezada en el snapshot vigente (no la regla activa actual): la seña pactada al cotizar no cambia si la regla cambia después. Sin snapshot → regla activa |
| D9 | **Híbrido API routes + server actions en `src/app/actions/`** | Lecturas/CRUD tabulares por `/api/*` (Zod + `requireUser`); flujos multi-paso con redirect/revalidate por server actions co-locadas en `src/app/actions/` (createOrder, createOrderLine, confirmQuote, reQuoteOrder). Las actions recalculan server-side y nunca confían en el input del cliente |
| D10 | **Neon HTTP sin transacciones + db:push quirúrgico** | El driver Neon HTTP no soporta transacciones: writes multi-paso van secuenciales con guards y orden líneas→cabecera→historial. `drizzle-kit push --force` en Neon intenta dropear NOT NULL de PKs (error 42P16): para cambios chicos usar ALTER manual vía script; push completo solo en base vacía. Gate de calidad sin lint (KI-13): `typecheck` + `build` + e2e contra Neon real |
| D11 | **Proveedores como entidad (F6)** | Pedido del usuario: supplier en texto libre no permite automatizar contacto. Tabla suppliers (nombre, telefono, email, direccion, contacto, CUIT, notas) + materials.supplier_id FK set null. Columna texto conservada como legado; migracion 0003 con backfill |
| D12 | **Precio de venta desde costo + margen (F6)** | La ficha manda: precio = costo x (1+margen) x (1+recargo urgente) + redondeo comercial de la regla. products.basePrice deja de ser fuente de verdad (queda referencia/override). quoteOrder bloquea sin receta o kilo sin rendimiento en vez de costo 0 silencioso |
| D13 | **Cotización por talle desde orderItems (F6)** | Las cantidades y talles se leen en servidor desde `order_items`; `quoteOrder()` selecciona la receta específica por talle, con fallback explícito a receta general, y guarda `sizeBreakdown` dentro del snapshot. Nunca se usa `sizeId: null` para una línea que tiene prendas talladas |
| D14 | **Talles con identidad estable (F6)** | El batch de talles actualiza por ID, inserta solo talles nuevos y rechaza borrar talles referenciados por recetas o prendas históricas. La FK de receta usa `RESTRICT`; las eliminaciones son explícitas y seguras |
| D15 | **Costos técnicos trazables (F6)** | `costPerUnit` es por prenda, `setupCost` se cobra una vez por línea/lote y `costPerSquareMeter` solo se calcula con aplicaciones del pedido que tengan técnica y ancho/alto. Si faltan medidas, la cotización se bloquea con error accionable; no se ignora el campo |
| D16 | **Consumo explícito por item BOM (F6.1)** | `bom_items` conserva `quantity` para compatibilidad y agrega `consumption_mode`, `direct_quantity` y `units_per_consumption_unit`. `direct` usa cantidad por prenda; `yield` calcula `1 / unitsPerConsumptionUnit`. El motor no deriva consumos desde medidas terminadas sin datos geométricos explícitos |
| D17 | **Familias, moldes y conjuntos (F6.2)** | `products` identifica `product_kind`, `garment_family`, `garment_type` y un `mold_id` opcional. `garment_molds` define el esquema de medidas reutilizable; cada producto conserva sus propios `sizes` y `bomRecipes`. Un `bundle` usa `product_bundles` + `product_bundle_items`; sus componentes siguen siendo productos individuales y el pricing deriva costo/precio sin mezclar recetas |
| D18 | **Taxonomía general de productos (F6.3)** | `products.product_category`, `product_subcategory` y `product_type` clasifican cualquier artículo. Son textos con vocabulario inicial sugerido en `src/lib/product-taxonomy.ts`, para poder extender categorías sin migrar. `garment_family`, `garment_type` y `mold_id` quedan reservados para lógica específica de prendas y pueden ser nulos; recetas/BOM y pedidos sin talle siguen siendo válidos |
| D19 | **Plataforma de agentes IA provider-neutral (agent-platform)** | Runtime de agente sobre un protocolo de chat genérico (`provider → protocol → adapter`; el modelo se pasa tal cual, NO se mapea a un adapter). Tools de comercio `draft-only` reversibles, secretos en reposo AES-256-GCM, RBAC admin/gerencia, canales Telegram/WhatsApp, y bootstrap de migración en DB fresca pendiente. Ver ADR-19 |

### ADR-19 — Plataforma de agentes IA (provider-neutral, draft-only, multicanal)

Contexto: el asistente de ventas operativo debe poder cambiar de proveedor de IA
sin tocar código, operar sobre Telegram (entrada/salida) y WhatsApp Business
(importación observe-only), y NUNCA cerrar una operación de comercio de forma
autónoma. La plataforma se construyó en fases P0–P6 sobre este worktree.

Decisiones:

1. **Runtime provider-neutral (`provider → protocol → adapter`, modelo pass-through).**
   `src/lib/ai/provider.ts` define el contrato `ChatProvider`; `src/lib/ai/config.ts`
   resuelve el runtime desde `agent_config` (fila singleton `id = 1`);
   `registry.ts` mapea **proveedor/protocolo → adapter** (p. ej. `chat-completions`)
   y el **modelo se pasa tal cual** al adapter — no hay tabla `modelo → adapter`.
   Cambiar de proveedor o modelo es un cambio de datos en la DB, no de código.
2. **Runtime multicanal con registro canónico.** Cada mensaje entrante/saliente se
   persiste como hecho canónico en `chat_messages` (unique
   `(channel, platform_message_id)`), deduplicado vía intake
   (`src/lib/channels/intake.ts` + `router.ts`). Telegram tiene webhook
   verificado por secreto; WhatsApp Cloud API se consume **observe-only**
   (importa los `smb_message_echoes` outbound del operador): **no existe path de
   envío de WhatsApp**.
3. **Tools draft-only, reversibles y con confirmación humana.** El loop solo
   ejecuta efectos `read` y `draft`. Los tools `draft` (lead/cotización/pedido)
   escriben únicamente estado no autoritativo y reversible
   (`contacts.status='nuevo'`, `orders.status='borrador'`); nunca finalizan,
   cobran ni avanzan producción. Todo argumento del modelo se valida con Zod
   antes de ejecutar y los errores de tool se devuelven estructurados y sin
   filtrar texto de excepción (`loop.ts`).
4. **Secretos en reposo.** Bot token, provider key y webhook secret se guardan
   cifrados AES-256-GCM (`src/lib/crypto/secret-box.ts`), write-only desde la UI
   (vacío = conservar, `CLEAR` = borrar). Los secretos de WhatsApp
   (`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) son config-gated por env.
5. **Frontera RBAC.** Todas las páginas/acciones admin del agente (`/admin/agent*`)
   exigen sesión `admin` o `gerencia` vía `requireAgentAdmin`/`authorizeAgentApi`
   (`src/lib/agent/rbac.ts`).
6. **Seam de service-principal diferido a auth por token.** Hoy el cron de
   reconcile se autentica con secreto compartido constant-time
   (`CRON_SECRET`/`AGENT_CRON_SECRET`) o sesión admin/gerencia. Un principal de
   servicio dedicado (token propio, scopes) queda **diferido**; no se inventó uno.
7. **Riesgo de bootstrap de migración en DB fresca (crítico).** `_journal.json`
   es internamente consistente (`0001..0008`, luego `idx 8 = 0010`), PERO la
   migración `0010_agent_platform.sql` referencia `contacts`, `organizations` y
   `users`, y **ninguna migración crea esas tablas core** (vinieron de un
   `db:push` original). En consecuencia, una DB nueva que corra solo
   `db:migrate` **fallará**. Remediation documentada abajo; no se escribió a mano
   un baseline gigante en este worktree sin DB.

Remediation del bootstrap (documentar, no ejecutar acá): generar un baseline
`0000_core_baseline.sql` desde el estado actual con `drizzle-kit` en una DB de
referencia (o exportar el DDL de las tablas core) y encadenarlo antes de `0001`,
con su propia entrada de journal. Hasta entonces, provisionar una DB fresca con
`db:push` (schema dump) y luego `db:migrate` para los incrementales.

**Reconciliación de la cadena al mergear (rama `master` vs esta rama):** la
migración `0009_product_image.sql` existe en `master` pero NO en esta rama.
Al mergear, `0009` debe quedar **antes** de `0010` con su propia entrada de
journal, y `0010` debe re-indexarse **después**:

1. `git merge master` (trae `0009_product_image.sql` y su entrada de `_journal.json`).
2. Verificar que `_journal.json` quede con `idx 8 = 0009_product_image` y
   `idx 9 = 0010_agent_platform` (monótono, sin tags duplicados).
3. Si `0010` quedó con `idx 8` y `0009` con `idx 9`, reordenar: `0009` → `idx 8`,
   `0010` → `idx 9`, ajustando también el campo `when` para mantener el orden
   temporal.
4. `npm run db:migrate` en una DB de referencia para validar el orden resultante
   (idempotente; NO `db:push` en DB con datos).

## 5. Reglas de oro

1. **DB es la única fuente de verdad.** Cero precios hardcoded en `.ts` o `.tsx` (excepto `formatCurrency` que es solo display).
2. **Server components por defecto.** `'use client'` solo cuando hay state/eventos reales.
3. **Named exports** en componentes, **default export** en pages.
4. **Tailwind solo vía CSS vars semánticas** (`bg-surface`, `text-primary`, `border-outline-variant`). Nunca hex inline.
5. **Cada mutación pasa por server action o `/api/*` route.** Nunca escritura directa desde cliente.
6. **Snapshot inmutable** al confirmar cotización. Para re-cotizar, generar nuevo snapshot.
7. **Sin `Math.random()` para datos críticos.** Solo para IDs no sensibles (ya cubiertos por `gen_random_uuid()`).
