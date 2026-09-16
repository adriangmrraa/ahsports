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

1. **Consultar el grafo antes de leer código** → `graphify summary` (ver la sección graphify más abajo)
2. `npm install`
3. Verificar `.env` local (tiene `DATABASE_URL` de Neon + `SESSION_SECRET`). Si no existe: `cp .env.example .env` y pedir la URL al usuario.
4. `npm run typecheck`
5. `npm run db:migrate` (idempotente; NO `db:push` en una DB con datos)
6. `npm run db:seed` solo si la DB está vacía y con confirmación explícita — hace TRUNCATE
7. `npm run dev` → http://localhost:3000

Login seed: `admin@ahsports.com` — password la define `ADMIN_PASSWORD` en el seed (NO hay credenciales default, ver F2-20)

## graphify — grafo de conocimiento (LEER ANTES DE EXPLORAR CÓDIGO)

Este repo tiene un grafo de conocimiento en `.graphify/graph.json`: **528 nodos, 1658 edges, 27 comunidades**, todos con descripción. Es la **puerta de entrada al código**.

### Regla dura: grafo primero, código después

1. Para CUALQUIER pregunta sobre código, arquitectura, rutas, modelos de datos, relaciones o impacto de un cambio, **consultá el grafo primero**.
2. Leé archivos crudos (`read` / `grep`) **solo si** el grafo no alcanza: para editar una línea exacta, verificar un detalle de implementación, o cuando `query` / `explain` devuelvan poco contexto.
3. Al afirmar algo sobre el código, citá el `source_location` que devuelve el grafo.
4. Si el grafo no tiene el dato, decilo — no inventes edges ni comportamiento.

### Qué comando usar

| Necesidad | Comando |
|---|---|
| Orientación inicial: hubs y comunidades | `graphify summary` |
| "¿Cómo funciona X?" — contexto amplio | `graphify query "<pregunta>"` |
| Detalle de un símbolo o archivo | `graphify explain <nodo>` |
| Cómo se conectan A y B | `graphify path "<A>" "<B>"` |
| Dependencias desde un nodo | `graphify tree <nodo>` |
| Blast radius de un cambio | `graphify review-analysis --files <archivos>` |
| Contexto acotado para review | `graphify review-delta --files <archivos>` |
| Respuesta GraphRAG (el asistente la sintetiza) | `graphify answer "<pregunta>"` |
| ¿El grafo quedó viejo? | `graphify check-update` |
| **Sincronizar el grafo** (el único comando válido) | `node .opencode/skills/graph-first/scripts/graphify-sync.mjs` |

`GRAPH_REPORT.md` es para review de arquitectura amplia. No lo leas entero por defecto.

### Paridad 1:1 con el código (obligatorio)

Los git hooks (`post-commit`, `post-checkout`, `post-merge`, `post-rewrite`) están instalados y **parcheados**: sincronizan el grafo **en background** después de cada commit, sin bloquear git. No los desinstales.

> **Nunca corras `graphify update .` ni `graphify hook-rebuild` a mano.** Los dos **borran las 528 descripciones de nodos** (defecto verificado de graphify 0.18.0: reconstruye `graph.json` sin descripciones y borra los archivos de respuesta al ingerirlos). El único comando válido es:
>
> ```
> node .opencode/skills/graph-first/scripts/graphify-sync.mjs
> ```
>
> Ese script reaplica las descripciones desde el cache versionado (`.opencode/skills/graph-first/description-cache.json`) y después reconstruye + ingiere en **una sola pasada**.

- Si existe `.graphify/needs_update`, el grafo está desactualizado: corré el sync antes de confiar en él y avisá que estaba viejo.
- Si `graphify check-update` reporta cambios pendientes, sincronizá antes de responder.
- **Al terminar cambios de código en una sesión, corré el sync** para dejar el grafo en paridad con el working tree.
- Verificá la paridad: `node -e "const g=require('./.graphify/graph.json');console.log(g.nodes.filter(n=>n.description).length+'/'+g.nodes.length+' descritos')"` — debe dar `528/528` (o el total vigente).
- El grafo se construye desde el **working tree**, no desde HEAD — incluye cambios sin commitear. `graphify state status` muestra el HEAD analizado.

### Enriquecimiento semántico

Las descripciones de nodos y los nombres de comunidades son lo que hace al grafo consultable en lenguaje natural. Sin ellos las comunidades se llaman `Community N`.

- Las **528 descripciones** viven en el cache versionado `.opencode/skills/graph-first/description-cache.json`. Viaja con el repo: un clon nuevo no necesita re-describir nada.
- El sync reaplica el cache automáticamente. **No re-describas a mano un nodo que ya está en el cache.**
- Solo cuando aparecen **nodos nuevos**, el sync reporta `N uncached`. Recién ahí un asistente escribe las oraciones faltantes (una por nodo, **en inglés**) y vuelve a correr el sync, que las absorbe al cache.
- Los nombres de comunidad persisten aparte en `.graphify/.graphify_labels.json` y **sobreviven a los rebuilds**.
- Procedimiento completo, incluyendo el defecto de detección de idioma (`[lang=pt]` en contenido español): `.opencode/skills/graph-first/SKILL.md`.

### NO commitear el grafo

`.graphify/` está en `.gitignore` a propósito. `graphify portable-check` falla con **237 issues** porque `manifest.json` guarda paths absolutos de esta máquina. El grafo es un artefacto **local y derivado**: se reconstruye solo con los hooks.

### Invocación por agente

- **opencode**: plugin `.opencode/plugins/graphify.js` (recuerda el grafo antes del primer `bash`) + skill `.opencode/skills/graphify/SKILL.md`
- **Codex**: hook `.codex/hooks.json` + skill `.agents/skills/graphify/SKILL.md`. El trigger es `$graphify`, **no** `/graphify`
- **Claude Code**: skill global `~/.claude/skills/graphify/SKILL.md`
- **Cualquier otro agente**: usá el CLI `graphify` directamente
