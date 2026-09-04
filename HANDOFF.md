# HANDOFF — Para el próximo agente de código

> Si estás leyendo esto es porque el agente anterior dejó la documentación y el scaffold base. **No estás continuando a ciegas: tenés docs detalladas y bugs conocidos mapeados.**

## TL;DR

- **22/108 tareas completas** (F0+F1). F2-F5 pendientes con código NO escrito.
- El **scaffold funciona** (Next.js 15 + Drizzle + Neon + auth propia). Tiene **bugs reales** que romperán el build: leer `KNOWN-ISSUES.md` PRIMERO.
- Las **docs están al nivel de detalle de Fusa Labs / Dentalogic**: arquitectura, schema, API routes, business rules, gap analysis, deployment, roadmap.
- El **siguiente paso natural es F2** (núcleo técnico-económico: productos, insumos, técnicas, recetas, talles, pricing rules + seed).

## Orden de lectura obligatorio (15 min)

1. **`BUILD_PROGRESS.md`** (índice maestro) — entender macro
2. **`KNOWN-ISSUES.md`** (12 issues con ubicación exacta) — bugs a arreglar
3. **`docs/02-ARCHITECTURE.md`** §4 (decisiones D1..D7) — no cambiar stack
4. **`docs/06-STANDARDS-BUILDING.md`** — convenciones
5. **`docs/04-BUSINESS-RULES.md`** — fórmulas del dominio
6. **`BUILD_PROGRESS-F2.md`** — la fase a ejecutar
7. **`src/db/schema.ts`** — el modelo (referencia constante)

## Pasos concretos

```bash
cd "C:\Users\Asus\Documents\estabilizacion\ah sports\App de gestion"
npm install                                  # 1-2 min
cp .env.example .env                         # setear DATABASE_URL de Neon
npm run typecheck                            # FALLA con KI-01, KI-05, KI-06
```

### Fix KI-01 (rompe build)
Archivo: `src/app/(admin)/layout.tsx` líneas 11-18. Eliminar la query rota (no se usa). Detalle en `KNOWN-ISSUES.md`.

### Fix KI-09 (F2-20) — bloqueante
Crear `src/db/seed.ts` con admin + org demo + 5 materiales + 3 técnicas + 4 productos con talles y recetas. Tarea F2-20.

### Fix KI-05, KI-06, KI-12 — antes de F3
Detalle en `KNOWN-ISSUES.md`.

## Estructura mental del proyecto

```
App de gestion/
├── src/
│   ├── app/
│   │   ├── (admin)/admin/...        # panel con sidebar (12 rutas planificadas, ~5 escritas)
│   │   ├── (public)/presupuesto/    # 5 pasos wizard público (NO EXISTE AÚN)
│   │   ├── seguimiento/[token]/     # tracking público (NO EXISTE AÚN)
│   │   ├── login/                   # ✅ existe
│   │   ├── api/                     # 6 endpoints escritos (auth, materials, products, orders, stage)
│   │   ├── layout.tsx               # root
│   │   ├── page.tsx                 # landing ✅
│   │   └── globals.css              # design system ✅
│   ├── components/ui/               # 4 primitives: Button, Card, Input, Table ✅
│   ├── db/
│   │   ├── schema.ts                # 19 tablas + 11 enums ✅
│   │   ├── client.ts                # neon HTTP driver ✅
│   │   ├── seed.ts                  # ❌ NO EXISTE (F2-20)
│   │   └── migrations/              # ❌ VACÍO (usar db:push)
│   └── lib/
│       ├── auth.ts                  # scrypt + cookie ✅
│       ├── pricing.ts               # motor cotización ✅ (con bugs KI-05, KI-06)
│       └── utils.ts                 # formatCurrency, etc ✅
├── docs/                            # 8 archivos ✅
├── BUILD_PROGRESS*.md               # 6 archivos ✅
├── KNOWN-ISSUES.md                  # 12 issues ✅
├── HANDOFF.md                       # este archivo
├── PENDIENTES.md                    # lo que queda post-MVP
├── AGENTS.md                        # reglas del proyecto
└── package.json                     # scripts: dev/build/start/lint/typecheck/db:*
```

## Convenciones clave

- **NO usar** Supabase, NextAuth, Material Symbols, hex inline.
- **SÍ usar** Drizzle directo, scrypt, CSS vars semánticas (`bg-surface`, `text-primary`), Lucide.
- **Antes de marcar tareas `[x]`**: `tsc --noEmit` + `npm run lint` + `npm run build` EXIT 0.
- **Commits**: conventional, sin atribución IA.
- **Naming**: kebab-case carpetas, PascalCase componentes, camelCase funciones.

## Cuando termines una fase

1. Actualizar el archivo `BUILD_PROGRESS-F<N>.md` marcando tareas con `- [x]` + VERIFICADO + `@fecha-YYYY-MM-DD`.
2. Actualizar la tabla de progreso en `BUILD_PROGRESS.md`.
3. Si encontrás nuevos bugs: agregarlos a `KNOWN-ISSUES.md`.
4. Si tomás decisiones arquitectónicas nuevas: agregar ADR a `docs/02-ARCHITECTURE.md`.

## Contacto con el usuario

El usuario (Adrian) habla español Rioplatense (voseo). Warm pero directo. Si tenés dudas de scope, **preguntá antes de inventar** (regla "1 pregunta a la vez" del AGENTS.md global).

## Lo que el usuario ya validó explícitamente

- Stack: Neon + Drizzle (no Supabase)
- Design system: Kinetic Industrial (del Stitch)
- Deploy: Render
- Estructura documental: estilo Fusa Labs / Dentalogic (este patrón es **estándar de su casa**)
- NUNCA atribución IA en commits

## Lo que el usuario NO validó explícitamente (preguntar si es bloqueante)

- Si el `auth.ts` actual con scrypt está bien o prefiere Lucia/Auth.js
- Si el precio base del producto debe estar en `products.basePrice` o solo en recetas
- Si `materials.unitPrice` debe soportar histórico (versiones con vigencia) o un solo valor vigente

## Si te trabás

Probablemente sea uno de los KI-* bugs. Releer `KNOWN-ISSUES.md`. Si el problema no está ahí, agregar a ese archivo con `@fecha` y descripción clara.