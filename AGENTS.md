# AGENTS — AH Sports OS

> Reglas + convenciones del proyecto **AH Sports OS**, leídas por cada sesión/agente antes de actuar.

## Documentación

| Archivo | Para qué |
|---------|----------|
| `README.md` | Quick start + stack + estructura |
| `BUILD_PROGRESS.md` | Índice maestro de fases |
| `BUILD_PROGRESS-F<N>.md` | Checkpoints por fase (1 archivo por fase) |
| `docs/00-README.md` | Índice de docs |
| `docs/01-PARITY-INVENTORY.md` | Mapeo 37 pantallas Stitch → rutas reales |
| `docs/02-ARCHITECTURE.md` | Stack, capas, decisiones arquitectónicas (D1..D7) |
| `docs/03-API-ROUTES.md` | Catálogo de endpoints y server actions |
| `docs/04-BUSINESS-RULES.md` | Lenguaje del dominio + fórmulas + máquina de estados |
| `docs/05-GAP-ANALYSIS.md` | Lo que falta vs relevamiento + roadmap |
| `docs/06-STANDARDS-BUILDING.md` | Reglas de código (naming, imports, estilos) |
| `docs/07-DEPLOYMENT.md` | Deploy Render + Neon paso a paso |
| `docs/08-ROADMAP.md` | Mejoras post-MVP |
| `PENDIENTES.md` | Lista viva de lo pendiente al cierre |

## Stack unificado (NO cambiar sin ADR)

- Next.js 15 + React 19 + TypeScript strict
- Drizzle ORM 0.45 sobre `@neondatabase/serverless` (HTTP driver)
- Tailwind CSS v4 con `@theme` block
- Lucide React para iconos
- Zod para validación
- Auth propia: scrypt + cookie firmada con HMAC-SHA256 (NO NextAuth, NO Clerk)
- Cero Supabase, cero Material Symbols, cero hex inline

## Reglas de oro

1. **DB es la única fuente de verdad.** Cero precios críticos hardcoded.
2. **Snapshot en `orders.snapshot jsonb`** para trazabilidad de cotizaciones.
3. **Server components por defecto.** `'use client'` solo si hay state real.
4. **CSS vars semánticas** (`bg-surface`, `text-primary`). NUNCA hex inline.
5. **Named exports** en componentes, **default export** en pages.
6. **Zod en TODA entrada.** Server actions validan con `safeParse`.
7. **Sin `Math.random()` para datos críticos.**

## Convenciones operativas

- Antes de marcar tareas `[x]` en BUILD_PROGRESS: `tsc --noEmit` + `npm run lint` + `npm run build` EXIT 0
- Commits: Conventional, sin atribución IA
- Si una decisión cambia el stack o el schema: agregar ADR en `docs/02-ARCHITECTURE.md`
- Si una tarea no se puede completar: dejar `[ ]` con nota entre paréntesis, no saltar

## Estructura

```
src/
  app/
    (admin)/admin/...    # Panel interno con sidebar
    (public)/presupuesto/[step]/  # Wizard público 5 pasos
    seguimiento/[token]/           # Tracking público
    login/, api/                  # Login + endpoints
  components/ui/        # Button, Card, Input, Table, Badge
  db/                   # schema.ts + client.ts + seed.ts
  lib/                  # auth.ts + pricing.ts + utils.ts
docs/                   # Documentación (00..08)
BUILD_PROGRESS*.md      # Checkpoints (índice + F<N>)
PENDIENTES.md           # Lo pendiente
```

## Para retomar

> **⚠️ El siguiente agente DEBE empezar leyendo `KNOWN-ISSUES.md`** — hay bugs reales en el código de F1 que romperán el build. No asumir que `npm run build` o `npm run dev` funcionan sin antes arreglar esos issues.

1. Leer `KNOWN-ISSUES.md` (lista de bugs concretos con ubicación)
2. `npm install`
3. `cp .env.example .env` → setear `DATABASE_URL` de Neon
4. `npm run typecheck` (esperar que pase después de los fixes)
5. `npm run db:push`
6. `npm run db:seed` (F2-20 — no existe aún, hay que crearlo)
7. `npm run dev` → http://localhost:3000

Login seed: `admin@ahsports.com` / `admin1234` (F2-20)