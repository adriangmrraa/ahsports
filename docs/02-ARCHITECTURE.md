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

## 5. Reglas de oro

1. **DB es la única fuente de verdad.** Cero precios hardcoded en `.ts` o `.tsx` (excepto `formatCurrency` que es solo display).
2. **Server components por defecto.** `'use client'` solo cuando hay state/eventos reales.
3. **Named exports** en componentes, **default export** en pages.
4. **Tailwind solo vía CSS vars semánticas** (`bg-surface`, `text-primary`, `border-outline-variant`). Nunca hex inline.
5. **Cada mutación pasa por server action o `/api/*` route.** Nunca escritura directa desde cliente.
6. **Snapshot inmutable** al confirmar cotización. Para re-cotizar, generar nuevo snapshot.
7. **Sin `Math.random()` para datos críticos.** Solo para IDs no sensibles (ya cubiertos por `gen_random_uuid()`).