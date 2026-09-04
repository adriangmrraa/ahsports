# ✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system)

> **Propósito**: dejar el proyecto arrancando, conectado a Neon, con auth funcional, design system "Kinetic Industrial" aplicado, y primitivos UI reutilizables.
>
> Regla: nada de features de negocio acá. Solo cimientos.

---

## A. Configuración base

- [x] **F1-01** `package.json` con dependencias unificadas (Next 15 + TS strict + Tailwind v4 + Drizzle 0.45 + @neondatabase/serverless + Lucide React + Zod + drizzle-kit + tsx). **VERIFICADO 2026-09-02**: `package.json` reescrito con `dependencies` (next, react, react-dom, drizzle-orm, @neondatabase/serverless, lucide-react, clsx, tailwind-merge, zod) y `devDependencies` (typescript, @types/*, drizzle-kit, tsx, tailwindcss v4, @tailwindcss/postcss, eslint). Scripts: `dev/build/start/lint/typecheck/db:generate/db:push/db:seed`. @fecha-2026-09-02
- [x] **F1-02** `tsconfig.json` con paths `@/*` → `./src/*`, strict mode, jsx preserve, incremental. **VERIFICADO 2026-09-02**: `tsconfig.json` con `strict:true`, `noEmit:true`, `target:"ES2022"`, `paths:{"@/*":["./src/*"]}`, plugin Next. Compatible con Next 15 + React 19. @fecha-2026-09-02
- [x] **F1-03** `drizzle.config.ts` apuntando a `src/db/schema.ts` + `src/db/migrations`, dialect postgresql, env DATABASE_URL. **VERIFICADO 2026-09-02**: `drizzle.config.ts` creado con `schema`, `out`, `dialect:"postgresql"`, `dbCredentials.url = process.env.DATABASE_URL`. @fecha-2026-09-02
- [x] **F1-04** `next.config.ts` + `postcss.config.mjs` + `.env.example` + `.gitignore`. **VERIFICADO 2026-09-02**: `next.config.ts` con `serverActions.bodySizeLimit:"5mb"`. `postcss.config.mjs` con `@tailwindcss/postcss`. `.env.example` con `DATABASE_URL` y `SESSION_SECRET`. `.gitignore` cubre node_modules, .next, .env*.local, logs. @fecha-2026-09-02
- [x] **F1-05** `src/db/client.ts`: neon HTTP driver + drizzle wrapper. **VERIFICADO 2026-09-02**: `client.ts` con `neon(databaseUrl)`, `drizzle(sql, { schema })`, fallback placeholder para dev sin DB. Exporta `db` y `schema`. @fecha-2026-09-02

## B. Schema Drizzle completo

- [x] **F1-06** `src/db/schema.ts` con 19 tablas y 11 enums. **VERIFICADO 2026-09-02**: tablas: `users, sessions, organizations, contacts, materials, techniques, products, sizes, bomRecipes, bomItems, pricingRules, orders, orderLines, orderItems, attachments, applications, payments, productionEvents, settings`. Enums: `userRole, orderStatus, productionStage, paymentMethod, paymentKind, attachmentKind, attachmentStatus, applicationView, organizationKind, leadStatus, materialUnit`. Relations definidas. Tipo `PricingSnapshot` exportado para `orders.snapshot jsonb`. @fecha-2026-09-02

## C. Auth + utils + pricing engine

- [x] **F1-07** `src/lib/auth.ts`: scrypt password hash + cookie firmada con HMAC-SHA256 + helpers `requireUser/requireRole`. **VERIFICADO 2026-09-02**: `auth.ts` con `hashPassword` (scrypt salt+hash), `verifyPassword` (timingSafeEqual), `createSession`/`destroySession`, `getCurrentUser`, `requireUser`, `requireRole`. Cookie `ah_session` con id+signature firmada con `SESSION_SECRET`. Sessions en DB con TTL 7 días. @fecha-2026-09-02
- [x] **F1-08** `src/lib/utils.ts`: `cn`, `formatCurrency` (ARS es-AR), `formatPercent`, `formatDate/DateTime`, `generatePublicToken` (16 chars). **VERIFICADO 2026-09-02**: utils completas con `Intl.NumberFormat("es-AR")` y `Intl.DateTimeFormat("es-AR")`. @fecha-2026-09-02
- [x] **F1-09** `src/lib/pricing.ts`: motor de cotización `quoteOrder()` con cálculo de costo unitario desde BOM + técnica + recargos urgentes + márgenes. Retorna `QuoteResult` con totales y `snapshot` para persistir. **VERIFICADO 2026-09-02**: `pricing.ts` con `quoteOrder({lines, urgent, pricingRuleId})`. Algoritmo: para cada línea, busca receta más específica (talle+técnica → talle → técnica → general), suma `material.unitPrice * (qty * (1 + waste))`, suma `technique.costPerUnit + technique.setupCost`, aplica margen de `pricingRules.marginPercent` + recargo urgente si `urgent:true`. Retorna `{lines, totals, rule, snapshot}`. @fecha-2026-09-02

## D. Design system + UI primitives

- [x] **F1-10** `src/app/globals.css` con Tailwind v4 `@theme` y design tokens Kinetic Industrial + utilidades (`glass-panel`, `gradient-text`, `label-caps`, `data-mono`, `tech-grid-bg`). **VERIFICADO 2026-09-02**: globals.css con todas las CSS vars del DESIGN.md (surface*, on-surface, primary cyan #4cd7f6, secondary amber #ffb95f, tertiary violet #d0bcff, error, outline-variant) más tipografía Space Grotesk + Inter. Body con `tech-grid-bg` (linear-gradients 40×40px sobre midnight). @fecha-2026-09-02
- [x] **F1-11** `src/components/ui/Button.tsx`: `Button` (button) + `LinkButton` (link) con variantes `primary/secondary/ghost/danger/tertiary` y sizes `sm/md/lg`. **VERIFICADO 2026-09-02**: Button + LinkButton con className `cn()`. Variant primary usa gradient cyan→cyan-700 (como Stitch). @fecha-2026-09-02
- [x] **F1-12** `src/components/ui/Input.tsx`: `Input`, `Textarea`, `Select`, `Label`, `Field` (wrapper con label+hint+error). **VERIFICADO 2026-09-02**: Inputs con focus ring primary, fondo `surface-container-low`, border `outline-variant`. Field incluye `Label`, `children`, `hint`, `error`. @fecha-2026-09-02
- [x] **F1-13** `src/components/ui/Card.tsx`: `Card` (con title/action), `StatCard`, `Badge`, `PageHeader`, `EmptyState`. **VERIFICADO 2026-09-02**: Card con header opcional y separador. StatCard con label/value/delta/icon. Badge con tonos `primary/secondary/tertiary/error/success/warning/muted`. @fecha-2026-09-02
- [x] **F1-14** `src/components/ui/Table.tsx`: `Table` + `THead` + `TH` + `TR` + `TD` (con align left/right/center y opcional href). **VERIFICADO 2026-09-02**: Table dentro de glass-panel con scroll horizontal, TH con label-caps. @fecha-2026-09-02

## E. Smoke tests

- (cubierto por F2-F5 — F1 es solo fundación, no se valida con `npm run dev` hasta tener al menos una ruta real; se valida con `tsc --noEmit`)

---

## Resumen F1

- Tareas: 14 · Completadas: 14 · Pendientes: 0 — F1 finalizada.
- Scaffold completo: Next.js 15 + Drizzle + Neon + Tailwind v4 + design system aplicado + UI primitives reutilizables.
- Schema con 19 tablas y motor de cotización funcional (aún sin datos seed).
- Auth con scrypt + cookie firmada + roles.
- Siguiente fase: **F2 — Núcleo operativo** (Productos, Insumos, Técnicas, Recetas, Talles, Pricing rules).