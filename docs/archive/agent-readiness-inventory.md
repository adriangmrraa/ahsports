# AH Sports — AI Agent Readiness Inventory

> Exploration-only architecture analysis. No product code, DB, env, dependencies or destructive commands were changed.
> Branch: `adriangmrraa/ah-agent-readiness-inventory` · Base tip at analysis time: `675e6e1` (`feat(ux): tablas responsive a tarjetas en mobile y mejoras visuales`).
> Method: read `AGENTS.md` + `KNOWN-ISSUES.md` first; indexed this worktree with the codebase-memory MCP (`C-Users-Asus-orca-workspaces-App-de-gestion-ah-agent-readiness-inventory`, 4467 nodes / 6197 edges) and drove exploration with graph/search tools before raw reads. Facts below cite `file:line` from the checked-out working tree.

---

## 0. Executive summary

AH Sports is a **Next.js 15 App Router** app for a sportswear workshop: public landing + catalog + 5-step quote wizard + public order tracking, and an admin panel covering orders, products, BOM recipes, materials, suppliers, techniques, molds, art/attachments, cash/payments and configuration. Data is Postgres (Neon) via **Drizzle ORM 0.45** over `@neondatabase/serverless`; auth is custom (scrypt + HMAC cookie). There is **no test runner**, **no background/queue/cron infrastructure**, and **no external integrations at all** (zero `fetch(`/SDK calls in `src/`).

Readiness for the two requested agents:

- **Telegram internal agent** — the *data model and write services largely exist*, but the *control plane does not*: RBAC is declared and unused, server actions are cookie-bound, there is no service-actor concept, no durable idempotency, and no outbound notifier. The blocking gaps are authz + service extraction, not domain modeling.
- **AI sales agent** — the *public intake path is a clean, fully-validated seam* (`createPublicOrder` + `createPublicOrderSchema`), and `quoteOrder()` already computes prices server-side. Missing pieces are conversational persistence (`chat_messages` does not exist), lead/conversation tooling, LLM/transport credentials, and outbound messaging.

---

## 1. System snapshot

| Aspect | Verified fact | Source |
|---|---|---|
| Framework | Next.js `^15.1.0`, React `^19.0.0`, TS strict | `package.json:22-25`, `tsconfig.json` |
| ORM / driver | Drizzle `^0.45.2` on `@neondatabase/serverless` `^1.0.2` (HTTP) | `package.json:18,21` |
| Validation | Zod `^3.24.1` | `package.json:27` |
| UI | Tailwind v4 (`@theme` block), Lucide `^0.469.0` | `src/app/globals.css:3`, `package.json:22` |
| Auth | Custom: scrypt + HMAC-SHA256 signed cookie | `src/lib/auth.ts:11-50` |
| Tests | **None** — no test script, no vitest/jest/playwright | `package.json:5-16` |
| Lint | **Broken at toolchain level** (KI-13) — gate is `typecheck` + `build` | `KNOWN-ISSUES.md:297-307` |
| Deploy | Render web service + Dockerfile (node:22-alpine) | `render.yaml`, `Dockerfile` |
| Migrations | 9 idempotent SQL files `0001..0009` + Drizzle journal | `src/db/migrations/` |
| TypeScript files | 152 `.ts`/`.tsx` under `src/` | count |
| Client components | 33 files with `"use client"` | count |

Deployment detail worth noting for any async work: `render.yaml:6` runs `npm install && npm run db:push && npm run build` in the build step. `db:push` is a **schema-drift hazard** (it can alter/drop without a reviewed migration) and is directly counter to the project rule that migrations are idempotent SQL applied with `db:migrate` (`AGENTS.md` DB rules).

---

## 2. Route & entry inventory

### 2.1 Admin pages (`src/app/(admin)/admin/`, 38 `page.tsx`)
Dashboard (`page.tsx`), `arte`, `caja` + `caja/[organizationId]`, `configuracion` + `configuracion/catalogo`, `insumos` (+`nuevo`, `[id]`), `moldes`, `organizaciones` (+`nuevo`, `[id]`, `[id]/adjuntos`), `pagos`, `pedidos` (+`nuevo`, `[id]`, `[id]/arte`, `[id]/arte/[attachmentId]`, `[id]/cotizar`, `[id]/ficha-tecnica`, `[id]/linea/nueva`, `[id]/pagos`, `[id]/planilla`, `[id]/planilla/[itemId]`, `bloqueados`, `kanban`), `productos` (+`nuevo`, `[id]`, `[id]/recetas`, `[id]/talles`), `proveedores` (+`nuevo`, `[id]`), `recetas`, `tecnicas`.

### 2.2 Public pages (`src/app/(public)/`)
Landing (`page.tsx`), `catalogo`, `presupuesto` (wizard entry) + steps `1..5`, `seguimiento` + `seguimiento/[token]`. Plus `src/app/login` (`page.tsx` + `LoginForm.tsx`).

### 2.3 API routes (`src/app/api/**/route.ts`, 40 files)
Auth: `auth/login`, `auth/logout`. Admin CRUD under `applications/[id]`, `attachments` + `attachments/[id]` + `[id]/applications`, `contacts` + `[id]`, `garment-molds` + `[id]`, `materials` + `[id]`, `order-items/[id]` + `[id]/stage`, `order-lines/[id]`, `orders` + `[id]/lines` + `[id]/stage`, `organizations` + `[id]`, `payments` + `[id]`, `pricing-rules` + `[id]`, `product-taxonomy` + `[id]`, `products` + `[id]` + `[id]/image` + `[id]/sizes`, `recipes` + `[id]/items` + `items/[itemId]`, `suppliers` + `[id]`, `techniques` + `[id]`. Public: `api/public/order/[token]`.

### 2.4 Server actions (`src/app/actions/`, 6 files)
`orders.ts` (createOrder, createOrderLine, confirmQuote, reQuoteOrder), `public-orders.ts` (beginPublicUploadSession, uploadAttachmentFromPublic, createPublicOrder), `attachments.ts` (uploadAttachment, addApplication, copyAttachmentToOrder, listOpenOrgOrders, listOrgLibrary), `payments.ts` (registerPayment, cancelPayment), `organizations.ts`, `settings.ts` (updateSetting).

### 2.5 Auth boundary entry points
`requireUser()` has fan-in **68** (the single dominant auth gate). `requireRole()` has fan-in **0** (see §4).

---

## 3. Admin navigation, layout & UI/form patterns

- **Single admin layout** `src/app/(admin)/layout.tsx:10-86`: calls `requireUser()`; computes two order-count badges inline (`activeRows`, `blockedRows`, lines 13-21); renders a fixed sidebar from `getAdminNavItems()` and `<AdminMobileNav>`; children render inside `<main>`.
- **Nav is data-driven** in `src/components/layout/adminNavigation.ts:45-61` (15 items: Dashboard, Pedidos, Producción, Bloqueados, Productos, Moldes base, Recetas (BOM), Insumos, Proveedores, Técnicas, Clientes, Arte & adjuntos, Caja & saldos, Pagos, Configuración) with an icon map (lines 63-79) and badge injection (lines 81-87). Adding an "Agent/IA" admin surface = one array entry here + one page folder.
- **There are no per-section layouts** and **no shared form primitives**: the only UI kit is `src/components/ui/{Button,Card,Input,Table}.tsx`. Every form is a hand-rolled `"use client"` component (33 total) that calls server actions or `fetch` and reads `{ok,error}` results. Representative: `admin/configuracion/PricingRulesManager.tsx`, `admin/insumos/nuevo/InsumoForm.tsx`, `admin/pedidos/[id]/cotizar/QuoteActions.tsx`.
- **Layout/nav shell components**: `src/components/layout/{PublicShell,AdminMobileNav}.tsx`.

**Implication for an in-app agent console:** the cheapest UI seam is a new `adminNavigation.ts` entry + a page that renders a client component; there is no design-system cost to reuse beyond `Card`/`Button`/`Input`/`Table`.

---

## 4. Auth & RBAC (critical finding)

`src/lib/auth.ts`:
- Passwords: `scryptSync` 64-byte, `salt:hash` (`:11-23`).
- Sessions: DB row in `sessions` + cookie `ah_session` = `id.signature`, HMAC-SHA256, TTL 7 days, `httpOnly`, `sameSite=lax`, `secure` in prod (`:36-50, 62-74`).
- `SESSION_SECRET` **falls back to a hardcoded dev string** when unset (`:26`): `process.env.SESSION_SECRET || "dev-secret-please-change-in-production"`. No env validation layer exists, so a misconfigured runtime silently produces forgeable sessions.
- `requireUser()` (`:76-80`) redirects to `/login`. `requireRole(roles)` (`:82-86`) exists.

**RBAC is not enforced anywhere.** A codebase-memory search and a full grep for `requireRole` return **only the definition** (in-degree 0). There is **no `middleware.ts`**. Every admin page and every mutating API route calls `requireUser()` alone — e.g. `api/orders/route.ts:8`, `api/organizations/route.ts:8`, `api/materials/[id]/route.ts:9`, `api/payments/route.ts:9`, `actions/orders.ts:15,46,139,231`. Consequences:
1. Any authenticated user of **any** role (`admin | gerencia | disenador | operario`, `schema.ts:17`) can perform **every** mutation, including pricing, payments and destructive deletes.
2. A bot/service account added as a normal user would inherit **full write power** — unacceptable for an internal agent.

The `users` table has no service/token concept (`schema.ts:70-78`): no API keys, no `kind`, no scopes, no last-used. Sessions are cookie-only.

**Login rate limiting is in-memory and per-instance** (`api/auth/login/route.ts:7-27`, a module-level `Map`): it does not survive cold starts and is not shared across Render instances.

---

## 5. Data model, migrations & JSONB conventions

`src/db/schema.ts` defines 19 enums and 26 tables. Domain groups:

| Group | Tables |
|---|---|
| Identity | `users`, `sessions` |
| Clients/leads | `organizations`, `contacts` (lead status lives here) |
| Catalog/product | `products` (garment/bundle), `productTaxonomyNodes`, `garmentMolds`, `sizes`, `productBundles`, `productBundleItems` |
| Costing/BOM | `materials`, `suppliers`, `techniques`, `bomRecipes`, `bomItems`, `pricingRules` |
| Orders | `orders`, `orderLines`, `orderItems`, `productionEvents` |
| Files | `uploadSessions`, `attachments`, `applications` |
| Money | `payments`, `paymentEvents` |
| Config | `settings` |

Notable modeling facts:
- **Leads are `contacts`**, typed by `leadStatus` enum `nuevo|contactado|calificado|convertido|perdido` (`schema.ts:61,104`). There is **no dedicated `leads` table**; an AI sales agent's pipeline state would extend `contacts` (or add a new table).
- **Order identity**: `orders.number` is `generatedAlwaysAsIdentity()` and `orders.publicToken` is a 64-char unique bearer token (`schema.ts:280-281`); the public tracking API/page key off the token.
- **Money is `numeric(14,2)`** returned by Drizzle as strings; `src/lib/payments.ts:16-35` (`toCents`/`fromCents`) is the mandated integer-cents path — never float math.

### JSONB conventions (the existing pattern to extend)
| Column | Type | Default | Source |
|---|---|---|---|
| `orders.snapshot` | `PricingSnapshot \| null` | null | `schema.ts:289,322-356` |
| `orders.snapshotHistory` | `SnapshotHistoryEntry[]` | `'[]'` | `schema.ts:290,358-362` |
| `products.zones` | `string[]` | `'[]'` | `schema.ts:181` |
| `garmentMolds.measurementSchema` | `{required[],optional[]}` | `'{"required":[],"optional":[]}'` | `schema.ts:153,159` |
| `sizes.measurements` | `Record<string,number>` | `'{}'` | `schema.ts:209` |
| `settings.value` | `jsonb` (untyped) | — | `schema.ts:526-530` |

Pattern: **typed via `.$type<T>()` + a SQL default literal**, and `settings.value` is the generic key/value bag used by `updateSetting` (`actions/settings.ts:41-44`, keys gated by `taller_` prefix) — the natural place to stash agent flags, but note `updateSetting` does **not** validate the value shape.

### Migrations
`src/db/migrations/0001..0009` are idempotent (`IF NOT EXISTS`) and journalled (`meta/_journal.json`, idx 0-8). `AGENTS.md` mandates this style; `db:migrate` is safe to re-run, `db:seed` is a destructive `TRUNCATE` (`src/db/seed.ts:41`) requiring explicit confirmation. **Adding agent tables must follow the `000N_*.sql` + journal pattern — do not rely on `render.yaml`'s `db:push`.**

### Seed / credentials
`src/db/seed.ts:28-37` requires `ADMIN_PASSWORD` (min 8, no default) and creates `admin@ahsports.com`; demo org `Club Renacer`, 4 suppliers, 6 materials, 5 techniques, 1 active pricing rule (`Estándar 2026`), 4 products, sizes S/M/L/XL, 1 BOM recipe (`seed.ts:44-151`).

---

## 6. Domain boundaries (verified)

- **Products/pricing boundary** — `src/lib/pricing.ts` (`quoteOrder`) is the single pricing engine; it reads BOM recipes/items, materials, techniques and the active `pricingRules` row and returns a `PricingSnapshot`. Per F6 it **throws domain errors** when a product has no recipe, a kilo-material lacks `metersPerKilo`, or no rule is active (`KNOWN-ISSUES.md:138`, `docs/F6-CONTEXTO-Y-PLAN.md:197`). Callers must `try/catch` (`actions/orders.ts:155-165, 260-269`).
- **Order state machine** — `orderStatus` enum (12 states, `schema.ts:18-31`) with a payment gate `bloqueado_pago` recalculated in `src/lib/payments.ts:79-96` (`recalculateBlockStatus`). Frozen statuses (`en_produccion..entregado/cancelado`) are never touched by the gate.
- **Clients/leads boundary** — `organizations` + `contacts`; `createPublicOrder` **auto-upserts** org by exact name and contact by email/phone (`actions/public-orders.ts:105-135`), which is the existing de-facto CRM behavior an AI sales agent would build on.
- **Attachments boundary** — `src/lib/storage.ts` defines `StorageAdapter` with a working `localStorageAdapter` (writes `public/uploads/`) and an **unimplemented `s3StorageAdapter`** that throws (`:116-123`); selection via `STORAGE_PROVIDER` env (`:125-126`). `uploadSessions` provides short-lived secret-backed pre-order uploads (`src/lib/public-upload-sessions.ts`).
- **Config boundary** — `settings` key/value (workshop name/CBU/contact) read in `admin/configuracion/page.tsx:18-28`; the "Notificaciones" card is an explicit **placeholder** (`:48-53`) that names WhatsApp Business as future work.

---

## 7. API / server-action conventions + Zod

**Mutating API routes** follow a consistent shape: `requireUser()` → `req.json().catch(() => null)` → `schema.safeParse` → `NextResponse.json({error, issues}, {status})`, then a single Drizzle write. Canonical examples: `api/organizations/route.ts:7-24`, `api/materials/[id]/route.ts:8-52`, `api/payments/route.ts:8-34`. Status codes used: 400 (validation), 401 (login), 404 (missing), 422 (domain error, e.g. `PaymentDomainError`), 500.

**Server actions** (`"use server"`) mirror that: `requireUser()` → `safeParse` → return `{ok:false,error,issues}` → `revalidatePath(...)` (and `redirect(...)` in `createOrder`). See `actions/orders.ts:14-41,138-222`.

**Zod lives centrally** in `src/lib/validators.ts` (407 lines): every payload has a schema and many use `.strict()` + `superRefine` (e.g. `createPublicOrderSchema:356-385`, `registerPaymentSchema:297-304`, `recipeItemSchema:150-171`). `api/public/order/[token]/route.ts` is the only unauthenticated route and deliberately returns a **reduced projection** (no costs, no payments, no internal notes).

**Inconsistencies / stale duplicates an agent dev must know:**
- `api/orders/route.ts:7-24` does a manual `!body?.notes` check and inserts directly, bypassing `createOrderSchema` — a legacy duplicate of `actions/orders.ts:createOrder`.
- Some `[id]` routes accept `body.active` outside Zod (`api/materials/[id]/route.ts:50`).

**Transaction model (important):** the default `db` (`src/db/client.ts`) uses the **neon-http** driver which **does not support transactions**; multi-write flows therefore write "sequentially" with explicit `// Neon HTTP: sin tx` comments (e.g. `actions/orders.ts:21,81,169,271`; `actions/attachments.ts:57`). Genuine atomic flows (`createPublicOrder`, `registerPayment`) use a **second driver**: `src/lib/db-transaction.ts` creates a `Pool`-backed `drizzle-orm/neon-serverless` client and exposes `withDbTransaction(cb)`. The established reusable pattern for an external actor is `registerPaymentTx(tx, {..., createdById})` in `src/lib/payments.ts:157-196`.

---

## 8. Background / job constraints

**There is no background infrastructure of any kind:** no cron, no queue (no `bullmq`/`inngest`/`qstash`), no worker process, no `instrumentation.ts`, no `middleware.ts`, no edge/serverless config beyond Next defaults (`next.config.ts`). `render.yaml` declares a single web service.

Consequences:
- **Telegram inbound must be webhook-based** (a Next route handler), not long-polling, if it is to share this deployment. A long-polling bot would require a separate always-on process (Render web service `starter`, `render.yaml:5`), which the current repo does not provision.
- Deferred work (reminders, follow-ups, "presupuesto enviado" notices) has **no scheduler**; the only "cleanup" job is invoked opportunistically at wizard step 4 via `cleanupExpiredPublicUploads()` (`actions/public-orders.ts:18`, `lib/public-upload-sessions.ts:53-81`), not by a timer.
- The login rate limiter (§4) shows the codebase's only "state across requests" pattern is a **process-local Map** — which does not generalize to a multi-instance agent.

---

## 9. Environment handling

Environment usage is minimal and read ad-hoc (no zod env schema, no central config module):
| Var | Where | Required? |
|---|---|---|
| `DATABASE_URL` | `src/db/client.ts:5-13`, `src/lib/db-transaction.ts:7-11` | Yes (throws) |
| `SESSION_SECRET` | `src/lib/auth.ts:26` | Yes in prod, **has insecure fallback** |
| `STORAGE_PROVIDER` | `src/lib/storage.ts:126`, `admin/configuracion/page.tsx:28` | Optional (`s3` else local) |
| `ADMIN_PASSWORD` | `src/db/seed.ts:29` | Seed only |
| `NODE_ENV` | `client.ts:7`, `auth.ts:46` | Framework |

`.env` is gitignored; `.env.example` documents only `DATABASE_URL` + `SESSION_SECRET`. **No third-party API keys or secret store exist.** Adding Telegram/LLM credentials means: new keys in `.env` + `.env.example`, new Render env vars (`render.yaml:9-17` currently lists only NODE_VERSION/DATABASE_URL/SESSION_SECRET/NODE_ENV), and ideally a validated env module (none exists today).

---

## 10. Test / build state

- **No test runner and no tests** — `package.json:5-16` has no `test` script; no vitest/jest/playwright config; the only `*.test.ts` files on disk are inside `.opencode/node_modules/zod`, not project code.
- **`npm run lint` is broken at toolchain level (KI-13)** — `next lint` is interactive/deprecated and the flat-config path is incompatible with the installed ESLint 9 (`KNOWN-ISSUES.md:297-307`). Documented gate: **`npm run typecheck` + `npm run build`**.
- **Not executed in this worktree**: `node_modules/` is **absent**, so `tsc`/`next` are unavailable. I did not run `npm install` (dependency-state rule). Build/typecheck status is therefore taken from the documented state, not re-verified here. The most recent commits (`675e6e1`, `be22601`, `0d36a5d`) are UI-only; `KNOWN-ISSUES.md` reports 9/13 issues resolved, with KI-07 (fonts) and KI-13 (lint) open.
- **Security headers/CSP are present** — `next.config.ts:3-22` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP. Note `connect-src 'self'` (`:10`): a browser-side agent UI cannot call an external LLM endpoint directly (server-side calls are unaffected). `img-src` allows `https://*.googleusercontent.com`.

---

## 11. Security requirements & current posture

| Requirement | Current state | Gap for agents |
|---|---|---|
| Authn | scrypt + DB session + HMAC cookie ✅ | — |
| Session secret integrity | **Insecure dev fallback** (`auth.ts:26`) ❌ | Fail-fast env validation needed |
| Authz / RBAC | Declared, **unused** (`auth.ts:82`, 0 callers) ❌ | Hard blocker |
| CSRF | Cookie `sameSite=lax` + Next action origin checks | No explicit CSRF token on `fetch`-based routes |
| Rate limiting | Login only, **in-memory** (`login/route.ts:7`) ⚠️ | Durable limiter for agent endpoints |
| Audit trail | Only `paymentEvents` + `productionEvents` ⚠️ | No actor attribution for agent writes |
| Input validation | Zod on most inputs; a few exceptions ⚠️ | Apply uniformly before exposing tool endpoints |
| Secret storage | None ❌ | New secret manager/keys needed |
| Idempotency | None ❌ | Webhook retries would duplicate writes |
| PII | `contacts` (email/phone), attachments (ID docs) | Ensure agent does not leak across tenants (single-tenant today) |

`PENDIENTES.md:19` confirms the product is **single-tenant** (ADR-08) and that an audit log of sensitive mutations is deferred.

---

## 12. Integration seams (concrete)

### 12.1 Telegram internal agent
| Need | Existing seam | Verdict |
|---|---|---|
| Inbound transport | New `src/app/api/telegram/webhook/route.ts` following the route convention (§7) | **Build** |
| Identity/authorization | Extend `users` with a service role/token, or add a token table; enforce via the currently-unused `requireRole` / new capability checks | **Blocked** (no RBAC, no service actor) |
| Reuse order operations | `actions/orders.ts` (`createOrder`, `confirmQuote`, `reQuoteOrder`), `actions/payments.ts` | **Needs refactor** — actions call `requireUser()`→`cookies()` and are unusable without a browser session; extract services like the existing `registerPaymentTx` |
| Read models | Dashboard counts in `(admin)/layout.tsx:13-21`; lists under `admin/pedidos` | Reuse queries |
| Outbound notifications | Placeholder only (`admin/configuracion/page.tsx:48-53`); no sender, no settings key | **Build** |
| Settings/flags | `settings` JSONB via `updateSetting` (`actions/settings.ts`) | Reuse (validate values) |
| Scheduling | None | **Build or avoid** (webhook-only) |

### 12.2 AI sales agent
| Need | Existing seam | Verdict |
|---|---|---|
| Create order from conversation | `createPublicOrder` + `createPublicOrderSchema` (`actions/public-orders.ts:65-172`, `validators.ts:356-385`) — validated, transactional, server-authoritative | **Best seam**; extract to a service callable with a system actor |
| Instant quoting | `quoteOrder` (`lib/pricing.ts`) | Reuse (wrap `try/catch`) |
| Catalog knowledge | `(public)/catalogo/page.tsx:15-57` query (products + sizes + bundles) | Extract to a read service |
| Lead capture/upsert | `contacts` + `leadStatus`; auto-upsert logic in `createPublicOrder:105-135` | Reuse / extend |
| Conversation history | **No `chat_messages` table** — explicitly planned in `PENDIENTES.md:36` | **Build** + migration |
| Message transport (WhatsApp/Telegram) | None | **Build** + credentials |
| Tracking link for client | `orders.publicToken` + `/seguimiento/[token]` + `api/public/order/[token]` | Reuse |
| LLM credentials / prompt store | None | **Build** |

---

## 13. Blockers & migration risks (precise)

**Blockers**
1. **No effective RBAC** — `requireRole` (`src/lib/auth.ts:82`) has zero callers and there is no middleware; all admin routes/pages gate on `requireUser()` only. An agent account = full admin. *Affected:* `src/lib/auth.ts:76-86`, every `src/app/api/**/route.ts`, every `src/app/(admin)/**/page.tsx`.
2. **No service-actor execution path** — actions and route handlers depend on a request cookie (`requireUser`→`next/headers` `cookies()`), so a bot cannot call them off-request. *Pattern to copy:* `registerPaymentTx(tx, input, createdById)` (`src/lib/payments.ts:157`).
3. **No background/queue scheduler** — Telegram long-polling and deferred notifications have no runtime. *Affected:* deployment topology (`render.yaml`), absence of `middleware.ts`/`instrumentation.ts`.
4. **No idempotency** — Telegram/messaging webhooks retry; nothing dedupes deliveries, and `createPublicOrder`/`createOrderLine` will duplicate orders/items on replay (`actions/public-orders.ts:138-164`, `actions/orders.ts:96-106`).
5. **No conversational persistence or messaging SDK** — `chat_messages` absent (`PENDIENTES.md:36`); no WhatsApp/Telegram/email sender, no LLM client.
6. **Secret/env hardening** — `SESSION_SECRET` dev fallback (`auth.ts:26`) and absence of env validation; no secret store for new agent credentials.

**Migration / engineering risks**
7. **`db:push` in the Render build** (`render.yaml:6`) can silently alter/drop schema; agent tables must ship as idempotent `000N_*.sql` + journal entry and be applied with `db:migrate` (`AGENTS.md` DB rules).
8. **Dual DB drivers** — `db` (neon-http, **no transactions**) vs `withDbTransaction` (`neon-serverless` Pool). Any multi-table agent write must use `withDbTransaction`; the sequential-write pattern in `createOrderLine` (`actions/orders.ts:96-106`) can leave partial state on failure.
9. **Money as numeric strings** — agent code must route through `toCents`/`fromCents` (`lib/payments.ts:16-35`).
10. **`quoteOrder` throws** — all agent callers must handle domain errors (`docs/F6-CONTEXTO-Y-PLAN.md:197`).
11. **In-memory rate limiting** (`api/auth/login/route.ts:7`) is per-instance and non-durable; agent endpoints need a durable limiter (DB/Redis).
12. **Legacy duplicate write routes** — `api/orders/route.ts` bypasses Zod and `createOrder`; consolidating first avoids two divergent order-creation paths for the agent.
13. **No audit log** — agent-initiated mutations can only be attributed via `createdById`-style columns; there is no generic `audit_events` (`PENDIENTES.md:21,41`).
14. **Public token as bearer** — `orders.publicToken` grants order tracking; an agent must not expose tokens out of context.
15. **Build not re-verified here** — `node_modules` absent; treat `typecheck`/`build` as unverified until run in an installed worktree.

---

## 14. Precise affected files / symbols (change map)

**Add (new)**
- `src/app/api/telegram/webhook/route.ts` — inbound webhook (route convention §7).
- `src/lib/agent/` or `src/lib/notifications/` — transport + LLM clients (none exist).
- `src/db/migrations/0010_*.sql` (+ `meta/_journal.json`) — `chat_messages`, agent tokens/scopes, idempotency keys, `audit_events`.
- `src/components/layout/adminNavigation.ts:45-61` — new nav entry for any admin agent console.
- `src/lib/env.ts` — validated env (replacing ad-hoc reads).

**Modify**
- `src/lib/auth.ts` — add service/token auth + wire real role checks; remove insecure `SESSION_SECRET` fallback (`:25-34`).
- `src/app/actions/orders.ts`, `payments.ts`, `attachments.ts`, `public-orders.ts` — extract domain services callable with an explicit actor (mirror `registerPaymentTx`).
- `src/app/api/orders/route.ts:7-24` — remove the unvalidated duplicate or route through the schema/service.
- `src/db/schema.ts` — extend `users`/roles or add agent/token + `chat_messages` tables; keep the `.$type<T>()` + JSON default convention.
- `render.yaml` — replace `db:push` with `db:migrate`; add new env vars.
- `next.config.ts:10` — revisit `connect-src 'self'` only if a browser-side agent UI must reach an external endpoint.

**Reuse unchanged**
- `src/lib/pricing.ts` (`quoteOrder`), `src/lib/payments.ts` (`registerPaymentTx`, cents helpers), `src/lib/db-transaction.ts` (`withDbTransaction`), `src/app/api/public/order/[token]/route.ts`, `src/app/(public)/seguimiento/[token]/page.tsx`.

---

## 15. Open questions (not answered by the code)
1. Which Telegram identity model is intended — per-human staff accounts linked to `users`, or a single shared bot service account with scoped actions?
2. Is the AI sales agent's channel WhatsApp (per `PENDIENTES.md:36-37`) or Telegram, or both? The repo has neither transport.
3. Does the agent need to *initiate* messages (requires a scheduler) or only reply to inbound webhooks (no scheduler needed)?

_End of report._
