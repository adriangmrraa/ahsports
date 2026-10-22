# AGENTS — AH Sports OS

> Reglas + convenciones del proyecto **AH Sports OS**, leídas por cada sesión/agente antes de actuar.

## Ubicación del proyecto y entorno (leer primero)

- **Repo GitHub = esta carpeta**: `estabilizacion/ah sports/App de gestion/`. La carpeta padre `ah sports/` solo contiene material origen (Stitch, documentos) — NO es el repo. Todos los comandos (`npm`, `git`) se ejecutan acá adentro.
- **`.env` vive acá adentro** (`App de gestion/.env`, gitignored, NUNCA commitear). Contiene la `DATABASE_URL` real de Neon + `SESSION_SECRET`. Si falta una variable, pedirla al usuario; NO inventarla ni pushear a prod.
- **Neon ya tiene datos**: base + seed aplicados (admin, Club Renacer, 4 productos, regla pricing). Reglas DB:
  1. Recon de solo-lectura ANTES de cualquier escritura (tablas + counts).
  2. `npm run db:seed` hace `TRUNCATE` destructivo — NUNCA correrlo sin confirmación explícita del usuario.
  3. Migraciones `src/db/migrations/000<N>_*.sql` son idempotentes (`IF NOT EXISTS`) — `npm run db:migrate` es seguro de re-ejecutar.
  4. Scripts temporales de verificación van en `C:\Users\Asus\AppData\Local\Temp\opencode\`, se copian acá solo para ejecutar (resolución de módulos) y se borran después; verificar `git status` limpio.

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

> **Estado real: MVP cerrado — F0..F5 = 108/108, deployado.** El aviso viejo sobre "bugs de F1 que romperán el build" ya no aplica: de los 13 issues de `KNOWN-ISSUES.md`, 9 están resueltos. Quedan abiertos solo KI-07 (fuentes, deuda menor) y **KI-13: `npm run lint` está roto a nivel toolchain** — no lo uses como gate; el gate real es `typecheck` + `build`.

1. **Consultar el grafo antes de leer código** → `graphify god-nodes` + `graphify query` (ver la sección graphify más abajo)
2. `npm install`
3. Verificar `.env` local (tiene `DATABASE_URL` de Neon + `SESSION_SECRET`). Si no existe: `cp .env.example .env` y pedir la URL al usuario.
4. `npm run typecheck`
5. `npm run db:migrate` (idempotente; NO `db:push` en una DB con datos)
6. `npm run db:seed` solo si la DB está vacía y con confirmación explícita — hace TRUNCATE
7. `npm run dev` → http://localhost:3000

Login seed: `admin@ahsports.com` — password la define `ADMIN_PASSWORD` en el seed (NO hay credenciales default, ver F2-20)

## graphify — grafo de conocimiento (LEER ANTES DE EXPLORAR CÓDIGO)

Este repo tiene un grafo de conocimiento: **2835 nodos, 6494 edges, 164 comunidades**, todos los nodos con descripción. Es la **puerta de entrada al código**.

**⚠️ Versión instalada: graphify 0.9.46** (binario `graphify.exe` en `~/.local/bin`, NO el paquete npm `@sentropic/graphify`). Escribe y lee desde **`graphify-out/`** por defecto — todos sus comandos toman `graphify-out/graph.json` como default. `.graphify/graph.json` queda como **espejo commiteado** del mismo grafo (los scripts lo sincronizan). Documentación de comandos completa: `.agents/skills/graphify/SKILL.md` describe el lineage 0.18 — varios comandos documentados ahí NO existen en 0.9.46; la tabla de abajo lista solo los que funcionan.

### Regla dura: grafo primero, código después

1. Para CUALQUIER pregunta sobre código, arquitectura, rutas, modelos de datos, relaciones o impacto de un cambio, **consultá el grafo primero**.
2. Leé archivos crudos (`read` / `grep`) **solo si** el grafo no alcanza: para editar una línea exacta, verificar un detalle de implementación, o cuando `query` / `explain` devuelvan poco contexto.
3. Al afirmar algo sobre el código, citá el `source_location` que devuelve el grafo.
4. Si el grafo no tiene el dato, decilo — no inventes edges ni comportamiento.

### Qué comando usar (v0.9.46)

| Necesidad | Comando |
|---|---|
| Orientación inicial: hubs arquitectónicos | `graphify god-nodes` |
| "¿Cómo funciona X?" — contexto amplio | `graphify query "<pregunta>"` (o `--dfs` para una cadena, `--budget N`) |
| Detalle de un símbolo o archivo | `graphify explain "<nodo>"` |
| Cómo se conectan A y B | `graphify path "<A>" "<B>"` |
| Qué impacta si toco X | `graphify affected "<nodo>"` |
| Árbol visual D3 del grafo | `graphify tree` |
| **Sincronizar el grafo** (el único comando válido) | `node .opencode/skills/graph-first/scripts/graphify-sync.mjs` |

`graphify-out/GRAPH_REPORT.md` es para review de arquitectura amplia. No lo leas entero por defecto.

### Paridad 1:1 con el código (obligatorio)

Los git hooks **no están instalados** en esta máquina — el sync es manual. No corras `graphify hook install` (instalaría hooks que no reaplican descripciones).

> **Nunca corras `graphify update .` a pelo.** Reconstruye `graphify-out/graph.json` **sin descripciones** (defecto verificado: los 2835 nodos quedan en 0 descripciones). El único comando válido es:
>
> ```
> node .opencode/skills/graph-first/scripts/graphify-sync.mjs
> ```
>
> Ese script corre `graphify update .` y **después** `reapply-descriptions.mjs`, que escribe las descripciones del cache versionado (`.opencode/skills/graph-first/description-cache.json`) directo en `graphify-out/graph.json` y espeja `graph.json` + `GRAPH_REPORT.md` + `.graphify_labels.json` + `scope.json` a `.graphify/` — todo en **una sola pasada**.

- **Al terminar cambios de código en una sesión, corré el sync** para dejar el grafo en paridad con el working tree.
- Verificá la paridad: `node -e "const g=require('./.graphify/graph.json');console.log(g.nodes.filter(n=>n.description).length+'/'+g.nodes.length+' descritos')"` — debe dar `2835/2835` (o el total vigente).
- El grafo se construye desde el **working tree**, no desde HEAD — incluye cambios sin commitear. `graphify-out/graph.json` lleva `built_at_commit` con el HEAD analizado.

### Enriquecimiento semántico

Las descripciones de nodos son lo que hace al grafo consultable en lenguaje natural.

- Las descripciones viven en el cache versionado `.opencode/skills/graph-first/description-cache.json` (keyed por node-id v0.9.46, p.ej. `src_lib_whatsapp_sales_agent`). Viaja con el repo.
- El sync reaplica el cache automáticamente. **No re-describas a mano un nodo que ya está en el cache.**
- Cuando aparecen **nodos nuevos**, el reapply reporta `N uncached` y emite prompts en `.graphify/description-instructions/batch-NNN.md`. Corré `describe-new-nodes.mjs` para un baseline mecánico (declaración + docstring del símbolo) o escribí `batch-NNN.json` a mano (una oración **en inglés** por nodo), y re-corré el sync — absorbe las respuestas al cache.
- Los nombres de comunidad viven en `graphify-out/.graphify_labels.json` (espejado a `.graphify/`); sin API keys son file-derived.
- Procedimiento completo: `.opencode/skills/graph-first/SKILL.md`.

### El grafo SÍ se versiona

Se commitean: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/.graphify_labels.json(.sig)`, `graphify-out/.graphify_root`, `graphify-out/graph.html` **y el espejo** `.graphify/graph.json`, `.graphify/GRAPH_REPORT.md`, `.graphify/.graphify_labels.json`, `.graphify/scope.json`.

Lo que **no** se versiona (`.gitignore`) son los artefactos regenerables/atados a esta máquina:
- `graphify-out/cache/` (AST + stat-index), `graphify-out/manifest.json`, snapshots datados `graphify-out/20XX-*/`, `needs_update`, `memory/`, `reflections/`
- `.graphify/description-instructions/` (prompts/answers del asistente), `.graphify/cache/`, `.graphify/description-cache.json` (fallback viejo)

### Invocación por agente

- **opencode**: plugin `.opencode/plugins/graphify.js` + skill `.opencode/skills/graphify/SKILL.md`
- **Codex**: skill `.agents/skills/graphify/SKILL.md`. El trigger es `$graphify`, **no** `/graphify`
- **Claude Code**: skill global `~/.claude/skills/graphify/SKILL.md`
- **Cualquier otro agente**: usá el CLI `graphify` directamente
