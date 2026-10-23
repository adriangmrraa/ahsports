# Graph Report - parity-w9-domain  (2026-10-23)

## Corpus Check
- 363 files · ~276,887 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3017 nodes · 6854 edges · 173 communities (157 shown, 16 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5ac5543f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- db-transaction.ts
- Button.tsx
- ChannelsView.tsx
- isSchemaNotReady
- attachments/route.ts
- db/schema.ts
- /graphify
- requireUser
- Card.tsx
- $graphify
- compilerOptions
- tools-analytics.ts
- orders.ts
- login/route.ts
- session-policy.ts
- public-orders.ts
- pricing.ts
- dependencies
- devDependencies
- agent-config.ts
- 5/page.tsx
- 2. Todo lo que el usuario pidió en este chat (cronológico)
- Graph First — consult, maintain, and rebuild the knowledge graph
- router.ts
- 03 · API ROUTES — Inventario
- KNOWN ISSUES — Bugs en el código de F1 (BUILD BREAKERS)
- AGENTS — AH Sports OS
- 04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas
- 08 · ROADMAP — Post-MVP
- HANDOFF — Para el próximo agente de código
- inbox/page.tsx
- 06 · STANDARDS BUILDING — Reglas de código
- 07 · DEPLOYMENT — Render + Neon
- tools-orders.ts
- products/route.ts
- session-store.ts
- lib/payments.ts
- 11 · SOCIALCRM → AH SPORTS PORT — Reporte final de orquestación
- SizesManager
- (admin)/layout.tsx
- build_master_guide.py
- ⏳ F2 — Núcleo operativo (Productos + Insumos + Técnicas + Recetas + Talles + Pricing rules)
- ⏳ F3 — Clientes + Pedidos + Planilla + Kanban producción + Motor cotización
- scripts
- read.ts
- ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento
- graphify-sync.mjs
- RecetasEditor
- loop.ts
- auth.ts
- ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)
- ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre
- 00-README.md
- 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento
- reapply-descriptions.mjs
- insumos/[id]/page.tsx
- ✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system)
- 01 · PARITY INVENTORY — Stitch → AH Sports OS
- ✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS)
- 02 · ARCHITECTURE — AH Sports OS
- SDD — F4-01: Storage adapter (src/lib/storage.ts)
- SDD — F4-07..13: Presupuesto público (wizard 5 pasos)
- PENDIENTES — AH Sports OS
- AH Sports OS
- messaging/accounts.ts
- channels/accounts.ts
- sales-tools.ts
- channels/channel-events.ts
- F6 — Proveedores, BOM por talle y costos trazables
- ycloud.ts
- RELEASE NOTES — AH Sports OS (MVP v1.0)
- 0000_core_schema.sql
- PricingRulesManager
- describe-new-nodes.mjs
- confirmations.ts
- TecnicasManager
- (public)/page.tsx
- sales-agent.ts
- eslint.config.mjs
- opencode.json
- package.json
- kapso.ts
- next.config.ts
- app/layout.tsx
- NEON-MIGRATION-BASELINE.md
- 10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas
- next-env.d.ts
- validators.ts
- postcss.config.mjs
- 0001_public_upload_sessions.sql
- 0003_suppliers.sql
- "product_taxonomy_nodes"
- whatsapp/webhook/[token]/route.ts
- reconcile.ts
- tools-clients.ts
- tools-cash.ts
- human-handoff.ts
- agent-config-scope.ts
- conversations
- zernio.ts
- runner.ts
- whatsapp/index.ts
- import.ts
- inbound-pipeline.ts
- conversation-identity.ts
- ingress.ts
- messaging/registry.ts
- config.ts
- draft.ts
- intake.ts
- buffer.ts
- temporal-context.ts
- zernio-connect.ts
- secret-box.ts
- telegram.ts
- client.ts
- bot.ts
- storage.ts
- channels/types.ts
- tools-memory.ts
- product-taxonomy.ts
- adjuntos/page.tsx
- channels/errors.ts
- tools-broadcast.ts
- check-agent-tools.mts
- tools-products.ts
- send.ts
- 3. Detalle por área
- messaging/errors.ts
- migrate-descriptions-v0946.mjs
- agent/reconcile/route.ts
- telegram/reconcile/route.ts
- checkRateLimit
- vision.ts
- APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)
- Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)
- messaging/channel-events.ts
- ApplicationsManager.tsx
- tools/schema.ts
- messaging/send-account.ts
- link-preview/route.ts
- 1/page.tsx
- MessagesTimeline.tsx
- consumption.ts
- PlanillaTable.tsx
- order-context.ts
- orders/[id]/stage/route.ts
- pdf-parse.d.ts
- product-taxonomy/[id]/route.ts
- login/page.tsx
- "chat_messages"
- rate-limit.ts
- protocol.ts
- orders/route.ts
- settings.ts
- resolveGarmentLine
- 0022_cash_sessions.sql
- @neondatabase/serverless
- 0021_promotions.sql
- "conversations"

## God Nodes (most connected - your core abstractions)
1. `db` - 140 edges
2. `requireUser()` - 131 edges
3. `Card()` - 53 edges
4. `PageHeader()` - 48 edges
5. `products` - 42 edges
6. `Button()` - 41 edges
7. `orders` - 40 edges
8. `formatCurrency()` - 37 edges
9. `Input()` - 34 edges
10. `Badge()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `submit()` --calls--> `createChannelAccount()`  [EXTRACTED]
  src/app/(admin)/admin/canales/ChannelsView.tsx → src/app/actions/channel-accounts.ts
- `toggleStatus()` --calls--> `setChannelAccountStatus()`  [EXTRACTED]
  src/app/(admin)/admin/canales/ChannelsView.tsx → src/app/actions/channel-accounts.ts
- `confirm()` --calls--> `createPublicOrder()`  [EXTRACTED]
  src/app/(public)/presupuesto/5/Step5Form.tsx → src/app/actions/public-orders.ts
- `GET()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/attachments/[id]/route.ts → src/lib/auth.ts
- `PATCH()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/attachments/[id]/route.ts → src/lib/auth.ts

## Import Cycles
- 3-file cycle: `src/lib/messaging/accounts.ts -> src/lib/messaging/registry.ts -> src/lib/messaging/providers/ycloud.ts -> src/lib/messaging/accounts.ts`

## Communities (173 total, 16 thin omitted)

### Community 0 - "db-transaction.ts"
Cohesion: 0.15
Nodes (21): cancelPayment(), registerPayment(), CancelPaymentButton(), cancel(), KINDS, METHODS, RegisterPaymentForm(), submit() (+13 more)

### Community 1 - "Button.tsx"
Cohesion: 0.05
Nodes (50): createOrganizationWithContact(), OperatorUserOption, labels, Node, FIELDS, settingValue(), WorkshopSettingsForm(), MATERIAL_CATEGORIES (+42 more)

### Community 2 - "ChannelsView.tsx"
Cohesion: 0.07
Nodes (45): CHANNELS, FLASH_ERRORS, Notice, PROVIDER_HINTS, PROVIDER_LABELS, PROVIDERS, ZERNIO_CONNECT, EMPTY (+37 more)

### Community 3 - "isSchemaNotReady"
Cohesion: 0.20
Nodes (17): ChannelAccountRow, createChannelAccount(), createChannelAccountSchema, credentialsRefSchema, listChannelAccounts(), setChannelAccountStatus(), setChannelAccountStatusSchema, updateChannelAccount() (+9 more)

### Community 4 - "attachments/route.ts"
Cohesion: 0.12
Nodes (18): formStr(), uploadAttachment(), submitUpload(), DELETE(), GET(), PATCH(), GET(), POST() (+10 more)

### Community 5 - "db/schema.ts"
Cohesion: 0.03
Nodes (58): agentConfigRelations, AgentEnabledTools, agentKind, agentMemoryScope, AgentRawPayload, agentSessionEventsRelations, agentSessionStatesRelations, applicationView (+50 more)

### Community 6 - "/graphify"
Cohesion: 0.06
Nodes (34): Configured Project Profiles, For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration (+26 more)

### Community 7 - "requireUser"
Cohesion: 0.07
Nodes (31): listOrgLibrary(), ContactosPage(), EditarPromoPage(), NuevaPromoPage(), DELETE(), GET(), POST(), PATCH() (+23 more)

### Community 8 - "Card.tsx"
Cohesion: 0.08
Nodes (43): KIND_LABEL, metadata, metadata, ConfiguracionPage(), kindLabel, OrganizacionPerfilPage(), statusLabel, DashboardPage() (+35 more)

### Community 9 - "$graphify"
Cohesion: 0.07
Nodes (28): Configured Project Profiles, For --cluster-only, For $graphify add, For $graphify explain, For $graphify path, For $graphify query, For --update, For --watch (+20 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+19 more)

### Community 11 - "tools-analytics.ts"
Cohesion: 0.11
Nodes (16): PromosPage(), salesPerformanceTool, AR_TIMEZONE, arDayRange(), dateFormatter, dateTimeFormatter, formatDateTimeAr(), formatMoneyAr() (+8 more)

### Community 12 - "orders.ts"
Cohesion: 0.14
Nodes (16): confirmQuote(), createOrderLine(), LINE_EDITABLE_STATUS, loadQuotableLines(), QuoteActionError, REQUOTE_BLOCKED_STATUS, reQuoteOrder(), submit() (+8 more)

### Community 13 - "login/route.ts"
Cohesion: 0.20
Nodes (11): POST(), createSession(), checkLoginThrottle(), createMemoryThrottle(), checkWindow(), evictExpired(), DUMMY_PASSWORD_HASH, LoginThrottleVerdict (+3 more)

### Community 14 - "session-policy.ts"
Cohesion: 0.15
Nodes (16): applyCommercialFacts(), assertSessionContext(), AssetKind, classifyBoundary(), CommercialFacts, createInitialSessionState(), nextState(), PendingQuestion (+8 more)

### Community 15 - "public-orders.ts"
Cohesion: 0.15
Nodes (19): beginPublicUploadSession(), createPublicOrder(), PublicOrderFailure, uploadAttachmentFromPublic(), WIZARD_RATE_LIMITED, KINDS, Step4Form(), onFile() (+11 more)

### Community 16 - "pricing.ts"
Cohesion: 0.15
Nodes (14): MaterialConsumptionSnapshot, PricingSnapshot, consumptionUnitCost(), MaterialSummary, quoteBundleLine(), QuoteLineInput, quoteOrder(), round2() (+6 more)

### Community 17 - "dependencies"
Cohesion: 0.10
Nodes (21): clsx, dotenv, lucide-react, next, dependencies, clsx, dotenv, drizzle-orm (+13 more)

### Community 18 - "devDependencies"
Cohesion: 0.10
Nodes (21): drizzle-kit, eslint, eslint-config-next, devDependencies, drizzle-kit, eslint, eslint-config-next, tailwindcss (+13 more)

### Community 19 - "agent-config.ts"
Cohesion: 0.08
Nodes (41): bindAgentOperator(), BindAgentOperatorInput, bindOperatorSchema, copyAgentConfig(), copyAgentConfigSchema, insertConfigRow(), isUniqueViolation(), nullable() (+33 more)

### Community 20 - "5/page.tsx"
Cohesion: 0.13
Nodes (12): metadata, parseSizes(), PresupuestoStep3(), Step3Form(), metadata, metadata, parseLineItems(), PresupuestoStep5() (+4 more)

### Community 21 - "2. Todo lo que el usuario pidió en este chat (cronológico)"
Cohesion: 0.11
Nodes (17): 1. Dónde está parado el proyecto, 2. Todo lo que el usuario pidió en este chat (cronológico), 3. Plan F6 — tareas y estado, 4. Decisiones técnicas ya tomadas (no reabrir sin motivo), 5. Archivos ya modificados en el working tree (SIN commitear al redactar), 6. Archivos a crear/modificar para terminar F6 (guía para el próximo agente), 7. Notas y gotchas para el próximo agente, 8. Correcciones posteriores a la auditoría F6 (+9 more)

### Community 22 - "Graph First — consult, maintain, and rebuild the knowledge graph"
Cohesion: 0.11
Nodes (17): 1. Hard rule: graph first, code second, 2. Command reference, 3. 1:1 parity with the code (mandatory), 4. Full rebuild, 5. Semantic enrichment (this is what makes the graph queryable), 6. The graph IS versioned, 7. Agent integration, 8. Known graphify defects and version split (verified empirically) (+9 more)

### Community 23 - "router.ts"
Cohesion: 0.36
Nodes (11): runAgentLoop(), resolveEnabledTools(), createChatProvider(), denialMessage(), outboundPlatformId(), persistOutboundReply(), routeInboundMessage(), RouteResult (+3 more)

### Community 24 - "03 · API ROUTES — Inventario"
Cohesion: 0.11
Nodes (18): 03 · API ROUTES — Inventario, A. Auth, B. Productos, C2. Proveedores (F6), C. Insumos / Materiales, D. Técnicas, Detalles importantes, E. Recetas (BOM) (+10 more)

### Community 25 - "KNOWN ISSUES — Bugs en el código de F1 (BUILD BREAKERS)"
Cohesion: 0.12
Nodes (16): Cómo verifiqué estos issues, KI-01 · `(admin)/layout.tsx:11-18` — Query rota, código muerto, KI-02 · `pedidos/[id]/page.tsx` — Links a rutas inexistentes, KI-03 · `pedidos/[id]/page.tsx:59` — Query ineficiente + posibles resultados incorrectos, KI-04 · `pedidos/[id]/page.tsx:4` — Imports no usados (lint warning), KI-05 · `pricing.ts:67-71` — Selección de receta "más específica" puede dar `undefined`, KI-06 · `pricing.ts:39-41` — Error genérico rompe toda cotización, KI-07 · `app/layout.tsx:13-21` — `<head>` manual con `<link>` a Google Fonts (+8 more)

### Community 26 - "AGENTS — AH Sports OS"
Cohesion: 0.12
Nodes (15): AGENTS — AH Sports OS, Convenciones operativas, Documentación, El grafo SÍ se versiona, Enriquecimiento semántico, Estructura, graphify — grafo de conocimiento (LEER ANTES DE EXPLORAR CÓDIGO), Invocación por agente (+7 more)

### Community 27 - "04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas"
Cohesion: 0.12
Nodes (15): 04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas, 10. Reglas operativas, 1. Lenguaje del dominio, 2. Tipos de adjunto (enum `attachmentKind`), 3. Estados de adjunto (enum `attachmentStatus`), 4. Máquina de estados de pedido (enum `orderStatus`), 5. Máquina de estados de prenda individual (enum `productionStage`), 6. Motor de cotización (función `quoteOrder()`) (+7 more)

### Community 28 - "08 · ROADMAP — Post-MVP"
Cohesion: 0.13
Nodes (14): 08 · ROADMAP — Post-MVP, Backlog sin fecha, 🟠 Bot de WhatsApp conversacional, 🟠 Compras y alertas de faltante, 🟠 Generación automática de arte final, 🟠 Inventario real por lote, 🟠 Mockup 2D avanzado, 🟠 Mockup 2D / personalizador visual (+6 more)

### Community 29 - "HANDOFF — Para el próximo agente de código"
Cohesion: 0.13
Nodes (14): Contacto con el usuario, Convenciones clave, Cuando termines una fase, Estructura mental del proyecto, Fix KI-01 (rompe build), Fix KI-05, KI-06, KI-12 — antes de F3, Fix KI-09 (F2-20) — bloqueante, HANDOFF — Para el próximo agente de código (+6 more)

### Community 30 - "inbox/page.tsx"
Cohesion: 0.14
Nodes (28): conversationsInputSchema, isoDateTime, loadConversations(), messagesInputSchema, ConversationTable(), accountOptionLabel(), channelBadgeTone(), INBOX_CHANNEL_LABEL (+20 more)

### Community 31 - "06 · STANDARDS BUILDING — Reglas de código"
Cohesion: 0.13
Nodes (14): 06 · STANDARDS BUILDING — Reglas de código, A. Naming, API route, B. Imports, C. Estructura de archivos, D. Componentes UI, E. Estilos, F. Base de datos (+6 more)

### Community 32 - "07 · DEPLOYMENT — Render + Neon"
Cohesion: 0.14
Nodes (14): 07 · DEPLOYMENT — Render + Neon, 10. CI/CD, 11. Post-MVP checklist, 1. Prerrequisitos, 2. Crear DB en Neon, 3. Crear Web Service en Render, 4. Primer deploy, 5. Seed inicial (una sola vez) (+6 more)

### Community 33 - "tools-orders.ts"
Cohesion: 0.05
Nodes (41): AnyOrderStatus, cancelOrderInner, cancelOrderInput, cancelOrderTool, cancelPaymentInner, cancelPaymentInput, cancelPaymentTool, CONFIRM_REQUIRED_STATUSES (+33 more)

### Community 34 - "products/route.ts"
Cohesion: 0.16
Nodes (19): DELETE(), PATCH(), POST(), GET(), PATCH(), GET(), POST(), productBundleItems (+11 more)

### Community 35 - "session-store.ts"
Cohesion: 0.14
Nodes (18): agentSessionEvents, BoundarySignal, CommercialIntent, ConversationSessionState, SessionEventType, SessionPolicyRepository, CasConflictError, DrizzleSessionPolicyRepository (+10 more)

### Community 36 - "lib/payments.ts"
Cohesion: 0.13
Nodes (25): CajaDetallePage(), CajaPage(), PedidoPagosPage(), paymentEvents, money(), BlockGateInput, BlockGateResult, fromCents() (+17 more)

### Community 37 - "11 · SOCIALCRM → AH SPORTS PORT — Reporte final de orquestación"
Cohesion: 0.20
Nodes (9): 0. Datos de la corrida, 11 · SOCIALCRM → AH SPORTS PORT — Reporte final de orquestación, Archivos de referencia, Gates corridos (en cada merge y al cierre), Ola 1 — Foundation (messaging + cuentas de canal), Ola 2 — Agents + UX (4 workers paralelos), Ola 3 — Hardening, Resolución del grafo de conocimiento (inconsistencia `.graphify/` vs `graphify-out/`) (+1 more)

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
Cohesion: 0.17
Nodes (12): scripts, build, check:agent-tools, db:generate, db:migrate, db:push, db:seed, db:studio (+4 more)

### Community 44 - "read.ts"
Cohesion: 0.07
Nodes (30): draftTools, findMissingInfoInput, findMissingInfoTool, getConversationInput, getConversationTool, idLike, lookupCustomerInput, lookupOrderInput (+22 more)

### Community 45 - "⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento"
Cohesion: 0.20
Nodes (9): A. Adjuntos (biblioteca y carga), B. Aplicaciones (archivo × ubicación × técnica), C. Presupuesto público (5 pasos), D. Seguimiento público, E. Listado global de arte, ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento, F. Validación end-to-end F4, G. Cierre F4 (+1 more)

### Community 46 - "graphify-sync.mjs"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, LEGACY_GRAPH, REAPPLY, REPO_ROOT

### Community 47 - "RecetasEditor"
Cohesion: 0.33
Nodes (6): RecetasEditor(), addItem(), editItem(), formFor(), setForm(), updateItem()

### Community 48 - "loop.ts"
Cohesion: 0.08
Nodes (27): detectInjectionAttempt(), InjectionSignal, SIGNATURES, AgentLoopInput, AgentLoopResult, AgentToolCallTrace, parseToolArguments(), SENTINEL_PATTERN (+19 more)

### Community 49 - "auth.ts"
Cohesion: 0.11
Nodes (15): POST(), PATCH(), POST(), sessions, destroySession(), requireRole(), sign(), verifySignature() (+7 more)

### Community 50 - "✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)"
Cohesion: 0.22
Nodes (8): ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción), Cómo avanzar (protocolo sesión), Estado global, F6.4 — Formularios admin y catálogo editable (2026-09-10), Material origen analizado (F0), Progreso consolidado, Reglas OBLIGATORIAS de construcción (heredadas), Índice de fases (archivos BUILD_PROGRESS-F<N>.md)

### Community 51 - "⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre"
Cohesion: 0.22
Nodes (8): A. Caja y saldos, B. Pagos, C. Configuración general, D. Deploy en Render, E. Endurecimiento mínimo, ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre, F. Cierre del proyecto, Resumen F5

### Community 52 - "00-README.md"
Cohesion: 0.29
Nodes (4): AH Sports OS — Documentación, Estado del proyecto, Resumen ejecutivo, Índice

### Community 53 - "05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento"
Cohesion: 0.22
Nodes (8): 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento, A. Alcance del MVP (relevamiento §1), 🔴 ALTA, B. Gaps por severidad, 🟡 BAJA, C. Decisiones tomadas vs relevamiento, D. Cobertura por dominio del relevamiento, 🟠 MEDIA

### Community 54 - "reapply-descriptions.mjs"
Cohesion: 0.25
Nodes (7): cache, graph, HERE, misses, PRIMARY_CACHE, REPO_ROOT, SKILL_DIR

### Community 55 - "insumos/[id]/page.tsx"
Cohesion: 0.10
Nodes (6): DesactivarButton(), InsumosTable(), InsumoForm(), EstadoButton(), ProveedorForm(), suppliers

### Community 56 - "✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system)"
Cohesion: 0.25
Nodes (7): A. Configuración base, B. Schema Drizzle completo, C. Auth + utils + pricing engine, D. Design system + UI primitives, E. Smoke tests, ✅ F1 — Fundación (Next.js + Drizzle + Neon + Auth + Design system), Resumen F1

### Community 57 - "01 · PARITY INVENTORY — Stitch → AH Sports OS"
Cohesion: 0.33
Nodes (5): 01 · PARITY INVENTORY — Stitch → AH Sports OS, 1. Stitch design system, 2. Tabla maestra Stitch → rutas, 3. Auditorías de cobertura (origen), 4. Decisiones de simplificación

### Community 58 - "✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS)"
Cohesion: 0.29
Nodes (6): A. Inventario Stitch, B. Mapeo Stitch → rutas destino, C. Auditoría de gaps Stitch vs realidad, D. Cierre F0, ✅ F0 — Audit del material Stitch + análisis del dominio (AH Sports OS), Resumen F0

### Community 59 - "02 · ARCHITECTURE — AH Sports OS"
Cohesion: 0.29
Nodes (7): 02 · ARCHITECTURE — AH Sports OS, 1. Stack, 2. Estructura de carpetas, 3. Capas y responsabilidades, 4. Decisiones arquitectónicas, 5. Reglas de oro, ADR-19 — Plataforma de agentes IA (provider-neutral, draft-only, multicanal)

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
Nodes (7): Agente IA (Telegram + WhatsApp), AH Sports OS, Deploy en Render, Estructura, Mapeo Stitch → Rutas, Quick start, Troubleshooting

### Community 64 - "messaging/accounts.ts"
Cohesion: 0.10
Nodes (37): accountStore, ChannelAccountResolution, ChannelAccountResolutionError, ChannelAccountRow, channelAccountRowId(), ChannelAccountStore, classifyRowsError(), createEnvAccountStore() (+29 more)

### Community 65 - "channels/accounts.ts"
Cohesion: 0.09
Nodes (34): ChannelAccountResolution, ChannelAccountResolutionError, ChannelAccountRow, classifyRowsError(), credentialsFromEnv(), fallbackAccount(), legacyFallbackAccount(), matchRows() (+26 more)

### Community 66 - "sales-tools.ts"
Cohesion: 0.03
Nodes (56): addCartItemInput, addCartItemTool, AR_DAYS, BusinessHourDay, businessHoursInput, cancelDraftInput, cancelDraftTool, checkAvailabilityInput (+48 more)

### Community 67 - "channels/channel-events.ts"
Cohesion: 0.16
Nodes (15): sql, channelEvents, ChannelEventContext, ChannelEventEnvelope, channelEventKey(), ChannelEventPersistResult, ChannelEventRepository, DrizzleChannelEventRepository (+7 more)

### Community 68 - "F6 — Proveedores, BOM por talle y costos trazables"
Cohesion: 0.33
Nodes (5): Estado, F6 — Proveedores, BOM por talle y costos trazables, Migraciones aplicadas en Neon, Riesgos y límites conocidos, Verificación

### Community 69 - "ycloud.ts"
Cohesion: 0.11
Nodes (33): asString(), baseEvent(), classifySignatureFailure(), ECHO_EVENT_TYPES, ECHO_MESSAGE_KEYS, ENVELOPE_KEYS, EVENT_ENVELOPE_KEYS, extractContextReplyId() (+25 more)

### Community 70 - "RELEASE NOTES — AH Sports OS (MVP v1.0)"
Cohesion: 0.33
Nodes (5): Cómo retomar el desarrollo, Diferido para F6+, Qué incluye, RELEASE NOTES — AH Sports OS (MVP v1.0), Seguridad de accesos (importante)

### Community 71 - "0000_core_schema.sql"
Cohesion: 0.07
Nodes (52): "agent_config", "agent_config", "agent_memories", "agent_session_events", "agent_session_states", "applications", "attachments", "audit_events" (+44 more)

### Community 72 - "PricingRulesManager"
Cohesion: 0.40
Nodes (3): PricingRulesManager(), cancelForm(), submit()

### Community 73 - "describe-new-nodes.mjs"
Cohesion: 0.21
Nodes (14): answers, describe(), detectKind(), docAbove(), fileCache, firstSentence(), graph, headerDoc() (+6 more)

### Community 74 - "confirmations.ts"
Cohesion: 0.09
Nodes (27): auditEvents, AuditPayload, AgentToolContext, auditOperatorAction(), auditSafeArgs(), extractEntityRef(), OperatorAuditInput, SAFE_ARG_KEYS (+19 more)

### Community 75 - "TecnicasManager"
Cohesion: 0.50
Nodes (3): TecnicasManager(), cancelEdit(), submit()

### Community 76 - "(public)/page.tsx"
Cohesion: 0.40
Nodes (3): services, sizes, steps

### Community 77 - "sales-agent.ts"
Cohesion: 0.13
Nodes (24): agentSessionStates, analyzeConversationState(), classifyMessageType(), ConversationMetadata, MessageType, loadConversationHistory(), isHumanOverrideActive(), deliverAgentReply() (+16 more)

### Community 78 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): compat, __dirname, __filename

### Community 79 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 80 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 81 - "kapso.ts"
Cohesion: 0.17
Nodes (22): asString(), buildGraphBody(), classifyKind(), contactSender(), deliveryIdFor(), extractMediaRefs(), extractText(), isRecord() (+14 more)

### Community 85 - "10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas"
Cohesion: 0.05
Nodes (37): 0. Estado real: implementado vs. validado en vivo (leer primero), 10.1 Pre-vuelo (sin proveedor), 10.2 Telegram (canal interno), 10.3 WhatsApp (canal de ventas), 10.4 Reconciliación, 10. Checklist de pruebas (mensajes reales), 10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas, 11. Troubleshooting (+29 more)

### Community 88 - "validators.ts"
Cohesion: 0.06
Nodes (34): PATCH(), PATCH(), POST(), PATCH(), emptyMeasurementSchema, POST(), GarmentMeasurementSchema, BUNDLE_SIZE_MODES (+26 more)

### Community 95 - "whatsapp/webhook/[token]/route.ts"
Cohesion: 0.12
Nodes (25): contactNameFor(), dynamic, EventType, GET(), mapMessageType(), mediaRefsFor(), metaDeliveryId(), metaEnvelopeToEvents() (+17 more)

### Community 101 - "reconcile.ts"
Cohesion: 0.12
Nodes (25): agentConfig, AuditInput, AuditRecorder, AuditWriter, createAuditRecorder(), deleteExpiredMemories(), NO_REPLY_IDEMPOTENCY_SCOPE, purgeExpiredIdempotencyKeys() (+17 more)

### Community 102 - "tools-clients.ts"
Cohesion: 0.08
Nodes (24): lookupCustomerTool, lookupOrderTool, buildReconcileTools(), buildReportCandidateTool(), CANDIDATE_KEY_PREFIX, reportCandidateInput, clientTools, getContactDetailInput (+16 more)

### Community 103 - "tools-cash.ts"
Cohesion: 0.07
Nodes (36): cashMovements, cashSessions, addMovement(), CashSession, CashSnapshot, CloseResult, closeSession(), ensureOpenSession() (+28 more)

### Community 104 - "human-handoff.ts"
Cohesion: 0.10
Nodes (19): activateHumanOverride(), ClaimOutcome, DrizzleHandoffEffectRepository, HANDOFF_EFFECTS, HandoffClaimInput, handoffClaimKey(), HandoffClaimResult, HandoffEffectClaimant (+11 more)

### Community 105 - "agent-config-scope.ts"
Cohesion: 0.11
Nodes (22): channel, credentialsFromAgentConfig(), AgentConfigChannel, AgentConfigResolution, AgentConfigResolutionError, AgentConfigResolutionSource, AgentConfigRow, CHANNEL_LABELS (+14 more)

### Community 106 - "conversations"
Cohesion: 0.11
Nodes (19): conversations, leadIdentities, resolveScopeForConversation(), ChannelEventInsert, canonicalExternalUserId(), ConversationIdentityError, ConversationIdentityErrorCode, ConversationIdentityRecord (+11 more)

### Community 107 - "zernio.ts"
Cohesion: 0.16
Nodes (20): API_SENT_VIA, asString(), ATTACHMENT_TYPE_MAP, buildCreateBody(), classifyEvent(), commentSender(), createTemplateParams(), echoOrigin() (+12 more)

### Community 108 - "runner.ts"
Cohesion: 0.13
Nodes (23): chatMessages, neutralizeUntrustedSentinel(), buildReconcileSystemPrompt(), audit(), buildTranscriptEvidence(), buildUserMessage(), CandidatesReconcileSummary, claimRunLock() (+15 more)

### Community 109 - "whatsapp/index.ts"
Cohesion: 0.14
Nodes (19): setInboundTurnDispatcher(), BASE_SALES_PROMPT, buildSalesSystemPrompt(), CustomerPromptContext, formatPermittedSessionFacts(), SalesPromptInput, detectInjection(), INJECTION_PATTERNS (+11 more)

### Community 110 - "import.ts"
Cohesion: 0.10
Nodes (19): IntakeSuccess, NormalizedWhatsAppCustomerMessage, NormalizedWhatsAppOperatorMessage, PendingInbound, waChangeSchema, waChangeValueSchema, waDocumentSchema, waEntrySchema (+11 more)

### Community 111 - "inbound-pipeline.ts"
Cohesion: 0.16
Nodes (19): PersistedInbound, matchesAssistantBubble(), splitIntoBubbles(), BufferedMessage, scheduleBufferProcessing(), persistChannelEvent(), classifyError(), accountScopedInboundKey() (+11 more)

### Community 112 - "conversation-identity.ts"
Cohesion: 0.09
Nodes (25): ChannelEventContext, assertConversationAccount(), ConversationIdentityError, ConversationIdentityErrorCode, ConversationIdentityInsert, ConversationIdentityRecord, ConversationIdentityRepository, ConversationIdentityResult (+17 more)

### Community 113 - "ingress.ts"
Cohesion: 0.14
Nodes (19): releaseChannelDeliveryMarker(), canonicalExternalUserId(), asNonEmptyString(), eventConversationExternalUserId(), eventSelfAddresses(), handlePassiveChannelEvent(), isRecord(), logAckedWithoutPersistence() (+11 more)

### Community 114 - "messaging/registry.ts"
Cohesion: 0.13
Nodes (22): POST(), callerResolvedAccount(), ExplicitCredentials, placeholderAccount(), resolveAccount(), send(), sendTemplate(), kapsoProvider (+14 more)

### Community 115 - "config.ts"
Cohesion: 0.11
Nodes (23): AGENT_DOMAIN_TERMS, buildSystemPrompt(), DOMAIN_PROMPT, PROMPT_INJECTION_GUARD, AGENT_CONFIG_ID, AgentConfigRow, agentConfigRowSchema, AgentRuntimeResolution (+15 more)

### Community 116 - "draft.ts"
Cohesion: 0.09
Nodes (19): PublicOrderDomainError, DRAFT_LEAD_ROLES, draftLeadInput, draftLeadRole, draftLeadTool, draftOrderInput, draftOrderTool, draftQuoteInput (+11 more)

### Community 117 - "intake.ts"
Cohesion: 0.15
Nodes (21): AuditEntry, findMessage(), importOperatorOutbound(), insertMessage(), INTAKE_IDEMPOTENCY_SCOPE, INTAKE_IDEMPOTENCY_TTL_MS, IntakeFailure, intakeIdempotencyKey() (+13 more)

### Community 118 - "buffer.ts"
Cohesion: 0.13
Nodes (19): BUFFER_CONFIG, BufferChannelConfig, BufferManager, configFor(), DeadLetterEntry, DEFAULT_CONFIG, getLastProcessedContent(), getOrCreateEntry() (+11 more)

### Community 119 - "temporal-context.ts"
Cohesion: 0.18
Nodes (18): buildTemporalAgentMessages(), dedupeHistoryWithBuffered(), HistoryTurn, ARGENTINA_TIMEZONE, classifyTurnIntent(), dayKeyArgentina(), evaluateOrderRecency(), formatArgentinaTimestamp() (+10 more)

### Community 120 - "zernio-connect.ts"
Cohesion: 0.12
Nodes (25): registerZernioWebhookAction(), startConnectSchema, startZernioConnect(), ChannelsView(), connectZernio(), registerZernioHook(), submit(), toggleStatus() (+17 more)

### Community 121 - "secret-box.ts"
Cohesion: 0.20
Nodes (14): retryFailedDeliveries(), sendTelegramMessage(), decryptIfEncrypted(), decryptSecret(), encryptSecret(), getKey(), isEncrypted(), SECRET_CLEAR (+6 more)

### Community 122 - "telegram.ts"
Cohesion: 0.13
Nodes (21): TelegramStatusPage(), dynamic, POST(), runtime, updateMessageDelivery(), deriveWebhookPathToken(), idSchema, NormalizedTelegramInbound (+13 more)

### Community 123 - "client.ts"
Cohesion: 0.07
Nodes (36): Fail, KIND_LABEL, metadata, STATUS_LABEL, stageLabel, dynamic, dynamic, PromoForm() (+28 more)

### Community 124 - "bot.ts"
Cohesion: 0.19
Nodes (16): AuthorizedOperator, resolveOperatorIdentity(), CommandContext, handleOperatorCommand(), HELP_TEXT, wrapUntrustedContent(), denialMessage(), handleConfirmCommand() (+8 more)

### Community 125 - "storage.ts"
Cohesion: 0.08
Nodes (35): ALLOWED_DOMAINS, downloadMedia(), downloadYCloudMedia(), isAllowedDomain(), mediaUploadsDir(), mimeTypeToExt(), sanitizeFilename(), sanitizeScope() (+27 more)

### Community 126 - "channels/types.ts"
Cohesion: 0.11
Nodes (17): ChannelAccountStatus, channelAccountStatusSchema, channelAccountStatusValues, contentTypeSchema, contentTypeValues, DeliveryState, deliveryStateSchema, deliveryStateValues (+9 more)

### Community 127 - "tools-memory.ts"
Cohesion: 0.12
Nodes (15): CANDIDATE_STATUSES, forgetInput, forgetThisTool, getCandidatesInput, getReconcileCandidatesTool, idLike, memoryTools, recallInput (+7 more)

### Community 128 - "product-taxonomy.ts"
Cohesion: 0.15
Nodes (14): CatalogManager(), CatalogoPage(), NuevoProductoPage(), mergeProductTaxonomy(), PRODUCT_TAXONOMY, ProductTaxonomyCategory, ProductTaxonomyNode, ProductTaxonomySubcategory (+6 more)

### Community 129 - "adjuntos/page.tsx"
Cohesion: 0.14
Nodes (14): copyAttachmentToOrder(), listOpenOrgOrders(), CopyToOrderButton(), copy(), OpenOrder, BibliotecaOrgPage(), ArteManager(), AttachmentDTO (+6 more)

### Community 130 - "channels/errors.ts"
Cohesion: 0.27
Nodes (11): classifyError(), ErrorClass, errorCode(), ErrorLike, errorMessage(), isRetryableDbError(), readError(), RETRYABLE_CODES (+3 more)

### Community 131 - "tools-broadcast.ts"
Cohesion: 0.12
Nodes (16): messenger, maskTail(), audienceSchema, broadcastGated, broadcastInner, BroadcastInput, broadcastTools, broadcastWhatsAppTool (+8 more)

### Community 132 - "check-agent-tools.mts"
Cohesion: 0.15
Nodes (12): check(), CheckableTool, checkToolSet(), injectedRole, knownRole, leadProps, leadSpec, operatorOnly (+4 more)

### Community 133 - "tools-products.ts"
Cohesion: 0.15
Nodes (12): withAuditLog(), getProductDetailInput, getProductDetailTool, idLike, listTaxonomyInput, listTaxonomyTool, listTechniquesInput, listTechniquesTool (+4 more)

### Community 134 - "send.ts"
Cohesion: 0.22
Nodes (12): clean(), EnvRecord, isWhatsAppSendConfigured(), resolveWhatsAppSendConfig(), sendWhatsAppMessage(), sendWhatsAppMessageWithConfig(), SendWhatsAppResult, toYCloudContent() (+4 more)

### Community 135 - "3. Detalle por área"
Cohesion: 0.11
Nodes (17): 12 — Auditoría de paridad SocialCRM → AH Sports, 1. Resumen ejecutivo, 2. Tabla maestra de gaps, 3. Detalle por área, 4. Ítems NO-APLICA / verificados sin gap, 5. Top 10 — orden de implementación recomendado, 6. Notas de método y límites, A. Backend / capas de dominio (+9 more)

### Community 136 - "messaging/errors.ts"
Cohesion: 0.27
Nodes (10): ErrorClass, errorCode(), ErrorLike, errorMessage(), isRetryableDbError(), readError(), RETRYABLE_CODES, RETRYABLE_MESSAGES (+2 more)

### Community 137 - "migrate-descriptions-v0946.mjs"
Cohesion: 0.17
Nodes (10): CACHE, HERE, misses, NEW_GRAPH, newGraph, OLD_GRAPH, oldByKey, oldGraph (+2 more)

### Community 138 - "agent/reconcile/route.ts"
Cohesion: 0.26
Nodes (11): AuthorizationResult, authorize(), dynamic, expectedCronSecret(), GET(), handle(), POST(), presentedCronSecret() (+3 more)

### Community 139 - "telegram/reconcile/route.ts"
Cohesion: 0.27
Nodes (10): AuthorizationResult, authorize(), dynamic, expectedCronSecret(), GET(), handle(), POST(), presentedCronSecret() (+2 more)

### Community 140 - "checkRateLimit"
Cohesion: 0.27
Nodes (13): wizardRateLimited(), GET(), MIME_MAP, runtime, GET(), GET(), POST(), GET() (+5 more)

### Community 141 - "vision.ts"
Cohesion: 0.27
Nodes (10): analyzeImage(), buildVisionPrompt(), formatForAgent(), parseDocumentType(), processImage(), ProcessImagePersist, ProcessImageResult, raceVision() (+2 more)

### Community 142 - "APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)"
Cohesion: 0.20
Nodes (9): 1. Hardening fixes, 2. Migration bootstrap + journal reconciliation (documented, not executed), 3. Docs, 4. Graph sync (P7.2) — SKIPPED (script absent), 5. Files changed, 6. Gates, 7. Deferred / remaining risks for the merge, APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final) (+1 more)

### Community 143 - "Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)"
Cohesion: 0.22
Nodes (8): Comparación de variables de entorno, Comparación funcional (canales), Modelo de datos de mensajes, Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp), Qué falta para replicar el funcionamiento real de Muzapp, Qué se incorporó en App de gestión (P0–P7, ya mergeado), UI de conversaciones, Verdict

### Community 144 - "messaging/channel-events.ts"
Cohesion: 0.17
Nodes (13): idempotencyKeys, accountPartition(), ChannelEventInsert, channelEventKey(), ChannelEventPersistResult, ChannelEventRepository, claimChannelDelivery(), deliveryMarkerKey() (+5 more)

### Community 145 - "ApplicationsManager.tsx"
Cohesion: 0.23
Nodes (9): addApplication(), ApplicationsManager(), submit(), AppLine, AppRow, AppStatusBadge(), AppTechnique, VIEWS (+1 more)

### Community 146 - "tools/schema.ts"
Cohesion: 0.44
Nodes (8): AnySchema, JsonSchema, kindOf(), objectSchema(), toJsonSchema(), unwrap(), zodToParameters(), ToolParameterSchema

### Community 147 - "messaging/send-account.ts"
Cohesion: 0.31
Nodes (6): accountIdOf(), BoundAccountResolution, decideSendAccount(), DefaultAccountResolution, SendAccountDecision, SendAccountDeps

### Community 148 - "link-preview/route.ts"
Cohesion: 0.31
Nodes (8): RFC-1918, isPrivateIp(), extractMeta(), fetchPinned(), GET(), OgData, ResolvedTarget, resolveSafeTarget()

### Community 150 - "MessagesTimeline.tsx"
Cohesion: 0.38
Nodes (8): loadMessages(), MessagesTimeline(), CHANNEL_LABEL, CONTENT_LABEL, DELIVERY_LABEL, deliveryTone, DIRECTION_LABEL, SENDER_LABEL

### Community 151 - "consumption.ts"
Cohesion: 0.27
Nodes (9): FichaTecnicaPage(), POST(), BomConsumption, BomConsumptionInput, calculateBomConsumption(), ConsumptionMode, consumptionUnit(), label() (+1 more)

### Community 152 - "PlanillaTable.tsx"
Cohesion: 0.20
Nodes (6): Item, Line, PlanillaRow(), PlanillaTable(), STAGES, stageTone

### Community 153 - "order-context.ts"
Cohesion: 0.24
Nodes (9): orderContextItems, addOrderContextItem(), cleanExpiredItems(), clearOrderContext(), futureDate(), getOrderContextSummary(), markOrderContextOrdered(), OrderContextItem (+1 more)

### Community 154 - "orders/[id]/stage/route.ts"
Cohesion: 0.22
Nodes (7): POST(), POST(), PRODUCTIVE, STAGE_TO_EVENT, productionEvents, orderItemStageSchema, stageSchema

### Community 158 - "product-taxonomy/[id]/route.ts"
Cohesion: 0.22
Nodes (7): DELETE(), PATCH(), patchSchema, GET(), nodeSchema, POST(), productTaxonomyNodes

### Community 159 - "login/page.tsx"
Cohesion: 0.28
Nodes (4): LoginForm(), LoginPage(), navigation, PublicShell()

### Community 161 - "rate-limit.ts"
Cohesion: 0.22
Nodes (6): bucketMap, checkWindow(), keyMap, RateLimitOptions, RateLimitResult, WindowEntry

### Community 164 - "protocol.ts"
Cohesion: 0.43
Nodes (7): ECHO_EVENT_TYPES, ECHO_MESSAGE_KEYS, echoMessageHasContent(), extractEchoMessage(), isProtocolArtifact(), isRecord(), STATUS_MESSAGE_TYPES

### Community 165 - "orders/route.ts"
Cohesion: 0.40
Nodes (5): createOrder(), NewOrderForm(), submit(), POST(), generatePublicToken()

### Community 166 - "settings.ts"
Cohesion: 0.33
Nodes (5): updateSetting(), updateSettingSchema, WORKSHOP_SETTING_KEYS, submit(), settings

### Community 167 - "resolveGarmentLine"
Cohesion: 0.50
Nodes (5): candidateNames(), resolveGarmentLine(), resolveProductByName(), resolveSizeQuantities(), resolveTechniqueByName()

## Knowledge Gaps
- **1212 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `HERE`, `REPO_ROOT`, `graph` (+1207 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `client.ts` to `product-taxonomy.ts`, `Button.tsx`, `ChannelsView.tsx`, `isSchemaNotReady`, `adjuntos/page.tsx`, `attachments/route.ts`, `tools-broadcast.ts`, `requireUser`, `Card.tsx`, `tools-products.ts`, `tools-analytics.ts`, `orders.ts`, `login/route.ts`, `checkRateLimit`, `public-orders.ts`, `messaging/channel-events.ts`, `ApplicationsManager.tsx`, `pricing.ts`, `agent-config.ts`, `5/page.tsx`, `1/page.tsx`, `order-context.ts`, `orders/[id]/stage/route.ts`, `inbox/page.tsx`, `product-taxonomy/[id]/route.ts`, `tools-orders.ts`, `products/route.ts`, `session-store.ts`, `orders/route.ts`, `settings.ts`, `(admin)/layout.tsx`, `read.ts`, `auth.ts`, `insumos/[id]/page.tsx`, `channels/accounts.ts`, `sales-tools.ts`, `channels/channel-events.ts`, `confirmations.ts`, `sales-agent.ts`, `validators.ts`, `reconcile.ts`, `tools-clients.ts`, `tools-cash.ts`, `human-handoff.ts`, `agent-config-scope.ts`, `conversations`, `runner.ts`, `inbound-pipeline.ts`, `conversation-identity.ts`, `intake.ts`, `zernio-connect.ts`, `secret-box.ts`, `telegram.ts`, `bot.ts`, `tools-memory.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `requireUser()` connect `requireUser` to `db-transaction.ts`, `adjuntos/page.tsx`, `Button.tsx`, `product-taxonomy.ts`, `attachments/route.ts`, `ChannelsView.tsx`, `Card.tsx`, `tools-analytics.ts`, `orders.ts`, `checkRateLimit`, `ApplicationsManager.tsx`, `consumption.ts`, `orders/[id]/stage/route.ts`, `product-taxonomy/[id]/route.ts`, `products/route.ts`, `lib/payments.ts`, `orders/route.ts`, `settings.ts`, `(admin)/layout.tsx`, `auth.ts`, `validators.ts`, `client.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `RecetasEditor()` connect `RecetasEditor` to `ChannelsView.tsx`, `client.ts`, `consumption.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `HERE` to the rest of the system?**
  _1212 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `db-transaction.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1476923076923077 - nodes in this community are weakly interconnected._
- **Should `Button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04706264199935086 - nodes in this community are weakly interconnected._
- **Should `ChannelsView.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07199297629499561 - nodes in this community are weakly interconnected._