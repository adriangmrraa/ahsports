# Graph Report - parity-w7-config  (2026-10-23)

## Corpus Check
- 358 files · ~270,538 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2946 nodes · 6728 edges · 162 communities (145 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b74fbe6f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lib/payments.ts
- Button.tsx
- attachments.ts
- ChannelsView.tsx
- validateFile
- db/schema.ts
- /graphify
- requireUser
- client.ts
- $graphify
- compilerOptions
- checkRateLimit
- orders.ts
- [id]/pagos/page.tsx
- session-policy.ts
- public-orders.ts
- pricing.ts
- dependencies
- devDependencies
- agent-config.ts
- 3/page.tsx
- 2. Todo lo que el usuario pidió en este chat (cronológico)
- Graph First — consult, maintain, and rebuild the knowledge graph
- intake.ts
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
- productos/[id]/page.tsx
- session-store.ts
- toCents
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
- BusinessSettingsForm.tsx
- provider.ts
- login/route.ts
- ✅ AH Sports OS — BUILD_PROGRESS (Checklist de Construcción)
- ⏳ F5 — Caja + Pagos + Configuración + Render deploy + Cierre
- 00-README.md
- 05 · GAP ANALYSIS — Lo que falta vs el alcance del relevamiento
- reapply-descriptions.mjs
- 3. Detalle por área
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
- agents/system-prompt.ts
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
- Channel
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
- ChannelKind
- buffer.ts
- temporal-context.ts
- zernio-connect.ts
- telegram.ts
- messaging/channel-events.ts
- test-agent.ts
- bot.ts
- storage.ts
- loop.ts
- tools-memory.ts
- CatalogManager
- logout/route.ts
- channels/errors.ts
- tools-broadcast.ts
- check-agent-tools.mts
- PlanillaTable.tsx
- send.ts
- signatures.ts
- messaging/errors.ts
- migrate-descriptions-v0946.mjs
- agent/reconcile/route.ts
- telegram/reconcile/route.ts
- downloader.ts
- vision.ts
- APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)
- Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)
- @neondatabase/serverless
- session-metadata.ts
- tools/schema.ts
- messaging/send-account.ts
- protocol.ts
- KanbanBoard.tsx
- Step5Form.tsx
- 2. Variables de entorno y secretos (SOLO POR NOMBRE)
- ItemStageAdvance.tsx
- 10. Checklist de pruebas (mensajes reales)
- pdf-parse.d.ts
- "agent_config"
- "chat_messages"
- "conversations"

## God Nodes (most connected - your core abstractions)
1. `db` - 132 edges
2. `requireUser()` - 117 edges
3. `Card()` - 49 edges
4. `PageHeader()` - 44 edges
5. `Button()` - 40 edges
6. `orders` - 40 edges
7. `products` - 37 edges
8. `formatCurrency()` - 37 edges
9. `Input()` - 33 edges
10. `Badge()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `connectZernio()` --calls--> `startZernioConnect()`  [EXTRACTED]
  src/app/(admin)/admin/canales/ChannelsView.tsx → src/app/actions/channel-connect.ts
- `onFile()` --calls--> `uploadAttachmentFromPublic()`  [EXTRACTED]
  src/app/(public)/presupuesto/4/Step4Form.tsx → src/app/actions/public-orders.ts
- `confirm()` --calls--> `createPublicOrder()`  [EXTRACTED]
  src/app/(public)/presupuesto/5/Step5Form.tsx → src/app/actions/public-orders.ts
- `listOrgLibrary()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/actions/attachments.ts → src/lib/auth.ts
- `DELETE()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/products/[id]/image/route.ts → src/lib/auth.ts

## Import Cycles
- 3-file cycle: `src/lib/messaging/accounts.ts -> src/lib/messaging/registry.ts -> src/lib/messaging/providers/ycloud.ts -> src/lib/messaging/accounts.ts`

## Communities (162 total, 17 thin omitted)

### Community 0 - "lib/payments.ts"
Cohesion: 0.12
Nodes (27): cancelPayment(), registerPayment(), cancel(), submit(), DELETE(), POST(), paymentEvents, runInTransaction() (+19 more)

### Community 1 - "Button.tsx"
Cohesion: 0.05
Nodes (79): AgentConfigInitial, AgentSecretStatus, PROVIDER_SECRET_FIELDS, SECRET_FIELDS, SecretFieldKey, OperatorUserOption, labels, Node (+71 more)

### Community 2 - "attachments.ts"
Cohesion: 0.16
Nodes (15): addApplication(), copyAttachmentToOrder(), Fail, listOpenOrgOrders(), listOrgLibrary(), CopyToOrderButton(), copy(), OpenOrder (+7 more)

### Community 3 - "ChannelsView.tsx"
Cohesion: 0.12
Nodes (26): ChannelAccountRow, createChannelAccount(), createChannelAccountSchema, credentialsRefSchema, listChannelAccounts(), setChannelAccountStatus(), setChannelAccountStatusSchema, updateChannelAccount() (+18 more)

### Community 4 - "validateFile"
Cohesion: 0.20
Nodes (9): formStr(), uploadAttachment(), ArteManager(), submitUpload(), formatSize(), isImage(), POST(), buildAttachmentPath() (+1 more)

### Community 5 - "db/schema.ts"
Cohesion: 0.03
Nodes (55): metadata, Step1Form(), agentConfigRelations, AgentEnabledTools, agentKind, agentMemoryScope, AgentRawPayload, agentSessionEventsRelations (+47 more)

### Community 6 - "/graphify"
Cohesion: 0.06
Nodes (34): Configured Project Profiles, For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration (+26 more)

### Community 7 - "requireUser"
Cohesion: 0.04
Nodes (83): createOrganizationWithContact(), OrgForm(), submit(), DELETE(), GET(), POST(), DELETE(), GET() (+75 more)

### Community 8 - "client.ts"
Cohesion: 0.06
Nodes (39): KIND_LABEL, metadata, STATUS_LABEL, metadata, DesactivarButton(), InsumoForm(), AppLine, AppRow (+31 more)

### Community 9 - "$graphify"
Cohesion: 0.07
Nodes (28): Configured Project Profiles, For --cluster-only, For $graphify add, For $graphify explain, For $graphify path, For $graphify query, For --update, For --watch (+20 more)

### Community 10 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+19 more)

### Community 11 - "checkRateLimit"
Cohesion: 0.11
Nodes (27): GET(), GET(), MIME_MAP, runtime, GET(), GET(), metadata, parseLineItems() (+19 more)

### Community 12 - "orders.ts"
Cohesion: 0.09
Nodes (24): confirmQuote(), createOrder(), createOrderLine(), LINE_EDITABLE_STATUS, loadQuotableLines(), QuoteActionError, REQUOTE_BLOCKED_STATUS, reQuoteOrder() (+16 more)

### Community 13 - "[id]/pagos/page.tsx"
Cohesion: 0.11
Nodes (20): CajaDetallePage(), KIND_LABEL, metadata, ConfiguracionPage(), KIND_LABEL, metadata, METHOD_LABEL, PagosPage() (+12 more)

### Community 14 - "session-policy.ts"
Cohesion: 0.14
Nodes (17): applyCommercialFacts(), assertSessionContext(), AssetKind, classifyBoundary(), CommercialFacts, CommercialIntent, createInitialSessionState(), nextState() (+9 more)

### Community 15 - "public-orders.ts"
Cohesion: 0.22
Nodes (16): beginPublicUploadSession(), createPublicOrder(), PublicOrderDomainError, PublicOrderFailure, uploadAttachmentFromPublic(), WIZARD_RATE_LIMITED, wizardRateLimited(), uploadSessions (+8 more)

### Community 16 - "pricing.ts"
Cohesion: 0.08
Nodes (29): FichaTecnicaPage(), RecetasEditor(), addItem(), editItem(), formFor(), setForm(), updateItem(), POST() (+21 more)

### Community 17 - "dependencies"
Cohesion: 0.10
Nodes (21): clsx, dotenv, lucide-react, next, dependencies, clsx, dotenv, drizzle-orm (+13 more)

### Community 18 - "devDependencies"
Cohesion: 0.10
Nodes (21): drizzle-kit, eslint, eslint-config-next, devDependencies, drizzle-kit, eslint, eslint-config-next, tailwindcss (+13 more)

### Community 19 - "agent-config.ts"
Cohesion: 0.09
Nodes (37): bindAgentOperator(), BindAgentOperatorInput, bindOperatorSchema, copyAgentConfig(), copyAgentConfigSchema, insertConfigRow(), isUniqueViolation(), nullable() (+29 more)

### Community 20 - "3/page.tsx"
Cohesion: 0.13
Nodes (11): metadata, parseSizes(), PresupuestoStep3(), Step3Form(), metadata, KINDS, Step4Form(), onFile() (+3 more)

### Community 21 - "2. Todo lo que el usuario pidió en este chat (cronológico)"
Cohesion: 0.11
Nodes (17): 1. Dónde está parado el proyecto, 2. Todo lo que el usuario pidió en este chat (cronológico), 3. Plan F6 — tareas y estado, 4. Decisiones técnicas ya tomadas (no reabrir sin motivo), 5. Archivos ya modificados en el working tree (SIN commitear al redactar), 6. Archivos a crear/modificar para terminar F6 (guía para el próximo agente), 7. Notas y gotchas para el próximo agente, 8. Correcciones posteriores a la auditoría F6 (+9 more)

### Community 22 - "Graph First — consult, maintain, and rebuild the knowledge graph"
Cohesion: 0.11
Nodes (17): 1. Hard rule: graph first, code second, 2. Command reference, 3. 1:1 parity with the code (mandatory), 4. Full rebuild, 5. Semantic enrichment (this is what makes the graph queryable), 6. The graph IS versioned, 7. Agent integration, 8. Known graphify defects and version split (verified empirically) (+9 more)

### Community 23 - "intake.ts"
Cohesion: 0.14
Nodes (26): resolveOperatorIdentity(), resolveEnabledTools(), createChatProvider(), AuditEntry, findMessage(), insertMessage(), INTAKE_IDEMPOTENCY_SCOPE, INTAKE_IDEMPOTENCY_TTL_MS (+18 more)

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
Cohesion: 0.10
Nodes (38): conversationsInputSchema, isoDateTime, loadConversations(), loadMessages(), messagesInputSchema, MessagesTimeline(), ConversationTimelinePage(), ConversationTable() (+30 more)

### Community 31 - "06 · STANDARDS BUILDING — Reglas de código"
Cohesion: 0.13
Nodes (14): 06 · STANDARDS BUILDING — Reglas de código, A. Naming, API route, B. Imports, C. Estructura de archivos, D. Componentes UI, E. Estilos, F. Base de datos (+6 more)

### Community 32 - "07 · DEPLOYMENT — Render + Neon"
Cohesion: 0.14
Nodes (14): 07 · DEPLOYMENT — Render + Neon, 10. CI/CD, 11. Post-MVP checklist, 1. Prerrequisitos, 2. Crear DB en Neon, 3. Crear Web Service en Render, 4. Primer deploy, 5. Seed inicial (una sola vez) (+6 more)

### Community 33 - "tools-orders.ts"
Cohesion: 0.04
Nodes (44): AnyOrderStatus, applyOrderStatus(), cancelOrderInner, cancelOrderInput, cancelOrderTool, cancelPaymentInner, cancelPaymentInput, cancelPaymentTool (+36 more)

### Community 34 - "productos/[id]/page.tsx"
Cohesion: 0.05
Nodes (56): CatalogoPage(), Mold, MoldesManager(), formatDate(), ProductoDetallePage(), ProductImageCard(), NuevoProductoPage(), COMMON_ZONES (+48 more)

### Community 35 - "session-store.ts"
Cohesion: 0.15
Nodes (17): agentSessionEvents, BoundarySignal, ConversationSessionState, SessionEventType, SessionPolicyRepository, CasConflictError, DrizzleSessionPolicyRepository, fromStoredState() (+9 more)

### Community 36 - "toCents"
Cohesion: 0.31
Nodes (11): CajaPage(), PedidoPagosPage(), money(), fromCents(), getOrderFinancials(), sumActivePaymentsCents(), toCents(), paymentsSummary() (+3 more)

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
Nodes (35): findMissingInfoInput, findMissingInfoTool, getConversationInput, getConversationTool, idLike, lookupCustomerInput, lookupOrderInput, QUOTE_REQUIREMENTS (+27 more)

### Community 45 - "⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento"
Cohesion: 0.20
Nodes (9): A. Adjuntos (biblioteca y carga), B. Aplicaciones (archivo × ubicación × técnica), C. Presupuesto público (5 pasos), D. Seguimiento público, E. Listado global de arte, ⏳ F4 — Adjuntos + Arte + Aplicaciones + Presupuesto público (5 pasos) + Seguimiento, F. Validación end-to-end F4, G. Cierre F4 (+1 more)

### Community 46 - "graphify-sync.mjs"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, LEGACY_GRAPH, REAPPLY, REPO_ROOT

### Community 47 - "BusinessSettingsForm.tsx"
Cohesion: 0.13
Nodes (18): BUSINESS_SETTING_KEYS, updateSetting(), updateSettingSchema, WORKSHOP_SETTING_KEYS, BusinessSettingsForm(), submit(), DEFAULT_SLOT, FIELDS (+10 more)

### Community 48 - "provider.ts"
Cohesion: 0.11
Nodes (18): CHAT_COMPLETIONS_PROTOCOL, ChatCompletionsOptions, completionResponseSchema, createChatCompletionsProvider(), errorResponseSchema, ResolvedAgentRuntime, ChatCompletion, ChatCompletionRequest (+10 more)

### Community 49 - "login/route.ts"
Cohesion: 0.07
Nodes (25): POST(), LoginForm(), LoginPage(), navigation, PublicShell(), users, createSession(), getCurrentUser() (+17 more)

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

### Community 55 - "3. Detalle por área"
Cohesion: 0.11
Nodes (17): 12 — Auditoría de paridad SocialCRM → AH Sports, 1. Resumen ejecutivo, 2. Tabla maestra de gaps, 3. Detalle por área, 4. Ítems NO-APLICA / verificados sin gap, 5. Top 10 — orden de implementación recomendado, 6. Notas de método y límites, A. Backend / capas de dominio (+9 more)

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
Nodes (38): accountStore, ChannelAccountResolution, ChannelAccountResolutionError, ChannelAccountRow, channelAccountRowId(), ChannelAccountStore, classifyRowsError(), createEnvAccountStore() (+30 more)

### Community 65 - "channels/accounts.ts"
Cohesion: 0.08
Nodes (39): ChannelAccountResolution, ChannelAccountResolutionError, ChannelAccountRow, classifyRowsError(), credentialsFromAgentConfig(), credentialsFromEnv(), credentialsFromProviderEnvScope(), decryptColumn() (+31 more)

### Community 66 - "sales-tools.ts"
Cohesion: 0.06
Nodes (33): candidateNames(), ConversationCustomer, draftOrderInput, draftOrderWhatsAppTool, draftQuoteInput, draftQuoteWhatsAppTool, GarmentRefArgs, garmentRefInput (+25 more)

### Community 67 - "channels/types.ts"
Cohesion: 0.08
Nodes (29): channelEvents, ChannelEventContext, ChannelEventEnvelope, ChannelEventInsert, channelEventKey(), ChannelEventPersistResult, ChannelEventRepository, DrizzleChannelEventRepository (+21 more)

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
Cohesion: 0.08
Nodes (50): "agent_config", "agent_memories", "agent_session_events", "agent_session_states", "applications", "attachments", "audit_events", "bom_items" (+42 more)

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
Cohesion: 0.15
Nodes (20): chatMessages, defaultInboundTurnDispatcher, loadConversationHistory(), deliverAgentReply(), dispatchSalesTurn(), FIXED_ACK_REPLY, FIXED_CLARIFICATION_REPLY, inReplyToMessageIdOrNull() (+12 more)

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
Cohesion: 0.16
Nodes (23): asString(), buildGraphBody(), classifyKind(), contactSender(), deliveryIdFor(), extractMediaRefs(), extractText(), isRecord() (+15 more)

### Community 85 - "10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas"
Cohesion: 0.08
Nodes (26): 0. Estado real: implementado vs. validado en vivo (leer primero), 10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas, 11. Troubleshooting, 12. Rollback, 13. Datos y privacidad, 1. Prerrequisitos, 3.1 `/admin/agent` — Configuración del agente, 3.2 `/admin/agent/telegram` — Estado del canal Telegram (+18 more)

### Community 88 - "agents/system-prompt.ts"
Cohesion: 0.40
Nodes (4): AGENT_DOMAIN_TERMS, DOMAIN_PROMPT, PROMPT_INJECTION_GUARD, OPERATOR_DOMAIN_PROMPT

### Community 95 - "whatsapp/webhook/[token]/route.ts"
Cohesion: 0.15
Nodes (22): contactNameFor(), dynamic, EventType, GET(), mapMessageType(), mediaRefsFor(), metaDeliveryId(), metaEnvelopeToEvents() (+14 more)

### Community 101 - "reconcile.ts"
Cohesion: 0.13
Nodes (24): AuditInput, AuditRecorder, AuditWriter, createAuditRecorder(), deleteExpiredMemories(), NO_REPLY_IDEMPOTENCY_SCOPE, purgeExpiredIdempotencyKeys(), reconcileInboundWithoutReply() (+16 more)

### Community 102 - "tools-clients.ts"
Cohesion: 0.06
Nodes (36): lookupCustomerTool, lookupOrderTool, buildReconcileTools(), buildReportCandidateTool(), CANDIDATE_KEY_PREFIX, reportCandidateInput, withAuditLog(), clientTools (+28 more)

### Community 103 - "tools-cash.ts"
Cohesion: 0.09
Nodes (20): AR_TIMEZONE, arDayRange(), dateFormatter, dateTimeFormatter, formatDateTimeAr(), moneyFormatter, CajaCloseMarker, cashTools (+12 more)

### Community 104 - "human-handoff.ts"
Cohesion: 0.10
Nodes (20): activateHumanOverride(), ClaimOutcome, DrizzleHandoffEffectRepository, HANDOFF_EFFECTS, HandoffClaimInput, handoffClaimKey(), HandoffClaimResult, HandoffEffectClaimant (+12 more)

### Community 105 - "agent-config-scope.ts"
Cohesion: 0.12
Nodes (21): channel, AgentConfigChannel, AgentConfigResolution, AgentConfigResolutionError, AgentConfigResolutionSource, AgentConfigScopeOption, CHANNEL_LABELS, configCacheKey() (+13 more)

### Community 106 - "Channel"
Cohesion: 0.12
Nodes (17): conversations, leadIdentities, ChannelTestReport, canonicalExternalUserId(), ConversationIdentityError, ConversationIdentityErrorCode, ConversationIdentityRecord, PHONE_CHANNELS (+9 more)

### Community 107 - "zernio.ts"
Cohesion: 0.16
Nodes (20): API_SENT_VIA, asString(), ATTACHMENT_TYPE_MAP, buildCreateBody(), classifyEvent(), commentSender(), createTemplateParams(), echoOrigin() (+12 more)

### Community 108 - "runner.ts"
Cohesion: 0.13
Nodes (23): neutralizeUntrustedSentinel(), buildReconcileSystemPrompt(), RECONCILE_DOMAIN_PROMPT, audit(), buildTranscriptEvidence(), buildUserMessage(), CandidatesReconcileSummary, claimRunLock() (+15 more)

### Community 109 - "whatsapp/index.ts"
Cohesion: 0.13
Nodes (20): setInboundTurnDispatcher(), BASE_SALES_PROMPT, buildSalesSystemPrompt(), CustomerPromptContext, formatPermittedSessionFacts(), SalesPromptInput, detectInjection(), INJECTION_PATTERNS (+12 more)

### Community 110 - "import.ts"
Cohesion: 0.09
Nodes (24): IntakeSuccess, MessageContentType, contentFor(), contentTypeFor(), NormalizedWhatsAppCustomerMessage, NormalizedWhatsAppOperatorMessage, normalizeWhatsAppInbound(), normalizeWhatsAppWebhook() (+16 more)

### Community 111 - "inbound-pipeline.ts"
Cohesion: 0.14
Nodes (24): resolveScopeForConversation(), importOperatorOutbound(), persistAgentOutbound(), persistCustomerInbound(), importWhatsAppWebhook(), autoReplyClaimKey(), shouldSendAutoReply(), matchesAssistantBubble() (+16 more)

### Community 112 - "conversation-identity.ts"
Cohesion: 0.13
Nodes (15): assertConversationAccount(), ConversationIdentityError, ConversationIdentityErrorCode, ConversationIdentityInsert, ConversationIdentityRecord, ConversationIdentityRepository, ConversationIdentityResult, drizzleConversationIdentityRepository (+7 more)

### Community 113 - "ingress.ts"
Cohesion: 0.11
Nodes (23): BoundedBody, MAX_WEBHOOK_BODY_BYTES, MAX_WEBHOOK_EVENTS, resolveChannelAccount(), releaseChannelDeliveryMarker(), canonicalExternalUserId(), asNonEmptyString(), eventConversationExternalUserId() (+15 more)

### Community 114 - "messaging/registry.ts"
Cohesion: 0.12
Nodes (24): POST(), callerResolvedAccount(), ExplicitCredentials, messenger, placeholderAccount(), resolveAccount(), send(), sendTemplate() (+16 more)

### Community 115 - "config.ts"
Cohesion: 0.16
Nodes (18): buildSystemPrompt(), AGENT_CONFIG_ID, AgentConfigRow, agentConfigRowSchema, AgentRuntimeResolution, clean(), DEFAULT_CHAT_COMPLETIONS_PATH, EnvRecord (+10 more)

### Community 116 - "draft.ts"
Cohesion: 0.10
Nodes (18): DRAFT_LEAD_ROLES, draftLeadInput, draftLeadRole, draftLeadTool, draftOrderInput, draftOrderTool, draftQuoteInput, draftQuoteTool (+10 more)

### Community 117 - "ChannelKind"
Cohesion: 0.22
Nodes (10): ChannelEventContext, InboundContext, IngressContext, contactsLeadIdentityStore, ensureLeadIdentity(), LeadIdentityInput, LeadIdentityStore, SendOptions (+2 more)

### Community 118 - "buffer.ts"
Cohesion: 0.13
Nodes (19): BUFFER_CONFIG, BufferChannelConfig, BufferManager, configFor(), DeadLetterEntry, DEFAULT_CONFIG, getLastProcessedContent(), getOrCreateEntry() (+11 more)

### Community 119 - "temporal-context.ts"
Cohesion: 0.17
Nodes (19): buildTemporalAgentMessages(), dedupeHistoryWithBuffered(), HistoryTurn, ARGENTINA_TIMEZONE, classifyTurnIntent(), dayKeyArgentina(), evaluateOrderRecency(), formatArgentinaTimestamp() (+11 more)

### Community 120 - "zernio-connect.ts"
Cohesion: 0.16
Nodes (19): registerZernioWebhookAction(), startConnectSchema, startZernioConnect(), registerZernioHook(), backToCanales(), GET(), publicBaseUrl(), channelAccounts (+11 more)

### Community 121 - "telegram.ts"
Cohesion: 0.08
Nodes (35): TelegramStatusPage(), dynamic, POST(), runtime, agentConfig, retryFailedDeliveries(), updateMessageDelivery(), deriveWebhookPathToken() (+27 more)

### Community 122 - "messaging/channel-events.ts"
Cohesion: 0.20
Nodes (13): idempotencyKeys, accountPartition(), ChannelEventInsert, channelEventKey(), ChannelEventPersistResult, ChannelEventRepository, claimChannelDelivery(), deliveryMarkerKey() (+5 more)

### Community 123 - "test-agent.ts"
Cohesion: 0.26
Nodes (11): GET(), POST(), authorizeAgentApi(), AgentTestReport, classifyStatus(), pingHttp(), pingProvider(), ProviderPing (+3 more)

### Community 124 - "bot.ts"
Cohesion: 0.23
Nodes (14): AuthorizedOperator, CommandContext, handleOperatorCommand(), HELP_TEXT, wrapUntrustedContent(), denialMessage(), handleConfirmCommand(), handleTelegramOperatorUpdate() (+6 more)

### Community 125 - "storage.ts"
Cohesion: 0.09
Nodes (18): DELETE(), IMAGE_MIMES, POST(), activeStorage, ALLOWED_MIMES, AllowedMime, ATTACHMENT_MIMES, FileLike (+10 more)

### Community 126 - "loop.ts"
Cohesion: 0.19
Nodes (11): detectInjectionAttempt(), InjectionSignal, SIGNATURES, AgentLoopInput, AgentLoopResult, AgentToolCallTrace, parseToolArguments(), runAgentLoop() (+3 more)

### Community 127 - "tools-memory.ts"
Cohesion: 0.12
Nodes (15): CANDIDATE_STATUSES, forgetInput, forgetThisTool, getCandidatesInput, getReconcileCandidatesTool, idLike, memoryTools, recallInput (+7 more)

### Community 130 - "channels/errors.ts"
Cohesion: 0.27
Nodes (11): classifyError(), ErrorClass, errorCode(), ErrorLike, errorMessage(), isRetryableDbError(), readError(), RETRYABLE_CODES (+3 more)

### Community 131 - "tools-broadcast.ts"
Cohesion: 0.10
Nodes (19): sql, hashPasswordSeed(), main(), isChannelDeliveryRecorded(), upsertConversation(), maskTail(), audienceSchema, broadcastGated (+11 more)

### Community 132 - "check-agent-tools.mts"
Cohesion: 0.15
Nodes (12): check(), CheckableTool, checkToolSet(), injectedRole, knownRole, leadProps, leadSpec, operatorOnly (+4 more)

### Community 133 - "PlanillaTable.tsx"
Cohesion: 0.20
Nodes (6): Item, Line, PlanillaRow(), PlanillaTable(), STAGES, stageTone

### Community 134 - "send.ts"
Cohesion: 0.22
Nodes (12): clean(), EnvRecord, isWhatsAppSendConfigured(), resolveWhatsAppSendConfig(), sendWhatsAppMessage(), sendWhatsAppMessageWithConfig(), SendWhatsAppResult, toYCloudContent() (+4 more)

### Community 135 - "signatures.ts"
Cohesion: 0.27
Nodes (11): hasBytes(), isMarkup(), isTextLike(), MediaKind, MediaSniff, mimeKind(), OLE_SIGNATURE, PNG_SIGNATURE (+3 more)

### Community 136 - "messaging/errors.ts"
Cohesion: 0.27
Nodes (10): ErrorClass, errorCode(), ErrorLike, errorMessage(), isRetryableDbError(), readError(), RETRYABLE_CODES, RETRYABLE_MESSAGES (+2 more)

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
Cohesion: 0.32
Nodes (11): ALLOWED_DOMAINS, downloadMedia(), downloadYCloudMedia(), isAllowedDomain(), mediaUploadsDir(), mimeTypeToExt(), sanitizeFilename(), sanitizeScope() (+3 more)

### Community 141 - "vision.ts"
Cohesion: 0.27
Nodes (10): analyzeImage(), buildVisionPrompt(), formatForAgent(), parseDocumentType(), processImage(), ProcessImagePersist, ProcessImageResult, raceVision() (+2 more)

### Community 142 - "APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)"
Cohesion: 0.20
Nodes (9): 1. Hardening fixes, 2. Migration bootstrap + journal reconciliation (documented, not executed), 3. Docs, 4. Graph sync (P7.2) — SKIPPED (script absent), 5. Files changed, 6. Gates, 7. Deferred / remaining risks for the merge, APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final) (+1 more)

### Community 143 - "Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)"
Cohesion: 0.22
Nodes (8): Comparación de variables de entorno, Comparación funcional (canales), Modelo de datos de mensajes, Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp), Qué falta para replicar el funcionamiento real de Muzapp, Qué se incorporó en App de gestión (P0–P7, ya mergeado), UI de conversaciones, Verdict

### Community 145 - "session-metadata.ts"
Cohesion: 0.29
Nodes (8): agentSessionStates, analyzeConversationState(), classifyMessageType(), ConversationMetadata, MessageType, isRecord(), METADATA_CAS_MAX_RETRIES, updateSessionMetadataCAS()

### Community 146 - "tools/schema.ts"
Cohesion: 0.54
Nodes (7): AnySchema, JsonSchema, kindOf(), objectSchema(), toJsonSchema(), unwrap(), zodToParameters()

### Community 147 - "messaging/send-account.ts"
Cohesion: 0.31
Nodes (6): accountIdOf(), BoundAccountResolution, decideSendAccount(), DefaultAccountResolution, SendAccountDecision, SendAccountDeps

### Community 148 - "protocol.ts"
Cohesion: 0.43
Nodes (7): ECHO_EVENT_TYPES, ECHO_MESSAGE_KEYS, echoMessageHasContent(), extractEchoMessage(), isProtocolArtifact(), isRecord(), STATUS_MESSAGE_TYPES

### Community 149 - "KanbanBoard.tsx"
Cohesion: 0.40
Nodes (4): columnOf(), columns, KanbanBoard(), OrderRow

### Community 150 - "Step5Form.tsx"
Cohesion: 0.40
Nodes (4): Props, Step5Form(), confirm(), WhatsAppCta()

### Community 151 - "2. Variables de entorno y secretos (SOLO POR NOMBRE)"
Cohesion: 0.33
Nodes (6): 2.1 Base (obligatorias), 2.2 Channel runtime del agente (runtime IA — provider-neutral), 2.3 WhatsApp (webhook de entrada — config-gated), 2.4 WhatsApp (envío de salida — YCloud, config-gated), 2.5 Cron de reconciliación, 2. Variables de entorno y secretos (SOLO POR NOMBRE)

### Community 154 - "10. Checklist de pruebas (mensajes reales)"
Cohesion: 0.40
Nodes (5): 10.1 Pre-vuelo (sin proveedor), 10.2 Telegram (canal interno), 10.3 WhatsApp (canal de ventas), 10.4 Reconciliación, 10. Checklist de pruebas (mensajes reales)

## Knowledge Gaps
- **1163 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `HERE`, `REPO_ROOT`, `graph` (+1158 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `client.ts` to `Button.tsx`, `attachments.ts`, `ChannelsView.tsx`, `tools-broadcast.ts`, `db/schema.ts`, `requireUser`, `checkRateLimit`, `orders.ts`, `[id]/pagos/page.tsx`, `public-orders.ts`, `pricing.ts`, `session-metadata.ts`, `agent-config.ts`, `3/page.tsx`, `intake.ts`, `inbox/page.tsx`, `tools-orders.ts`, `productos/[id]/page.tsx`, `session-store.ts`, `(admin)/layout.tsx`, `read.ts`, `BusinessSettingsForm.tsx`, `login/route.ts`, `channels/accounts.ts`, `sales-tools.ts`, `channels/types.ts`, `confirmations.ts`, `sales-agent.ts`, `reconcile.ts`, `tools-clients.ts`, `tools-cash.ts`, `human-handoff.ts`, `agent-config-scope.ts`, `Channel`, `runner.ts`, `inbound-pipeline.ts`, `conversation-identity.ts`, `ChannelKind`, `zernio-connect.ts`, `telegram.ts`, `messaging/channel-events.ts`, `bot.ts`, `storage.ts`, `tools-memory.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `requireUser()` connect `requireUser` to `lib/payments.ts`, `attachments.ts`, `productos/[id]/page.tsx`, `validateFile`, `toCents`, `(admin)/layout.tsx`, `client.ts`, `orders.ts`, `[id]/pagos/page.tsx`, `BusinessSettingsForm.tsx`, `pricing.ts`, `login/route.ts`, `agent-config.ts`, `storage.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `ApplicationsManager()` connect `Button.tsx` to `client.ts`, `attachments.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `HERE` to the rest of the system?**
  _1163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lib/payments.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12096774193548387 - nodes in this community are weakly interconnected._
- **Should `Button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.054324206866579745 - nodes in this community are weakly interconnected._
- **Should `ChannelsView.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12043010752688173 - nodes in this community are weakly interconnected._