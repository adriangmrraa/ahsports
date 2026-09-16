# Graph Report - .  (2026-09-16)

## Corpus Check
- 204 files · ~140,562 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 749 nodes · 2187 edges · 42 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 835 · contains: 575 · imports_from: 437 · MODIFIES: 210 · calls: 61 · ON_BRANCH: 27 · PARENT_OF: 26 · references: 13 · rationale_for: 3


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 204 · Candidates: 225
- Excluded: 0 untracked · 26322 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `81c3c0e`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `db` - 65 edges
2. `requireUser()` - 34 edges
3. `Button()` - 32 edges
4. `Card()` - 30 edges
5. `PageHeader()` - 28 edges
6. `products` - 28 edges
7. `orders` - 28 edges
8. `Input()` - 27 edges
9. `Badge()` - 19 edges
10. `organizations` - 19 edges

## Surprising Connections (you probably didn't know these)
- `0e81d18 chore(graph): actualizar grafo con el tooling de agentes` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 18 → community 14_
- `1a3144d build(f4): presupuesto público 5 pasos + seguimiento + arte global (F4-07..17)` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 9 → community 14_
- `1a3144d build(f4): presupuesto público 5 pasos + seguimiento + arte global (F4-07..17)` --PARENT_OF--> `de540bd docs(f4): marcar F4-01..17 verificadas y corregir índice F3=26/26 (87/108)`  [EXTRACTED]
  git → git  _Bridges community 9 → community 19_
- `1d4fccf fix(public-orders): validate and transact quote requests` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 19 → community 14_
- `3c6071d feat: complete AH Sports product and public flows` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 10 → community 14_

## Communities

### Community 0 - "Payments and Cash Register"
Cohesion: 0.06
Nodes (57): KIND_LABEL, ApplicationsManager(), AppLine, AppRow, AppStatusBadge(), AppTechnique, VIEWS, Tab (+49 more)

### Community 1 - "Attachments and Organization Library"
Cohesion: 0.05
Nodes (33): addApplication(), copyAttachmentToOrder(), Fail, formStr(), listOpenOrgOrders(), uploadAttachment(), CopyToOrderButton(), OpenOrder (+25 more)

### Community 2 - "API Routes and Validators"
Cohesion: 0.08
Nodes (35): cancelPayment(), registerPayment(), paymentEvents, DbTransaction, Transaction, transactionDb, withDbTransaction(), BlockGateInput (+27 more)

### Community 3 - "Order Creation Forms"
Cohesion: 0.06
Nodes (35): applicationView, attachmentKind, attachmentsRelations, attachmentStatus, bomConsumptionMode, bomItemsRelations, bomRecipesRelations, bundleSizeMode (+27 more)

### Community 4 - "Admin Dashboard and Formatting"
Cohesion: 0.10
Nodes (21): bomItems, bomRecipes, materials, parseItem(), PATCH(), BomConsumption, BomConsumptionInput, calculateBomConsumption() (+13 more)

### Community 5 - "Order Quoting Actions"
Cohesion: 0.11
Nodes (21): CatalogProduct, Row, labelGarmentFamily(), Mold, MoldesManager(), Contact, NewOrderForm(), Org (+13 more)

### Community 6 - "Database Schema and Settings"
Cohesion: 0.10
Nodes (15): FIELDS, WorkshopSettingsForm(), DesactivarButton(), EstadoButton(), kindLabel, stageLabel, statusLabel, labelGarmentType() (+7 more)

### Community 7 - "Blocked Orders and Insumos"
Cohesion: 0.12
Nodes (13): applications, orderItems, orderLines, products, sizes, techniques, ItemEditor(), CYCLE (+5 more)

### Community 8 - "Products and Item Stages"
Cohesion: 0.11
Nodes (21): GarmentMeasurementSchema, BUNDLE_SIZE_MODES, defaultMeasurementSchema(), defaults, GARMENT_FAMILIES, GARMENT_TYPES, GARMENT_TYPES_BY_FAMILY, PRODUCT_KINDS (+13 more)

### Community 9 - "Landing pública y tablero Kanban"
Cohesion: 0.12
Nodes (12): metadata, Step1Form(), metadata, Step2Form(), metadata, parseSizes(), PresupuestoStep3(), Step3Form() (+4 more)

### Community 10 - "Historial de commits del proyecto"
Cohesion: 0.12
Nodes (9): metadata, 3c6071d feat: complete AH Sports product and public flows, navigation, PublicShell(), LoginForm(), product_taxonomy_nodes, services, sizes (+1 more)

### Community 11 - "Authentication and Sessions"
Cohesion: 0.14
Nodes (15): garmentMolds, productBundleItems, productBundles, patchSchema, ProductStructureInput, replaceBundleItems(), validateProductClassification(), validateProductStructure() (+7 more)

### Community 12 - "Recipes and Role Authorization"
Cohesion: 0.13
Nodes (16): MaterialConsumptionSnapshot, PricingSnapshot, consumptionUnitCost(), MaterialSummary, quoteBundleLine(), QuoteLineInput, quoteOrder(), QuoteResult (+8 more)

### Community 13 - "Presupuesto público paso 2"
Cohesion: 0.13
Nodes (18): labelProductTaxonomy(), mergeProductTaxonomy(), PRODUCT_TAXONOMY, ProductTaxonomyCategory, ProductTaxonomyNode, ProductTaxonomySubcategory, ProductTaxonomyType, getProductTaxonomy() (+10 more)

### Community 14 - "Public Order Submission"
Cohesion: 0.19
Nodes (18): master, 01f49b8 feat(config): hub con 5 secciones y updateSetting, F5-07/08 verificadas, 077d51a docs(progress): F5 4/16 pagos verificados, total 91/108, 5e59af6 feat(payments): cancellable payments with audit events and shared block gate, 78912b6 chore(graph): quitar cache espurio y contener el estado anidado de graphify, 7b28303 chore: ignore tsc buildinfo noise, 81c3c0e chore(graph): sincronizar grafo con el estado final, 82e22c8 feat(caja): saldos por organización y cuenta corriente, F5-01/02 verificadas (+10 more)

### Community 15 - "Admin Detail Pages"
Cohesion: 0.14
Nodes (16): confirmQuote(), createOrder(), createOrderLine(), LINE_EDITABLE_STATUS, loadQuotableLines(), QuoteActionError, REQUOTE_BLOCKED_STATUS, reQuoteOrder() (+8 more)

### Community 16 - "Admin Layout and Database Client"
Cohesion: 0.14
Nodes (9): createOrganizationWithContact(), contacts, organizations, organizationWithContactSchema, InsumoForm(), MATERIAL_CATEGORIES, MaterialInitial, UNITS (+1 more)

### Community 17 - "Public Upload Sessions"
Cohesion: 0.18
Nodes (11): sessions, users, createSession(), destroySession(), getCurrentUser(), sign(), verifyPassword(), verifySignature() (+3 more)

### Community 18 - "Artwork and Attachments Management"
Cohesion: 0.14
Nodes (13): 0e81d18 chore(graph): actualizar grafo con el tooling de agentes, 334561f docs: update guide QA render, 8db8e74 chore(agents): integrar graphify para opencode, codex y claude, e4e3f4a chore(graph): versionar el grafo de conocimiento, ea0201b fix(graph-first): anclar el cwd de los scripts al repo, cache, graph, HERE (+5 more)

### Community 19 - "Public Upload Step and Wizard"
Cohesion: 0.21
Nodes (11): metadata, parseLineItems(), PresupuestoStep5(), Props, Step5Form(), createPublicOrder(), 1d4fccf fix(public-orders): validate and transact quote requests, a10ba8f fix(uploads): bind public attachments to expiring sessions (+3 more)

### Community 20 - "Techniques and Applications API"
Cohesion: 0.26
Nodes (11): PublicOrderDomainError, PublicOrderFailure, uploadSessions, cleanupExpiredPublicUploads(), createPublicUploadSession(), getLivePublicUploadSession(), hashSecret(), matchesPublicUploadSecret() (+3 more)

### Community 21 - "Application Management and Badges"
Cohesion: 0.29
Nodes (7): AdminMobileNav(), AdminMobileNavProps, ADMIN_NAV_ICONS, AdminNavIcon, AdminNavItem, getAdminNavItems(), navigation

### Community 22 - "Organizations and Creation Forms"
Cohesion: 0.44
Nodes (10): body(), bullets(), cell_setup(), code(), fields(), heading(), note(), set_font() (+2 more)

### Community 23 - "Quote Wizard Step Three"
Cohesion: 0.18
Nodes (5): requireRole(), requireUser(), contactSchema, organizationSchema, techniqueSchema

### Community 24 - "Workshop Settings Form"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, NOTE: `graphify hook install` restores the stock hooks and will undo the, REAPPLY, REPO_ROOT

### Community 25 - "Database Seed Script"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, NOTE: `graphify hook install` restores the stock hooks and will undo the, REAPPLY, REPO_ROOT

### Community 26 - "Payment Cancellation Audit Schema"
Cohesion: 0.25
Nodes (6): metadata, KINDS, Step4Form(), Uploaded, beginPublicUploadSession(), uploadAttachmentFromPublic()

### Community 27 - "Public Layout and Login"
Cohesion: 0.22
Nodes (8): cache, graph, HERE, hits, misses, PRIMARY_CACHE, REPO_ROOT, SKILL_DIR

### Community 28 - "Production Stage Events"
Cohesion: 0.25
Nodes (3): suppliers, materialSchema, supplierSchema

### Community 29 - "Production Planilla Table"
Cohesion: 0.33
Nodes (4): CatalogManager(), labels, Node, getProductTaxonomyNodes()

### Community 30 - "Database Seed and Admin"
Cohesion: 0.29
Nodes (5): productionEvents, orderItemStageSchema, stageSchema, PRODUCTIVE, STAGE_TO_EVENT

### Community 31 - "Garment Family Bundles Migration"
Cohesion: 0.29
Nodes (5): Item, Line, PlanillaTable(), STAGES, stageTone

### Community 32 - "Workshop Settings Service"
Cohesion: 0.40
Nodes (4): pricingRules, adminPassword, hashPasswordSeed(), main()

### Community 33 - "Product Taxonomy Nodes Route"
Cohesion: 0.67
Nodes (5): garment_molds, product_bundle_items, product_bundles, products, sizes

### Community 34 - "Payment Cancellation Audit"
Cohesion: 0.40
Nodes (4): updateSetting(), updateSettingSchema, WORKSHOP_SETTING_KEYS, settings

### Community 35 - "Community 35"
Cohesion: 0.40
Nodes (2): productTaxonomyNodes, nodeSchema

### Community 36 - "Community 36"
Cohesion: 0.80
Nodes (4): orders, payment_events, payments, users

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): compat, __dirname, __filename

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (1): garmentMoldSchema

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (1): pricingRuleSchema

### Community 40 - "Community 40"
Cohesion: 1.00
Nodes (2): materials, suppliers

### Community 41 - "Community 41"
Cohesion: 1.00
Nodes (2): bom_recipes, sizes

## Knowledge Gaps
- **225 isolated node(s):** `HERE`, `REPO_ROOT`, `REAPPLY`, `GRAPH`, `CACHE` (+220 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 35`** (2 nodes): `productTaxonomyNodes`, `nodeSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `garmentMoldSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `pricingRuleSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `materials`, `suppliers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `bom_recipes`, `sizes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Payments and Cash Register` to `Landing pública y tablero Kanban`, `Public Upload Step and Wizard`, `Attachments and Organization Library`, `Admin Detail Pages`, `Admin Layout and Database Client`, `Techniques and Applications API`, `Payment Cancellation Audit`, `Application Management and Badges`, `Blocked Orders and Insumos`, `Quote Wizard Step Three`, `Workshop Settings Service`, `Community 38`, `Database Schema and Settings`, `Authentication and Sessions`, `Admin Dashboard and Formatting`, `Public Upload Sessions`, `Recipes and Role Authorization`, `Presupuesto público paso 2`, `Production Stage Events`, `API Routes and Validators`, `Community 39`, `Community 35`, `Products and Item Stages`, `Database Seed and Admin`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `orders` connect `Payments and Cash Register` to `Attachments and Organization Library`, `Admin Detail Pages`, `Techniques and Applications API`, `Application Management and Badges`, `Order Creation Forms`, `Blocked Orders and Insumos`, `Database Schema and Settings`, `API Routes and Validators`, `Database Seed and Admin`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Button()` connect `Database Schema and Settings` to `Order Quoting Actions`, `Payment Cancellation Audit Schema`, `Public Upload Step and Wizard`, `Attachments and Organization Library`, `Payments and Cash Register`, `Production Planilla Table`, `Admin Detail Pages`, `Blocked Orders and Insumos`, `Historial de commits del proyecto`, `Admin Layout and Database Client`, `Presupuesto público paso 2`, `API Routes and Validators`, `Garment Family Bundles Migration`, `Admin Dashboard and Formatting`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `HERE`, `REPO_ROOT`, `REAPPLY` to the rest of the system?**
  _225 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Payments and Cash Register` be split into smaller, more focused modules?**
  _Cohesion score 0.060142711518858305 - nodes in this community are weakly interconnected._
- **Should `Attachments and Organization Library` be split into smaller, more focused modules?**
  _Cohesion score 0.053544494720965306 - nodes in this community are weakly interconnected._
- **Should `API Routes and Validators` be split into smaller, more focused modules?**
  _Cohesion score 0.08350951374207188 - nodes in this community are weakly interconnected._