# Graph Report - fix-f1-messaging  (2026-10-23)

## Corpus Check
- 423 files · ~318,618 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3418 nodes · 7996 edges · 196 communities (177 shown, 19 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e4e9cfe3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lib/payments.ts
- Input.tsx
- whatsapp/webhook/[token]/route.ts
- requireAgentAdmin
- db
- db/schema.ts
- /graphify
- client.ts
- Card.tsx
- $graphify
- compilerOptions
- messaging/channel-events.ts
- orders.ts
- RecetasEditor.tsx
- session-policy.ts
- public-orders.ts
- pricing.ts
- dependencies
- devDependencies
- agent-config.ts
- 3/page.tsx
- 2. Todo lo que el usuario pidió en este chat (cronológico)
- Graph First — consult, maintain, and rebuild the knowledge graph
- router.ts
- 03 · API ROUTES — Inventario
- KNOWN ISSUES — Bugs en el código de F1 (BUILD BREAKERS)
- AGENTS — AH Sports OS
- 04 · BUSINESS RULES — Lenguaje del dominio y reglas operativas
- 08 · ROADMAP — Post-MVP
- HANDOFF — Para el próximo agente de código
- actions/inbox.ts
- 06 · STANDARDS BUILDING — Reglas de código
- 07 · DEPLOYMENT — Render + Neon
- tools-orders.ts
- ProductoForm.tsx
- session-store.ts
- [token]/page.tsx
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
- ai/registry.ts
- login/route.ts
- ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)
- ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre
- 00-README.md
- 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento
- reapply-descriptions.mjs
- fake-db.ts
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
- channels/types.ts
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
- bot.ts
- postcss.config.mjs
- 0001_public_upload_sessions.sql
- 0003_suppliers.sql
- "product_taxonomy_nodes"
- checkRateLimit
- reconcile.ts
- tools-clients.ts
- tools-cash.ts
- human-handoff.ts
- agent-config-scope.ts
- Channel
- zernio.ts
- runner.ts
- whatsapp/index.ts
- import.ts
- inbound-pipeline.ts
- conversation-identity.ts
- ingress.ts
- tools-broadcast.ts
- config.ts
- draft.ts
- intake.ts
- buffer.ts
- temporal-context.ts
- 3. Detalle por área
- secret-box.ts
- products
- Button
- inbound-pipeline.test.ts
- storage.ts
- leads/route.ts
- tools-memory.ts
- CatalogManager.tsx
- channels/channel-events.ts
- loop.ts
- BusinessSettingsForm.tsx
- check-agent-tools.mts
- consumption.ts
- send.ts
- signatures.ts
- inbound-queue.ts
- migrate-descriptions-v0946.mjs
- agent/reconcile/route.ts
- telegram/reconcile/route.ts
- downloader.ts
- vision.ts
- APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)
- Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)
- telegram.ts
- test-agent.ts
- tools/types.ts
- FakeDb
- resolveGarmentLine
- operator-send.ts
- zernio-connect.ts
- ref-code-sign.ts
- tailwind-merge
- cron/reconcile/route.ts
- inbound.ts
- pdf-parse.d.ts
- utm-capture.ts
- isSchemaNotReady
- "chat_messages"
- conversions.ts
- insumos/[id]/page.tsx
- messaging/errors.ts
- QueryBuilder
- link-preview/route.ts
- order-context.ts
- env.ts
- (public)/layout.tsx
- sales-tools.test.ts
- PlanillaTable.tsx
- orders
- LinkGeneratorForm.tsx
- 0022_cash_sessions.sql
- 0021_promotions.sql
- "conversations"
- "agent_config"
- ArteManager.tsx
- confirmations.test.ts
- (public)/catalogo/page.tsx
- Review R2 — Outbound: notificaciones, ventana 24h, handoff, cron
- attachments/route.ts
- anti-loop.test.ts
- 2. Variables de entorno y secretos (SOLO POR NOMBRE)
- NewOrderForm.tsx
- 10. Checklist de pruebas (mensajes reales)
- Review R1 — Messaging core seams (merged parity code)
- CopyToOrderButton.tsx
- FIX F1 — Messaging core (review R1 findings + R4#1, R4#2, R4-MED1)
- logout/route.ts
- PromoForm.tsx

## God Nodes (most connected - your core abstractions)
1. `db` - 152 edges
2. `requireUser()` - 131 edges
3. `Card()` - 57 edges
4. `PageHeader()` - 52 edges
5. `Button()` - 45 edges
6. `products` - 43 edges
7. `orders` - 43 edges
8. `requireAgentAdmin()` - 40 edges
9. `checkRateLimit()` - 38 edges
10. `Input()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `submit()` --indirect_call--> `provider()`  [INFERRED]
  src/app/(admin)/admin/agent/AgentConfigForm.tsx → src/lib/messaging/ingress.test.ts
- `connectZernio()` --calls--> `startZernioConnect()`  [EXTRACTED]
  src/app/(admin)/admin/canales/ChannelsView.tsx → src/app/actions/channel-connect.ts
- `PublicLayout()` --calls--> `getStringSetting()`  [EXTRACTED]
  src/app/(public)/layout.tsx → src/lib/settings.ts
- `confirm()` --calls--> `createPublicOrder()`  [EXTRACTED]
  src/app/(public)/presupuesto/5/Step5Form.tsx → src/app/actions/public-orders.ts
- `listOrgLibrary()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/actions/attachments.ts → src/lib/auth.ts

## Import Cycles
- 3-file cycle: `src/lib/messaging/accounts.ts -> src/lib/messaging/registry.ts -> src/lib/messaging/providers/ycloud.ts -> src/lib/messaging/accounts.ts`

## Communities (196 total, 19 thin omitted)

### Community 0 - "lib/payments.ts"
Cohesion: 0.11
Nodes (30): cancelPayment(), notifyStatusQuietly(), registerPayment(), CancelPaymentButton(), cancel(), RegisterPaymentForm(), submit(), DELETE() (+22 more)

### Community 1 - "Input.tsx"
Cohesion: 0.11
Nodes (20): createOrganizationWithContact(), OperatorUserOption, MATERIAL_CATEGORIES, MaterialInitial, UNITS, OrgForm(), submit(), Product (+12 more)

### Community 2 - "whatsapp/webhook/[token]/route.ts"
Cohesion: 0.10
Nodes (32): POST(), contactNameFor(), dynamic, EventType, GET(), mapMessageType(), mediaRefsFor(), metaDeliveryId() (+24 more)

### Community 3 - "requireAgentAdmin"
Cohesion: 0.08
Nodes (36): ChannelAccountRow, createChannelAccount(), createChannelAccountSchema, credentialsRefSchema, listChannelAccounts(), setChannelAccountStatus(), setChannelAccountStatusSchema, updateChannelAccount() (+28 more)

### Community 4 - "db"
Cohesion: 0.06
Nodes (35): addApplication(), Fail, listOpenOrgOrders(), listOrgLibrary(), KIND_LABEL, metadata, STATUS_LABEL, BibliotecaOrgPage() (+27 more)

### Community 5 - "db/schema.ts"
Cohesion: 0.03
Nodes (59): agentConfigRelations, AgentEnabledTools, agentInboundJobsRelations, agentKind, agentMemoryScope, AgentRawPayload, agentSessionEventsRelations, agentSessionStatesRelations (+51 more)

### Community 6 - "/graphify"
Cohesion: 0.06
Nodes (34): Configured Project Profiles, For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration (+26 more)

### Community 7 - "client.ts"
Cohesion: 0.04
Nodes (72): ContactosPage(), dynamic, EditarPromoPage(), dynamic, NuevaPromoPage(), DELETE(), GET(), PATCH() (+64 more)

### Community 8 - "Card.tsx"
Cohesion: 0.07
Nodes (63): AgentDlqPage(), ConversationTimelinePage(), ReplyComposer(), ConversationTable(), channelBadgeTone(), INBOX_CHANNEL_LABEL, TelegramStatusPage(), ConfiguracionPage() (+55 more)

### Community 9 - "$graphify"
Cohesion: 0.07
Nodes (28): Configured Project Profiles, For --cluster-only, For $graphify add, For $graphify explain, For $graphify path, For $graphify query, For --update, For --watch (+20 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+19 more)

### Community 11 - "messaging/channel-events.ts"
Cohesion: 0.21
Nodes (14): accountPartition(), ChannelEventInsert, channelEventKey(), ChannelEventPersistResult, ChannelEventRepository, claimChannelDelivery(), deliveryMarkerKey(), drizzleChannelEventRepository (+6 more)

### Community 12 - "orders.ts"
Cohesion: 0.13
Nodes (19): confirmQuote(), LINE_EDITABLE_STATUS, loadQuotableLines(), QuoteActionError, REQUOTE_BLOCKED_STATUS, reQuoteOrder(), CotizarPage(), ConfirmQuoteForm() (+11 more)

### Community 13 - "RecetasEditor.tsx"
Cohesion: 0.07
Nodes (23): ConsumptionMode, Item, ItemForm, Material, Recipe, Size, Technique, PATCH() (+15 more)

### Community 14 - "session-policy.ts"
Cohesion: 0.17
Nodes (15): applyCommercialFacts(), assertSessionContext(), AssetKind, CommercialFacts, CommercialIntent, createInitialSessionState(), nextState(), PendingQuestion (+7 more)

### Community 15 - "public-orders.ts"
Cohesion: 0.14
Nodes (22): beginPublicUploadSession(), createPublicOrder(), PublicOrderDomainError, PublicOrderFailure, uploadAttachmentFromPublic(), WIZARD_RATE_LIMITED, KINDS, Step4Form() (+14 more)

### Community 16 - "pricing.ts"
Cohesion: 0.15
Nodes (14): MaterialConsumptionSnapshot, PricingSnapshot, consumptionUnitCost(), MaterialSummary, quoteBundleLine(), QuoteLineInput, quoteOrder(), round2() (+6 more)

### Community 17 - "dependencies"
Cohesion: 0.10
Nodes (21): clsx, dotenv, lucide-react, @neondatabase/serverless, next, dependencies, clsx, dotenv (+13 more)

### Community 18 - "devDependencies"
Cohesion: 0.10
Nodes (21): drizzle-kit, eslint, eslint-config-next, devDependencies, drizzle-kit, eslint, eslint-config-next, tailwindcss (+13 more)

### Community 19 - "agent-config.ts"
Cohesion: 0.07
Nodes (43): bindAgentOperator(), BindAgentOperatorInput, bindOperatorSchema, copyAgentConfig(), copyAgentConfigSchema, insertConfigRow(), isUniqueViolation(), nullable() (+35 more)

### Community 20 - "3/page.tsx"
Cohesion: 0.19
Nodes (7): metadata, parseSizes(), PresupuestoStep3(), Step3Form(), metadata, StepIndicator(), STEPS

### Community 21 - "2. Todo lo que el usuario pidió en este chat (cronológico)"
Cohesion: 0.11
Nodes (17): 1. Dónde está parado el proyecto, 2. Todo lo que el usuario pidió en este chat (cronológico), 3. Plan F6 — tareas y estado, 4. Decisiones técnicas ya tomadas (no reabrir sin motivo), 5. Archivos ya modificados en el working tree (SIN commitear al redactar), 6. Archivos a crear/modificar para terminar F6 (guía para el próximo agente), 7. Notas y gotchas para el próximo agente, 8. Correcciones posteriores a la auditoría F6 (+9 more)

### Community 22 - "Graph First — consult, maintain, and rebuild the knowledge graph"
Cohesion: 0.11
Nodes (17): 1. Hard rule: graph first, code second, 2. Command reference, 3. 1:1 parity with the code (mandatory), 4. Full rebuild, 5. Semantic enrichment (this is what makes the graph queryable), 6. The graph IS versioned, 7. Agent integration, 8. Known graphify defects and version split (verified empirically) (+9 more)

### Community 23 - "router.ts"
Cohesion: 0.24
Nodes (14): AuthorizedOperator, CommandContext, handleOperatorCommand(), HELP_TEXT, resolveEnabledTools(), resolveAgentRuntime(), createChatProvider(), denialMessage() (+6 more)

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

### Community 30 - "actions/inbox.ts"
Cohesion: 0.06
Nodes (62): auditHandoffAction(), conversationExists(), conversationsInputSchema, isoDateTime, loadConversations(), loadMessages(), messagesInputSchema, resolveHandoff() (+54 more)

### Community 31 - "06 · STANDARDS BUILDING — Reglas de código"
Cohesion: 0.13
Nodes (14): 06 · STANDARDS BUILDING — Reglas de código, A. Naming, API route, B. Imports, C. Estructura de archivos, D. Componentes UI, E. Estilos, F. Base de datos (+6 more)

### Community 32 - "07 · DEPLOYMENT — Render + Neon"
Cohesion: 0.14
Nodes (14): 07 · DEPLOYMENT — Render + Neon, 10. CI/CD, 11. Post-MVP checklist, 1. Prerrequisitos, 2. Crear DB en Neon, 3. Crear Web Service en Render, 4. Primer deploy, 5. Seed inicial (una sola vez) (+6 more)

### Community 33 - "tools-orders.ts"
Cohesion: 0.04
Nodes (45): AnyOrderStatus, applyOrderStatus(), cancelOrderInner, cancelOrderInput, cancelOrderTool, cancelPaymentInner, cancelPaymentInput, cancelPaymentTool (+37 more)

### Community 34 - "ProductoForm.tsx"
Cohesion: 0.11
Nodes (19): Mold, MoldesManager(), formatDate(), ProductoDetallePage(), COMMON_ZONES, ComponentProduct, Mold, ProductInitial (+11 more)

### Community 35 - "session-store.ts"
Cohesion: 0.11
Nodes (20): agentSessionEvents, BoundarySignal, classifyBoundary(), ConversationSessionState, SessionEventType, SessionPolicyRepository, MemorySessionRepository, CasConflictError (+12 more)

### Community 36 - "[token]/page.tsx"
Cohesion: 0.14
Nodes (16): GET(), metadata, parseLineItems(), PresupuestoStep5(), Props, Step5Form(), confirm(), metadata (+8 more)

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
Cohesion: 0.14
Nodes (14): scripts, build, check:agent-tools, db:generate, db:migrate, db:push, db:seed, db:studio (+6 more)

### Community 44 - "read.ts"
Cohesion: 0.07
Nodes (28): findMissingInfoInput, findMissingInfoTool, getConversationInput, getConversationTool, idLike, lookupCustomerInput, lookupOrderInput, QUOTE_REQUIREMENTS (+20 more)

### Community 45 - "⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento"
Cohesion: 0.20
Nodes (9): A. Adjuntos (biblioteca y carga), B. Aplicaciones (archivo × ubicación × técnica), C. Presupuesto público (5 pasos), D. Seguimiento público, E. Listado global de arte, ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento, F. Validación end-to-end F4, G. Cierre F4 (+1 more)

### Community 46 - "graphify-sync.mjs"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, LEGACY_GRAPH, REAPPLY, REPO_ROOT

### Community 47 - "RecetasEditor"
Cohesion: 0.33
Nodes (6): RecetasEditor(), addItem(), editItem(), formFor(), setForm(), updateItem()

### Community 48 - "ai/registry.ts"
Cohesion: 0.12
Nodes (13): CHAT_COMPLETIONS_PROTOCOL, ChatCompletionsOptions, completionResponseSchema, createChatCompletionsProvider(), errorResponseSchema, ChatCompletion, ChatCompletionRequest, ChatMessage (+5 more)

### Community 49 - "login/route.ts"
Cohesion: 0.17
Nodes (13): POST(), createSession(), sign(), checkLoginThrottle(), createMemoryThrottle(), checkWindow(), evictExpired(), DUMMY_PASSWORD_HASH (+5 more)

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

### Community 55 - "fake-db.ts"
Cohesion: 0.24
Nodes (18): camelName(), collect(), collectParams(), ConflictUpdate, evaluate(), firstColumn(), isColumn(), isRecord() (+10 more)

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
Cohesion: 0.08
Nodes (42): accountStore, ChannelAccountResolution, ChannelAccountStore, createEnvAccountStore(), credentialsFromAgentConfigScope(), credentialsFromEnv(), credentialsFromProviderScope(), decryptColumn() (+34 more)

### Community 65 - "channels/accounts.ts"
Cohesion: 0.12
Nodes (29): ChannelAccountResolution, ChannelAccountResolutionError, ChannelAccountRow, classifyRowsError(), credentialsFromAgentConfig(), credentialsFromEnv(), credentialsFromProviderEnvScope(), decryptColumn() (+21 more)

### Community 66 - "sales-tools.ts"
Cohesion: 0.03
Nodes (56): addCartItemInput, addCartItemTool, AR_DAYS, BusinessHourDay, businessHoursInput, cancelDraftInput, cancelDraftTool, checkAvailabilityInput (+48 more)

### Community 67 - "channels/types.ts"
Cohesion: 0.10
Nodes (21): CHANNEL_KINDS, CHANNEL_PROVIDER, PROVIDER_IDS, ChannelAccountStatus, channelAccountStatusSchema, channelAccountStatusValues, channelValues, contentTypeSchema (+13 more)

### Community 68 - "F6 — Proveedores, BOM por talle y costos trazables"
Cohesion: 0.33
Nodes (5): Estado, F6 — Proveedores, BOM por talle y costos trazables, Migraciones aplicadas en Neon, Riesgos y límites conocidos, Verificación

### Community 69 - "ycloud.ts"
Cohesion: 0.11
Nodes (34): isSymbolicAccountId(), asString(), baseEvent(), classifySignatureFailure(), ECHO_EVENT_TYPES, ECHO_MESSAGE_KEYS, ENVELOPE_KEYS, EVENT_ENVELOPE_KEYS (+26 more)

### Community 70 - "RELEASE NOTES — AH Sports OS (MVP v1.0)"
Cohesion: 0.33
Nodes (5): Cómo retomar el desarrollo, Diferido para F6+, Qué incluye, RELEASE NOTES — AH Sports OS (MVP v1.0), Seguridad de accesos (importante)

### Community 71 - "0000_core_schema.sql"
Cohesion: 0.06
Nodes (55): "agent_config", "agent_memories", "agent_session_events", "agent_session_states", "applications", "attachments", "audit_events", "bom_items" (+47 more)

### Community 72 - "PricingRulesManager"
Cohesion: 0.40
Nodes (3): PricingRulesManager(), cancelForm(), submit()

### Community 73 - "describe-new-nodes.mjs"
Cohesion: 0.21
Nodes (14): answers, describe(), detectKind(), docAbove(), fileCache, firstSentence(), graph, headerDoc() (+6 more)

### Community 74 - "confirmations.ts"
Cohesion: 0.10
Nodes (26): AuditPayload, AgentToolContext, auditOperatorAction(), auditSafeArgs(), extractEntityRef(), OperatorAuditInput, SAFE_ARG_KEYS, cancelPendingInput (+18 more)

### Community 75 - "TecnicasManager"
Cohesion: 0.50
Nodes (3): TecnicasManager(), cancelEdit(), submit()

### Community 76 - "(public)/page.tsx"
Cohesion: 0.40
Nodes (3): services, sizes, steps

### Community 77 - "sales-agent.ts"
Cohesion: 0.15
Nodes (23): analyzeConversationState(), classifyMessageType(), ConversationMetadata, MessageType, isHumanOverrideActive(), deliverAgentReply(), dispatchSalesTurn(), FIXED_ACK_REPLY (+15 more)

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
Cohesion: 0.18
Nodes (21): asString(), buildGraphBody(), classifyKind(), contactSender(), deliveryIdFor(), extractMediaRefs(), extractText(), isRecord() (+13 more)

### Community 85 - "10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas"
Cohesion: 0.08
Nodes (26): 0. Estado real: implementado vs. validado en vivo (leer primero), 10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas, 11. Troubleshooting, 12. Rollback, 13. Datos y privacidad, 1. Prerrequisitos, 3.1 `/admin/agent` — Configuración del agente, 3.2 `/admin/agent/telegram` — Estado del canal Telegram (+18 more)

### Community 88 - "bot.ts"
Cohesion: 0.21
Nodes (14): resolveOperatorIdentity(), wrapUntrustedContent(), AgentConfigResolutionError, defaultDeliveryState(), denialMessage(), handleConfirmCommand(), handleTelegramOperatorUpdate(), loadHistory() (+6 more)

### Community 95 - "checkRateLimit"
Cohesion: 0.14
Nodes (22): wizardRateLimited(), GET(), GET(), MIME_MAP, runtime, GET(), GET(), POST() (+14 more)

### Community 101 - "reconcile.ts"
Cohesion: 0.13
Nodes (24): AuditInput, AuditRecorder, AuditWriter, createAuditRecorder(), deleteExpiredMemories(), NO_REPLY_IDEMPOTENCY_SCOPE, purgeExpiredIdempotencyKeys(), reconcileInboundWithoutReply() (+16 more)

### Community 102 - "tools-clients.ts"
Cohesion: 0.06
Nodes (36): lookupCustomerTool, lookupOrderTool, buildReconcileTools(), buildReportCandidateTool(), CANDIDATE_KEY_PREFIX, reportCandidateInput, withAuditLog(), clientTools (+28 more)

### Community 103 - "tools-cash.ts"
Cohesion: 0.05
Nodes (49): cashMovements, cashSessions, addMovement(), CashSession, CashSnapshot, CloseResult, closeSession(), ensureOpenSession() (+41 more)

### Community 104 - "human-handoff.ts"
Cohesion: 0.11
Nodes (18): providerForChannel(), ClaimOutcome, DrizzleHandoffEffectRepository, HANDOFF_EFFECTS, HandoffClaimInput, handoffClaimKey(), HandoffClaimResult, HandoffEffectClaimant (+10 more)

### Community 105 - "agent-config-scope.ts"
Cohesion: 0.14
Nodes (18): channel, AgentConfigChannel, AgentConfigResolution, AgentConfigResolutionSource, CHANNEL_LABELS, configCacheKey(), fetchConfigById(), fetchLegacyGlobalAgentConfig() (+10 more)

### Community 106 - "Channel"
Cohesion: 0.12
Nodes (17): leadIdentities, ChannelTestReport, ChannelEventInsert, canonicalExternalUserId(), ConversationIdentityError, ConversationIdentityErrorCode, ConversationIdentityRecord, PHONE_CHANNELS (+9 more)

### Community 107 - "zernio.ts"
Cohesion: 0.15
Nodes (21): API_SENT_VIA, asString(), ATTACHMENT_TYPE_MAP, buildCreateBody(), classifyEvent(), commentSender(), createTemplateParams(), echoOrigin() (+13 more)

### Community 108 - "runner.ts"
Cohesion: 0.13
Nodes (23): conversations, neutralizeUntrustedSentinel(), buildReconcileSystemPrompt(), audit(), buildTranscriptEvidence(), buildUserMessage(), CandidatesReconcileSummary, claimRunLock() (+15 more)

### Community 109 - "whatsapp/index.ts"
Cohesion: 0.12
Nodes (21): buildTemporalAgentMessages(), dedupeHistoryWithBuffered(), HistoryTurn, BASE_SALES_PROMPT, buildSalesSystemPrompt(), CustomerPromptContext, formatPermittedSessionFacts(), SalesPromptInput (+13 more)

### Community 110 - "import.ts"
Cohesion: 0.09
Nodes (24): IntakeSuccess, MessageContentType, contentFor(), contentTypeFor(), NormalizedWhatsAppCustomerMessage, NormalizedWhatsAppOperatorMessage, normalizeWhatsAppInbound(), normalizeWhatsAppWebhook() (+16 more)

### Community 111 - "inbound-pipeline.ts"
Cohesion: 0.09
Nodes (33): register(), resolveScopeForConversation(), PersistedInbound, attachmentKindFor(), persistInboundMediaAttachments(), channelAccountRowId(), autoReplyClaimKey(), shouldSendAutoReply() (+25 more)

### Community 112 - "conversation-identity.ts"
Cohesion: 0.09
Nodes (24): ChannelEventContext, assertConversationAccount(), ConversationIdentityError, ConversationIdentityErrorCode, ConversationIdentityInsert, ConversationIdentityRecord, ConversationIdentityRepository, ConversationIdentityResult (+16 more)

### Community 113 - "ingress.ts"
Cohesion: 0.15
Nodes (18): canonicalExternalUserId(), isMessageDuplicate(), asNonEmptyString(), eventConversationExternalUserId(), eventSelfAddresses(), handlePassiveChannelEvent(), isRecord(), logAckedWithoutPersistence() (+10 more)

### Community 114 - "tools-broadcast.ts"
Cohesion: 0.09
Nodes (28): callerResolvedAccount(), ExplicitCredentials, messenger, placeholderAccount(), resolveAccount(), send(), sendTemplate(), getProvider() (+20 more)

### Community 115 - "config.ts"
Cohesion: 0.15
Nodes (16): AGENT_DOMAIN_TERMS, buildSystemPrompt(), DOMAIN_PROMPT, PROMPT_INJECTION_GUARD, AgentConfigRow, agentConfigRowSchema, AgentRuntimeResolution, clean() (+8 more)

### Community 116 - "draft.ts"
Cohesion: 0.10
Nodes (17): DRAFT_LEAD_ROLES, draftLeadInput, draftLeadRole, draftLeadTool, draftOrderInput, draftOrderTool, draftQuoteInput, draftQuoteTool (+9 more)

### Community 117 - "intake.ts"
Cohesion: 0.13
Nodes (21): chatMessages, AuditEntry, findMessage(), importOperatorOutbound(), insertMessage(), INTAKE_IDEMPOTENCY_SCOPE, INTAKE_IDEMPOTENCY_TTL_MS, IntakeFailure (+13 more)

### Community 118 - "buffer.ts"
Cohesion: 0.13
Nodes (20): BUFFER_CONFIG, BufferChannelConfig, BufferManager, configFor(), DeadLetterEntry, DEFAULT_CONFIG, getLastProcessedContent(), getOrCreateEntry() (+12 more)

### Community 119 - "temporal-context.ts"
Cohesion: 0.16
Nodes (18): loadConversationHistory(), loadCustomerPromptContext(), ARGENTINA_TIMEZONE, classifyTurnIntent(), dayKeyArgentina(), evaluateOrderRecency(), formatArgentinaTimestamp(), getArgentinaHour() (+10 more)

### Community 120 - "3. Detalle por área"
Cohesion: 0.11
Nodes (17): 12 — Auditoría de paridad SocialCRM → AH Sports, 1. Resumen ejecutivo, 2. Tabla maestra de gaps, 3. Detalle por área, 4. Ítems NO-APLICA / verificados sin gap, 5. Top 10 — orden de implementación recomendado, 6. Notas de método y límites, A. Backend / capas de dominio (+9 more)

### Community 121 - "secret-box.ts"
Cohesion: 0.19
Nodes (14): retryFailedDeliveries(), sendTelegramMessage(), decryptSecret(), encryptSecret(), getKey(), isEncrypted(), resolveSecretUpdate(), SECRET_CLEAR (+6 more)

### Community 122 - "products"
Cohesion: 0.12
Nodes (27): CatalogoPage(), NuevoProductoPage(), PATCH(), POST(), garmentMolds, productBundleItems, productBundles, products (+19 more)

### Community 123 - "Button"
Cohesion: 0.14
Nodes (9): KINDS, METHODS, ItemEditor(), Size, Step1Form(), Row, Button(), Input() (+1 more)

### Community 124 - "inbound-pipeline.test.ts"
Cohesion: 0.08
Nodes (22): ChannelAccountRow, account, { accountScopedInboundKey }, { BufferManager, scheduleBufferProcessing }, ctx, fake, findById(), {
  handleNormalizedEvent,
  isMessageDuplicate,
  setInboundTurnDispatcher,
} (+14 more)

### Community 125 - "storage.ts"
Cohesion: 0.12
Nodes (12): ALLOWED_MIMES, AllowedMime, ATTACHMENT_MIMES, FileLike, localStorageAdapter, MAX_5MB, MAX_FILE_BYTES, MAX_MEDIA_BYTES (+4 more)

### Community 126 - "leads/route.ts"
Cohesion: 0.28
Nodes (11): isUniqueViolation(), CreateLeadSchema, POST(), leads, extractRefCode(), resolveAttributionFromRef(), looksLikePhone(), normalizePhone() (+3 more)

### Community 127 - "tools-memory.ts"
Cohesion: 0.12
Nodes (15): CANDIDATE_STATUSES, forgetInput, forgetThisTool, getCandidatesInput, getReconcileCandidatesTool, idLike, memoryTools, recallInput (+7 more)

### Community 128 - "CatalogManager.tsx"
Cohesion: 0.29
Nodes (3): CatalogManager(), labels, Node

### Community 129 - "channels/channel-events.ts"
Cohesion: 0.18
Nodes (13): channelEvents, ChannelEventContext, ChannelEventEnvelope, channelEventKey(), ChannelEventPersistResult, ChannelEventRepository, DrizzleChannelEventRepository, eventTimestamp() (+5 more)

### Community 130 - "loop.ts"
Cohesion: 0.19
Nodes (11): detectInjectionAttempt(), InjectionSignal, SIGNATURES, AgentLoopInput, AgentLoopResult, AgentToolCallTrace, parseToolArguments(), runAgentLoop() (+3 more)

### Community 131 - "BusinessSettingsForm.tsx"
Cohesion: 0.12
Nodes (19): BUSINESS_SETTING_KEYS, updateSetting(), updateSettingSchema, WORKSHOP_SETTING_KEYS, BusinessSettingsForm(), submit(), DEFAULT_SLOT, FIELDS (+11 more)

### Community 132 - "check-agent-tools.mts"
Cohesion: 0.15
Nodes (12): check(), CheckableTool, checkToolSet(), injectedRole, knownRole, leadProps, leadSpec, operatorOnly (+4 more)

### Community 133 - "consumption.ts"
Cohesion: 0.27
Nodes (9): FichaTecnicaPage(), POST(), BomConsumption, BomConsumptionInput, calculateBomConsumption(), ConsumptionMode, consumptionUnit(), label() (+1 more)

### Community 134 - "send.ts"
Cohesion: 0.22
Nodes (12): clean(), EnvRecord, isWhatsAppSendConfigured(), resolveWhatsAppSendConfig(), sendWhatsAppMessage(), sendWhatsAppMessageWithConfig(), SendWhatsAppResult, toYCloudContent() (+4 more)

### Community 135 - "signatures.ts"
Cohesion: 0.31
Nodes (10): hasBytes(), isMarkup(), isTextLike(), MediaSniff, mimeKind(), OLE_SIGNATURE, PNG_SIGNATURE, sniffMatchesMime() (+2 more)

### Community 136 - "inbound-queue.ts"
Cohesion: 0.08
Nodes (36): retryDlqJob(), retryDlqJobSchema, DlqRetryButton(), retry(), dynamic, GET(), querySchema, runtime (+28 more)

### Community 137 - "migrate-descriptions-v0946.mjs"
Cohesion: 0.17
Nodes (10): CACHE, HERE, misses, NEW_GRAPH, newGraph, OLD_GRAPH, oldByKey, oldGraph (+2 more)

### Community 138 - "agent/reconcile/route.ts"
Cohesion: 0.27
Nodes (10): AuthorizationResult, authorize(), dynamic, expectedCronSecret(), GET(), handle(), POST(), presentedCronSecret() (+2 more)

### Community 139 - "telegram/reconcile/route.ts"
Cohesion: 0.27
Nodes (10): AuthorizationResult, authorize(), dynamic, expectedCronSecret(), GET(), handle(), POST(), presentedCronSecret() (+2 more)

### Community 140 - "downloader.ts"
Cohesion: 0.35
Nodes (10): ALLOWED_DOMAINS, downloadMedia(), downloadYCloudMedia(), isAllowedDomain(), mediaUploadsDir(), mimeTypeToExt(), sanitizeFilename(), sanitizeScope() (+2 more)

### Community 141 - "vision.ts"
Cohesion: 0.27
Nodes (10): analyzeImage(), buildVisionPrompt(), formatForAgent(), parseDocumentType(), processImage(), ProcessImagePersist, ProcessImageResult, raceVision() (+2 more)

### Community 142 - "APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)"
Cohesion: 0.20
Nodes (9): 1. Hardening fixes, 2. Migration bootstrap + journal reconciliation (documented, not executed), 3. Docs, 4. Graph sync (P7.2) — SKIPPED (script absent), 5. Files changed, 6. Gates, 7. Deferred / remaining risks for the merge, APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final) (+1 more)

### Community 143 - "Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)"
Cohesion: 0.22
Nodes (8): Comparación de variables de entorno, Comparación funcional (canales), Modelo de datos de mensajes, Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp), Qué falta para replicar el funcionamiento real de Muzapp, Qué se incorporó en App de gestión (P0–P7, ya mergeado), UI de conversaciones, Verdict

### Community 144 - "telegram.ts"
Cohesion: 0.13
Nodes (20): dynamic, POST(), runtime, agentConfig, updateMessageDelivery(), deriveWebhookPathToken(), idSchema, NormalizedTelegramInbound (+12 more)

### Community 145 - "test-agent.ts"
Cohesion: 0.26
Nodes (11): GET(), POST(), authorizeAgentApi(), AgentTestReport, classifyStatus(), pingHttp(), pingProvider(), ProviderPing (+3 more)

### Community 146 - "tools/types.ts"
Cohesion: 0.12
Nodes (22): draftTools, readTools, buildToolSpecs(), REGISTRY_SOURCES, AnySchema, JsonSchema, kindOf(), objectSchema() (+14 more)

### Community 148 - "resolveGarmentLine"
Cohesion: 0.50
Nodes (5): candidateNames(), resolveGarmentLine(), resolveProductByName(), resolveSizeQuantities(), resolveTechniqueByName()

### Community 149 - "operator-send.ts"
Cohesion: 0.12
Nodes (28): POST(), resolveAgentConfig(), ConversationRow, deliver(), deliverViaMessenger(), deliverViaTelegram(), loadProviderThreadId(), OperatorSendResult (+20 more)

### Community 150 - "zernio-connect.ts"
Cohesion: 0.20
Nodes (15): startConnectSchema, startZernioConnect(), backToCanales(), GET(), connectStateCookieName(), fetchZernioAccount(), getZernioConnectUrl(), isZernioConnectPlatform() (+7 more)

### Community 151 - "ref-code-sign.ts"
Cohesion: 0.27
Nodes (9): BodySchema, POST(), decodeRefCode(), RefCodeData, RefAttribution, sign(), signRefCode(), verifyRefCodeSignature() (+1 more)

### Community 154 - "cron/reconcile/route.ts"
Cohesion: 0.24
Nodes (11): dynamic, MODE_DEFAULTS, POST(), ReconcileMode, resolveLimit(), runtime, authorizeCronRequest(), bearerToken() (+3 more)

### Community 155 - "inbound.ts"
Cohesion: 0.15
Nodes (18): ResolvedAgentRuntime, extractDocumentText(), analyzeMedia(), effectiveMediaAccount(), hostMatches(), InboundMediaItem, mediaApiKey(), mediaAuthHeaders() (+10 more)

### Community 157 - "utm-capture.ts"
Cohesion: 0.23
Nodes (9): UtmCaptureScript(), COOKIE_EXPIRY_DAYS, COOKIE_NAME, captureUTMFromURL(), getCookie(), getStoredUTM(), setCookie(), UTM_KEYS (+1 more)

### Community 159 - "isSchemaNotReady"
Cohesion: 0.17
Nodes (18): channelAccounts, classifyError(), ErrorClass, errorCode(), ErrorLike, errorMessage(), isRetryableDbError(), isSchemaNotReady() (+10 more)

### Community 161 - "conversions.ts"
Cohesion: 0.19
Nodes (15): LinkGeneratorPage(), metadata, hashEmail(), hashName(), hashPhone(), MetaConversionCustomData, MetaConversionEventName, MetaConversionInput (+7 more)

### Community 165 - "insumos/[id]/page.tsx"
Cohesion: 0.14
Nodes (5): DesactivarButton(), InsumoForm(), EstadoButton(), ProveedorForm(), suppliers

### Community 166 - "messaging/errors.ts"
Cohesion: 0.25
Nodes (13): classifyRowsError(), classifyError(), ErrorClass, errorCode(), ErrorLike, errorMessage(), isRetryableDbError(), isSchemaNotReady() (+5 more)

### Community 168 - "link-preview/route.ts"
Cohesion: 0.31
Nodes (8): RFC-1918, isPrivateIp(), extractMeta(), fetchPinned(), GET(), OgData, ResolvedTarget, resolveSafeTarget()

### Community 169 - "order-context.ts"
Cohesion: 0.24
Nodes (9): orderContextItems, addOrderContextItem(), cleanExpiredItems(), clearOrderContext(), futureDate(), getOrderContextSummary(), markOrderContextOrdered(), OrderContextItem (+1 more)

### Community 170 - "env.ts"
Cohesion: 0.32
Nodes (5): assertServerEnv(), isProduction(), loadServerEnv(), ServerEnv, serverEnvSchema

### Community 171 - "(public)/layout.tsx"
Cohesion: 0.21
Nodes (7): LoginForm(), LoginPage(), PublicLayout(), navigation, PublicShell(), MetaPixel(), Window

### Community 172 - "sales-tools.test.ts"
Cohesion: 0.18
Nodes (9): idempotencyKeys, installFakeDb(), installModuleIntercepts(), QuoteResult, context, {
  draftOrderWhatsAppTool,
  quoteGarmentTool,
  recordPaymentIntentTool,
  resolveWhatsAppSalesTools,
  transferToHumanTool,
  WHATSAPP_SALES_TOOLS,
}, fake, { HandoffEffectService, DrizzleHandoffEffectRepository } (+1 more)

### Community 173 - "PlanillaTable.tsx"
Cohesion: 0.20
Nodes (6): Item, Line, PlanillaRow(), PlanillaTable(), STAGES, stageTone

### Community 174 - "orders"
Cohesion: 0.09
Nodes (28): createOrderLine(), CajaDetallePage(), KIND_LABEL, metadata, CajaPage(), metadata, DashboardPage(), KIND_LABEL (+20 more)

### Community 175 - "LinkGeneratorForm.tsx"
Cohesion: 0.38
Nodes (4): LinkGeneratorForm(), handleSubmit(), validatePhone(), buildWhatsAppLink()

### Community 182 - "ArteManager.tsx"
Cohesion: 0.28
Nodes (6): ArteManager(), AttachmentDTO, formatSize(), isImage(), STATUS_LABEL, STATUS_TONE

### Community 183 - "confirmations.test.ts"
Cohesion: 0.22
Nodes (5): auditEvents, context, {
  executePendingAction,
  requestOperatorConfirmation,
  withOperatorConfirmation,
  confirmActionTool,
  cancelPendingActionTool,
  listPendingActionsTool,
  PENDING_CONFIRMATION_TTL_MS,
}, fake, notifications

### Community 184 - "(public)/catalogo/page.tsx"
Cohesion: 0.32
Nodes (7): CatalogoPage(), dynamic, metadata, SUBCATEGORY_ORDER, SeguimientoPage(), checkPublicGetRateLimit(), labelProductTaxonomy()

### Community 185 - "Review R2 — Outbound: notificaciones, ventana 24h, handoff, cron"
Cohesion: 0.29
Nodes (6): 1. Hallazgos, 2. Cadenas de evidencia (los tres altos), 3. Verificado OK, 4. Límites de esta revisión, 5. Estado para Engram (`parity/review-r2`), Review R2 — Outbound: notificaciones, ventana 24h, handoff, cron

### Community 186 - "attachments/route.ts"
Cohesion: 0.16
Nodes (14): formStr(), uploadAttachment(), submitUpload(), GET(), POST(), DELETE(), IMAGE_MIMES, POST() (+6 more)

### Community 187 - "anti-loop.test.ts"
Cohesion: 0.29
Nodes (5): agentSessionStates, { analyzeConversationState, classifyMessageType }, fake, seedSession(), seedCatalog()

### Community 188 - "2. Variables de entorno y secretos (SOLO POR NOMBRE)"
Cohesion: 0.33
Nodes (6): 2.1 Base (obligatorias), 2.2 Channel runtime del agente (runtime IA — provider-neutral), 2.3 WhatsApp (webhook de entrada — config-gated), 2.4 WhatsApp (envío de salida — YCloud, config-gated), 2.5 Cron de reconciliación, 2. Variables de entorno y secretos (SOLO POR NOMBRE)

### Community 189 - "NewOrderForm.tsx"
Cohesion: 0.40
Nodes (5): createOrder(), Contact, NewOrderForm(), submit(), Org

### Community 190 - "10. Checklist de pruebas (mensajes reales)"
Cohesion: 0.40
Nodes (5): 10.1 Pre-vuelo (sin proveedor), 10.2 Telegram (canal interno), 10.3 WhatsApp (canal de ventas), 10.4 Reconciliación, 10. Checklist de pruebas (mensajes reales)

### Community 191 - "Review R1 — Messaging core seams (merged parity code)"
Cohesion: 0.40
Nodes (4): Findings, Notes, Review R1 — Messaging core seams (merged parity code), Verified OK

### Community 192 - "CopyToOrderButton.tsx"
Cohesion: 0.50
Nodes (4): copyAttachmentToOrder(), CopyToOrderButton(), copy(), OpenOrder

### Community 193 - "FIX F1 — Messaging core (review R1 findings + R4#1, R4#2, R4-MED1)"
Cohesion: 0.50
Nodes (3): FIX F1 — Messaging core (review R1 findings + R4#1, R4#2, R4-MED1), Fix list (in priority order), Rules

### Community 195 - "PromoForm.tsx"
Cohesion: 0.29
Nodes (4): ItemRow, ProductOption, PromoForm(), PromoInitial

## Knowledge Gaps
- **1309 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `HERE`, `REPO_ROOT`, `graph` (+1304 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `db` to `channels/channel-events.ts`, `requireAgentAdmin`, `BusinessSettingsForm.tsx`, `client.ts`, `Card.tsx`, `inbound-queue.ts`, `messaging/channel-events.ts`, `orders.ts`, `RecetasEditor.tsx`, `public-orders.ts`, `telegram.ts`, `pricing.ts`, `agent-config.ts`, `3/page.tsx`, `operator-send.ts`, `zernio-connect.ts`, `inbound.ts`, `actions/inbox.ts`, `isSchemaNotReady`, `conversions.ts`, `tools-orders.ts`, `session-store.ts`, `[token]/page.tsx`, `insumos/[id]/page.tsx`, `(admin)/layout.tsx`, `order-context.ts`, `read.ts`, `orders`, `login/route.ts`, `(public)/catalogo/page.tsx`, `attachments/route.ts`, `messaging/accounts.ts`, `channels/accounts.ts`, `sales-tools.ts`, `confirmations.ts`, `sales-agent.ts`, `bot.ts`, `checkRateLimit`, `reconcile.ts`, `tools-clients.ts`, `tools-cash.ts`, `human-handoff.ts`, `agent-config-scope.ts`, `Channel`, `runner.ts`, `inbound-pipeline.ts`, `conversation-identity.ts`, `tools-broadcast.ts`, `intake.ts`, `temporal-context.ts`, `secret-box.ts`, `products`, `leads/route.ts`, `tools-memory.ts`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `QueryBuilder` connect `QueryBuilder` to `FakeDb`, `fake-db.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `requireUser()` connect `client.ts` to `CopyToOrderButton.tsx`, `Input.tsx`, `lib/payments.ts`, `BusinessSettingsForm.tsx`, `db`, `consumption.ts`, `products`, `(admin)/layout.tsx`, `Card.tsx`, `requireAgentAdmin`, `orders.ts`, `RecetasEditor.tsx`, `orders`, `operator-send.ts`, `attachments/route.ts`, `NewOrderForm.tsx`, `checkRateLimit`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `HERE` to the rest of the system?**
  _1309 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lib/payments.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1092436974789916 - nodes in this community are weakly interconnected._
- **Should `Input.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11396011396011396 - nodes in this community are weakly interconnected._
- **Should `whatsapp/webhook/[token]/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09871794871794871 - nodes in this community are weakly interconnected._