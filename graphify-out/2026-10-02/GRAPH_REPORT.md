# Graph Report - zander  (2026-10-02)

## Corpus Check
- 206 files · ~116,546 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1273 nodes · 2850 edges · 101 communities (89 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b0846c76`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orders
- Button.tsx
- formatCurrency
- validators.ts
- attachments.ts
- schema.ts
- /graphify
- requireUser
- Card.tsx
- $graphify
- compilerOptions
- productos/[id]/page.tsx
- orders.ts
- auth.ts
- adjuntos/page.tsx
- public-orders.ts
- pricing.ts
- dependencies
- devDependencies
- client.ts
- 5/page.tsx
- 2. Todo lo que el usuario pidió en este chat (cronológico)
- Graph First — consult, maintain, and rebuild the knowledge graph
- RecetasEditor.tsx
- 03 · API ROUTES — Inventario
- KNOWN ISSUES — Bugs en el código de F1 (BUILD BREAKERS)
- AGENTS — AH Sports OS
- 04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas
- 08 · ROADMAP — Post-MVP
- HANDOFF — Para el próximo agente de código
- organizations
- 06 · STANDARDS BUILDING — Reglas de código
- 07 · DEPLOYMENT — Render + Neon
- product-taxonomy.ts
- product-domain.ts
- [itemId]/route.ts
- [itemId]/page.tsx
- planilla/page.tsx
- sizes
- (admin)/layout.tsx
- build_master_guide.py
- ⏳ F2 — Núcleo operativo (Productos + Insumos + Técnicas + Recetas + Talles + Pricing rules)
- ⏳ F3 — Clientes + Pedidos + Planilla + Kanban producción + Motor cotización
- scripts
- ApplicationsManager.tsx
- ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento
- graphify-sync.mjs
- settings.ts
- insumos/[id]/page.tsx
- login/page.tsx
- ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)
- ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre
- 00-README.md
- 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento
- reapply-descriptions.mjs
- RecetasEditor
- ✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system)
- KanbanBoard.tsx
- ✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS)
- 02 · ARCHITECTURE — AH Sports OS
- SDD — F4-01: Storage adapter (src/lib/storage.ts)
- SDD — F4-07..13: Presupuesto público (wizard 5 pasos)
- PENDIENTES — AH Sports OS
- AH Sports OS
- configuracion/catalogo/page.tsx
- materials
- 3/page.tsx
- seed.ts
- F6 — Proveedores, BOM por talle y costos trazables
- 01 · PARITY INVENTORY — Stitch → AH Sports OS
- RELEASE NOTES — AH Sports OS (MVP v1.0)
- products
- PricingRulesManager
- cotizar/page.tsx
- proveedores/[id]/page.tsx
- TecnicasManager
- (public)/page.tsx
- [token]/page.tsx
- eslint.config.mjs
- opencode.json
- package.json
- ficha-tecnica/page.tsx
- next.config.ts
- app/layout.tsx
- NEON-MIGRATION-BASELINE.md
- next
- next-env.d.ts
- tailwindcss
- postcss.config.mjs
- 0001_public_upload_sessions.sql
- 0003_suppliers.sql
- "product_taxonomy_nodes"
- "bom_items"

## God Nodes (most connected - your core abstractions)
1. `requireUser()` - 117 edges
2. `db` - 89 edges
3. `Card()` - 42 edges
4. `PageHeader()` - 39 edges
5. `formatCurrency()` - 37 edges
6. `Button()` - 34 edges
7. `products` - 34 edges
8. `orders` - 32 edges
9. `Input()` - 28 edges
10. `LinkButton()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `DashboardPage()` --calls--> `formatCurrency()`  [EXTRACTED]
  src/app/(admin)/admin/page.tsx → src/lib/utils.ts
- `onFile()` --calls--> `uploadAttachmentFromPublic()`  [EXTRACTED]
  src/app/(public)/presupuesto/4/Step4Form.tsx → src/app/actions/public-orders.ts
- `listOrgLibrary()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/actions/attachments.ts → src/lib/auth.ts
- `GET()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/attachments/route.ts → src/lib/auth.ts
- `PATCH()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/contacts/[id]/route.ts → src/lib/auth.ts

## Import Cycles
- None detected.

## Communities (101 total, 12 thin omitted)

### Community 0 - "orders"
Cohesion: 0.06
Nodes (56): cancelPayment(), registerPayment(), createPublicOrder(), CajaDetallePage(), KIND_LABEL, metadata, CajaPage(), metadata (+48 more)

### Community 1 - "Button.tsx"
Cohesion: 0.09
Nodes (33): labels, Node, EMPTY, Row, MATERIAL_CATEGORIES, MaterialInitial, UNITS, Mold (+25 more)

### Community 2 - "formatCurrency"
Cohesion: 0.14
Nodes (27): InsumosTable(), Row, kindLabel, OrganizacionPerfilPage(), statusLabel, kindLabel, OrganizacionesPage(), PedidosBloqueadosPage() (+19 more)

### Community 3 - "validators.ts"
Cohesion: 0.07
Nodes (32): PATCH(), POST(), PATCH(), GET(), POST(), emptyMeasurementSchema, POST(), GarmentMeasurementSchema (+24 more)

### Community 4 - "attachments.ts"
Cohesion: 0.07
Nodes (30): addApplication(), Fail, formStr(), listOrgLibrary(), uploadAttachment(), uploadAttachmentFromPublic(), submitUpload(), submit() (+22 more)

### Community 5 - "schema.ts"
Cohesion: 0.06
Nodes (35): applicationView, attachmentKind, attachmentsRelations, attachmentStatus, bomConsumptionMode, bomItemsRelations, bomRecipesRelations, bundleSizeMode (+27 more)

### Community 6 - "/graphify"
Cohesion: 0.06
Nodes (34): Configured Project Profiles, For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration (+26 more)

### Community 7 - "requireUser"
Cohesion: 0.10
Nodes (23): DELETE(), GET(), POST(), DELETE(), GET(), PATCH(), PATCH(), POST() (+15 more)

### Community 8 - "Card.tsx"
Cohesion: 0.12
Nodes (16): DashboardPage(), AddLineForm(), Product, Size, NewOrderForm(), ProveedorForm(), LinkButton(), Badge() (+8 more)

### Community 9 - "$graphify"
Cohesion: 0.07
Nodes (28): Configured Project Profiles, For --cluster-only, For $graphify add, For $graphify explain, For $graphify path, For $graphify query, For --update, For --watch (+20 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+19 more)

### Community 11 - "productos/[id]/page.tsx"
Cohesion: 0.12
Nodes (15): MoldesManager(), formatDate(), ProductoDetallePage(), ProductImageCard(), COMMON_ZONES, ComponentProduct, Mold, ProductInitial (+7 more)

### Community 12 - "orders.ts"
Cohesion: 0.11
Nodes (20): confirmQuote(), createOrder(), createOrderLine(), LINE_EDITABLE_STATUS, loadQuotableLines(), QuoteActionError, REQUOTE_BLOCKED_STATUS, reQuoteOrder() (+12 more)

### Community 13 - "auth.ts"
Cohesion: 0.14
Nodes (15): attempts, clientIp(), POST(), POST(), PATCH(), POST(), pricingRules, sessions (+7 more)

### Community 14 - "adjuntos/page.tsx"
Cohesion: 0.14
Nodes (14): copyAttachmentToOrder(), listOpenOrgOrders(), CopyToOrderButton(), copy(), OpenOrder, BibliotecaOrgPage(), ArteManager(), AttachmentDTO (+6 more)

### Community 15 - "public-orders.ts"
Cohesion: 0.17
Nodes (16): beginPublicUploadSession(), PublicOrderDomainError, PublicOrderFailure, KINDS, Step4Form(), onFile(), Uploaded, attachments (+8 more)

### Community 16 - "pricing.ts"
Cohesion: 0.15
Nodes (14): MaterialConsumptionSnapshot, consumptionUnitCost(), MaterialSummary, quoteBundleLine(), QuoteLineInput, quoteOrder(), QuoteResult, round2() (+6 more)

### Community 17 - "dependencies"
Cohesion: 0.11
Nodes (19): clsx, dotenv, drizzle-orm, lucide-react, @neondatabase/serverless, dependencies, clsx, dotenv (+11 more)

### Community 18 - "devDependencies"
Cohesion: 0.11
Nodes (19): drizzle-kit, eslint, eslint-config-next, devDependencies, drizzle-kit, eslint, eslint-config-next, @tailwindcss/postcss (+11 more)

### Community 19 - "client.ts"
Cohesion: 0.18
Nodes (14): DELETE(), PATCH(), patchSchema, GET(), nodeSchema, POST(), GET(), PATCH() (+6 more)

### Community 20 - "5/page.tsx"
Cohesion: 0.13
Nodes (9): metadata, Step1Form(), metadata, metadata, metadata, parseLineItems(), PresupuestoStep5(), StepIndicator() (+1 more)

### Community 21 - "2. Todo lo que el usuario pidió en este chat (cronológico)"
Cohesion: 0.11
Nodes (17): 1. Dónde está parado el proyecto, 2. Todo lo que el usuario pidió en este chat (cronológico), 3. Plan F6 — tareas y estado, 4. Decisiones técnicas ya tomadas (no reabrir sin motivo), 5. Archivos ya modificados en el working tree (SIN commitear al redactar), 6. Archivos a crear/modificar para terminar F6 (guía para el próximo agente), 7. Notas y gotchas para el próximo agente, 8. Correcciones posteriores a la auditoría F6 (+9 more)

### Community 22 - "Graph First — consult, maintain, and rebuild the knowledge graph"
Cohesion: 0.11
Nodes (17): 1. Hard rule: graph first, code second, 2. Command reference, 3. 1:1 parity with the code (mandatory), 4. Full rebuild, 5. Semantic enrichment (this is what makes the graph queryable), 6. The graph IS versioned, 7. Agent integration, 8. Known graphify defects (verified empirically) (+9 more)

### Community 23 - "RecetasEditor.tsx"
Cohesion: 0.13
Nodes (12): ConsumptionMode, Item, ItemForm, Material, Recipe, Size, Technique, POST() (+4 more)

### Community 24 - "03 · API ROUTES — Inventario"
Cohesion: 0.12
Nodes (17): 03 · API ROUTES — Inventario, A. Auth, B. Productos, C2. Proveedores (F6), C. Insumos / Materiales, D. Técnicas, Detalles importantes, E. Recetas (BOM) (+9 more)

### Community 25 - "KNOWN ISSUES — Bugs en el código de F1 (BUILD BREAKERS)"
Cohesion: 0.12
Nodes (16): Cómo verifiqué estos issues, KI-01 · `(admin)/layout.tsx:11-18` — Query rota, código muerto, KI-02 · `pedidos/[id]/page.tsx` — Links a rutas inexistentes, KI-03 · `pedidos/[id]/page.tsx:59` — Query ineficiente + posibles resultados incorrectos, KI-04 · `pedidos/[id]/page.tsx:4` — Imports no usados (lint warning), KI-05 · `pricing.ts:67-71` — Selección de receta "más específica" puede dar `undefined`, KI-06 · `pricing.ts:39-41` — Error genérico rompe toda cotización, KI-07 · `app/layout.tsx:13-21` — `<head>` manual con `<link>` a Google Fonts (+8 more)

### Community 26 - "AGENTS — AH Sports OS"
Cohesion: 0.12
Nodes (15): AGENTS — AH Sports OS, Convenciones operativas, Documentación, El grafo SÍ se versiona, Enriquecimiento semántico, Estructura, graphify — grafo de conocimiento (LEER ANTES DE EXPLORAR CÓDIGO), Invocación por agente (+7 more)

### Community 27 - "04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas"
Cohesion: 0.13
Nodes (15): 04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas, 10. Reglas operativas, 1. Lenguaje del dominio, 2. Tipos de adjunto (enum `attachmentKind`), 3. Estados de adjunto (enum `attachmentStatus`), 4. Máquina de estados de pedido (enum `orderStatus`), 5. Máquina de estados de prenda individual (enum `productionStage`), 6. Motor de cotización (función `quoteOrder()`) (+7 more)

### Community 28 - "08 · ROADMAP — Post-MVP"
Cohesion: 0.13
Nodes (14): 08 · ROADMAP — Post-MVP, Backlog sin fecha, 🟠 Bot de WhatsApp conversacional, 🟠 Compras y alertas de faltante, 🟠 Generación automática de arte final, 🟠 Inventario real por lote, 🟠 Mockup 2D avanzado, 🟠 Mockup 2D / personalizador visual (+6 more)

### Community 29 - "HANDOFF — Para el próximo agente de código"
Cohesion: 0.13
Nodes (14): Contacto con el usuario, Convenciones clave, Cuando termines una fase, Estructura mental del proyecto, Fix KI-01 (rompe build), Fix KI-05, KI-06, KI-12 — antes de F3, Fix KI-09 (F2-20) — bloqueante, HANDOFF — Para el próximo agente de código (+6 more)

### Community 30 - "organizations"
Cohesion: 0.14
Nodes (10): createOrganizationWithContact(), KIND_LABEL, metadata, STATUS_LABEL, submit(), PATCH(), POST(), organizations (+2 more)

### Community 31 - "06 · STANDARDS BUILDING — Reglas de código"
Cohesion: 0.14
Nodes (14): 06 · STANDARDS BUILDING — Reglas de código, A. Naming, API route, B. Imports, C. Estructura de archivos, D. Componentes UI, E. Estilos, F. Base de datos (+6 more)

### Community 32 - "07 · DEPLOYMENT — Render + Neon"
Cohesion: 0.14
Nodes (14): 07 · DEPLOYMENT — Render + Neon, 10. CI/CD, 11. Post-MVP checklist, 1. Prerrequisitos, 2. Crear DB en Neon, 3. Crear Web Service en Render, 4. Primer deploy, 5. Seed inicial (una sola vez) (+6 more)

### Community 33 - "product-taxonomy.ts"
Cohesion: 0.24
Nodes (11): NuevoProductoPage(), mergeProductTaxonomy(), PRODUCT_TAXONOMY, ProductTaxonomyCategory, ProductTaxonomyNode, ProductTaxonomySubcategory, ProductTaxonomyType, getProductTaxonomy() (+3 more)

### Community 34 - "product-domain.ts"
Cohesion: 0.32
Nodes (11): PATCH(), POST(), productBundleItems, productBundles, ProductStructureInput, replaceBundleItems(), validateProductClassification(), validateProductStructure() (+3 more)

### Community 35 - "[itemId]/route.ts"
Cohesion: 0.23
Nodes (11): POST(), DELETE(), parseItem(), PATCH(), BomConsumption, BomConsumptionInput, calculateBomConsumption(), ConsumptionMode (+3 more)

### Community 36 - "[itemId]/page.tsx"
Cohesion: 0.15
Nodes (8): ItemEditor(), ItemStageAdvance(), stageLabel, POST(), PRODUCTIVE, STAGE_TO_EVENT, productionEvents, stageSchema

### Community 37 - "planilla/page.tsx"
Cohesion: 0.17
Nodes (7): Item, Line, PlanillaRow(), PlanillaTable(), STAGES, stageTone, EmptyState()

### Community 38 - "sizes"
Cohesion: 0.17
Nodes (5): SizesManager(), dynamic, metadata, SUBCATEGORY_ORDER, sizes

### Community 39 - "(admin)/layout.tsx"
Cohesion: 0.27
Nodes (8): AdminLayout(), AdminMobileNav(), AdminMobileNavProps, ADMIN_NAV_ICONS, AdminNavIcon, AdminNavItem, getAdminNavItems(), navigation

### Community 40 - "build_master_guide.py"
Cohesion: 0.44
Nodes (10): body(), bullets(), cell_setup(), code(), fields(), heading(), note(), set_font() (+2 more)

### Community 41 - "⏳ F2 — Núcleo operativo (Productos + Insumos + Técnicas + Recetas + Talles + Pricing rules)"
Cohesion: 0.18
Nodes (10): A. Materiales / Insumos (catálogo base), B. Técnicas / Operaciones (costos de producción), C. Productos + Zonas, D. Talles + Moldes, E. Recetas técnicas (BOM), ⏳ F2 — Núcleo operativo (Productos + Insumos + Técnicas + Recetas + Talles + Pricing rules), F. Reglas de pricing, G. Seed de datos demo (F2-20 — bloqueante) (+2 more)

### Community 42 - "⏳ F3 — Clientes + Pedidos + Planilla + Kanban producción + Motor cotización"
Cohesion: 0.18
Nodes (10): A. Organizaciones + Contactos (CRM ligero), B. Pedidos (núcleo), C. Líneas de pedido + Planilla, D. Kanban de producción (drag-and-drop), E. Motor de cotización (ejecución real), ⏳ F3 — Clientes + Pedidos + Planilla + Kanban producción + Motor cotización, F. Avance por prenda (producción), G. Validación end-to-end F3 (+2 more)

### Community 43 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:generate, db:migrate, db:push, db:seed, db:studio, dev (+3 more)

### Community 44 - "ApplicationsManager.tsx"
Cohesion: 0.27
Nodes (7): ApplicationsManager(), AppLine, AppRow, AppStatusBadge(), AppTechnique, VIEWS, Tab

### Community 45 - "⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento"
Cohesion: 0.20
Nodes (9): A. Adjuntos (biblioteca y carga), B. Aplicaciones (archivo × ubicación × técnica), C. Presupuesto público (5 pasos), D. Seguimiento público, E. Listado global de arte, ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento, F. Validación end-to-end F4, G. Cierre F4 (+1 more)

### Community 46 - "graphify-sync.mjs"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, NOTE: `graphify hook install` restores the stock hooks and will undo the, REAPPLY, REPO_ROOT

### Community 47 - "settings.ts"
Cohesion: 0.27
Nodes (8): updateSetting(), updateSettingSchema, WORKSHOP_SETTING_KEYS, FIELDS, settingValue(), WorkshopSettingsForm(), submit(), settings

### Community 48 - "insumos/[id]/page.tsx"
Cohesion: 0.24
Nodes (3): DesactivarButton(), InsumoForm(), suppliers

### Community 49 - "login/page.tsx"
Cohesion: 0.27
Nodes (5): LoginForm(), LoginPage(), navigation, PublicShell(), getCurrentUser()

### Community 50 - "✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)"
Cohesion: 0.22
Nodes (8): ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción), Cómo avanzar (protocolo sesión), Estado global, F6.4 — Formularios admin y catálogo editable (2026-09-10), Material origen analizado (F0), Progreso consolidado, Reglas OBLIGATORIAS de construcción (heredadas), Índice de fases (archivos BUILD_PROGRESS-F<N>.md)

### Community 51 - "⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre"
Cohesion: 0.22
Nodes (8): A. Caja y saldos, B. Pagos, C. Configuración general, D. Deploy en Render, E. Endurecimiento mínimo, ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre, F. Cierre del proyecto, Resumen F5

### Community 52 - "00-README.md"
Cohesion: 0.22
Nodes (4): AH Sports OS — Documentación, Estado del proyecto, Resumen ejecutivo, Índice

### Community 53 - "05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento"
Cohesion: 0.22
Nodes (8): 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento, A. Alcance del MVP (relevamiento §1), 🔴 ALTA, B. Gaps por severidad, 🟡 BAJA, C. Decisiones tomadas vs relevamiento, D. Cobertura por dominio del relevamiento, 🟠 MEDIA

### Community 54 - "reapply-descriptions.mjs"
Cohesion: 0.22
Nodes (8): cache, graph, HERE, hits, misses, PRIMARY_CACHE, REPO_ROOT, SKILL_DIR

### Community 55 - "RecetasEditor"
Cohesion: 0.33
Nodes (6): RecetasEditor(), addItem(), editItem(), formFor(), setForm(), updateItem()

### Community 56 - "✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system)"
Cohesion: 0.25
Nodes (7): A. Configuración base, B. Schema Drizzle completo, C. Auth + utils + pricing engine, D. Design system + UI primitives, E. Smoke tests, ✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system), Resumen F1

### Community 57 - "KanbanBoard.tsx"
Cohesion: 0.32
Nodes (4): columnOf(), columns, KanbanBoard(), OrderRow

### Community 58 - "✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS)"
Cohesion: 0.29
Nodes (6): A. Inventario Stitch, B. Mapeo Stitch → rutas destino, C. Auditoría de gaps Stitch vs realidad, D. Cierre F0, ✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS), Resumen F0

### Community 59 - "02 · ARCHITECTURE — AH Sports OS"
Cohesion: 0.29
Nodes (6): 02 · ARCHITECTURE — AH Sports OS, 1. Stack, 2. Estructura de carpetas, 3. Capas y responsabilidades, 4. Decisiones arquitectónicas, 5. Reglas de oro

### Community 60 - "SDD — F4-01: Storage adapter (src/lib/storage.ts)"
Cohesion: 0.29
Nodes (6): Anti-invención, Design, How to verify, SDD — F4-01: Storage adapter (src/lib/storage.ts), Spec (criterios de aceptación — del BUILD_PROGRESS-F4), What (problema)

### Community 61 - "SDD — F4-07..13: Presupuesto público (wizard 5 pasos)"
Cohesion: 0.29
Nodes (6): Anti-invención, Design, How to verify, SDD — F4-07..13: Presupuesto público (wizard 5 pasos), Spec (criterios de aceptación, del BUILD_PROGRESS-F4), What (problema)

### Community 62 - "PENDIENTES — AH Sports OS"
Cohesion: 0.29
Nodes (6): Cómo retomar, Diferido explícitamente (fuera de MVP — ver `docs/05-GAP-ANALYSIS.md`), Estado al cierre, Pasos para terminar al 100%, PENDIENTES — AH Sports OS, Soporte / contacto

### Community 63 - "AH Sports OS"
Cohesion: 0.29
Nodes (6): AH Sports OS, Deploy en Render, Estructura, Mapeo Stitch → Rutas, Quick start, Troubleshooting

### Community 64 - "configuracion/catalogo/page.tsx"
Cohesion: 0.33
Nodes (3): CatalogManager(), CatalogoPage(), getProductTaxonomyNodes()

### Community 65 - "materials"
Cohesion: 0.29
Nodes (5): PATCH(), POST(), materials, materialBaseSchema, materialSchema

### Community 66 - "3/page.tsx"
Cohesion: 0.33
Nodes (4): metadata, parseSizes(), PresupuestoStep3(), Step3Form()

### Community 67 - "seed.ts"
Cohesion: 0.33
Nodes (5): sql, users, adminPassword, hashPasswordSeed(), main()

### Community 68 - "F6 — Proveedores, BOM por talle y costos trazables"
Cohesion: 0.33
Nodes (5): Estado, F6 — Proveedores, BOM por talle y costos trazables, Migraciones aplicadas en Neon, Riesgos y límites conocidos, Verificación

### Community 69 - "01 · PARITY INVENTORY — Stitch → AH Sports OS"
Cohesion: 0.33
Nodes (5): 01 · PARITY INVENTORY — Stitch → AH Sports OS, 1. Stitch design system, 2. Tabla maestra Stitch → rutas, 3. Auditorías de cobertura (origen), 4. Decisiones de simplificación

### Community 70 - "RELEASE NOTES — AH Sports OS (MVP v1.0)"
Cohesion: 0.33
Nodes (5): Cómo retomar el desarrollo, Diferido para F6+, Qué incluye, RELEASE NOTES — AH Sports OS (MVP v1.0), Seguridad de accesos (importante)

### Community 71 - "products"
Cohesion: 0.47
Nodes (5): "sizes", "garment_molds", "product_bundle_items", "product_bundles", products

### Community 72 - "PricingRulesManager"
Cohesion: 0.40
Nodes (3): PricingRulesManager(), cancelForm(), submit()

### Community 73 - "cotizar/page.tsx"
Cohesion: 0.47
Nodes (4): CLOSED_STATUS, CotizarPage(), ConfirmQuoteForm(), ReQuoteForm()

### Community 75 - "TecnicasManager"
Cohesion: 0.50
Nodes (3): TecnicasManager(), cancelEdit(), submit()

### Community 76 - "(public)/page.tsx"
Cohesion: 0.40
Nodes (3): services, sizes, steps

### Community 77 - "[token]/page.tsx"
Cohesion: 0.40
Nodes (3): metadata, STATUS_LABEL, TIMELINE

### Community 78 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): compat, __dirname, __filename

### Community 79 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 80 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 81 - "ficha-tecnica/page.tsx"
Cohesion: 0.67
Nodes (3): FichaTecnicaPage(), PricingSnapshot, consumptionUnit()

## Knowledge Gaps
- **560 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `HERE`, `REPO_ROOT`, `REAPPLY` (+555 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requireUser()` connect `requireUser` to `orders`, `configuracion/catalogo/page.tsx`, `materials`, `validators.ts`, `attachments.ts`, `[itemId]/page.tsx`, `product-domain.ts`, `(admin)/layout.tsx`, `Card.tsx`, `[itemId]/route.ts`, `orders.ts`, `auth.ts`, `adjuntos/page.tsx`, `settings.ts`, `login/page.tsx`, `client.ts`, `RecetasEditor.tsx`, `organizations`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `db` connect `client.ts` to `orders`, `formatCurrency`, `validators.ts`, `attachments.ts`, `requireUser`, `Card.tsx`, `productos/[id]/page.tsx`, `orders.ts`, `auth.ts`, `adjuntos/page.tsx`, `public-orders.ts`, `pricing.ts`, `5/page.tsx`, `RecetasEditor.tsx`, `organizations`, `product-taxonomy.ts`, `product-domain.ts`, `[itemId]/route.ts`, `[itemId]/page.tsx`, `planilla/page.tsx`, `sizes`, `(admin)/layout.tsx`, `ApplicationsManager.tsx`, `settings.ts`, `insumos/[id]/page.tsx`, `KanbanBoard.tsx`, `materials`, `3/page.tsx`, `seed.ts`, `cotizar/page.tsx`, `proveedores/[id]/page.tsx`, `[token]/page.tsx`, `ficha-tecnica/page.tsx`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `ProductoForm()` connect `productos/[id]/page.tsx` to `product-taxonomy.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `HERE` to the rest of the system?**
  _560 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `orders` be split into smaller, more focused modules?**
  _Cohesion score 0.060153776571687016 - nodes in this community are weakly interconnected._
- **Should `Button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08549019607843138 - nodes in this community are weakly interconnected._
- **Should `formatCurrency` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._