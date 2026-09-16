# Graph Report - .  (2026-09-16)

## Corpus Check
- 204 files · ~140,511 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 748 nodes · 2184 edges · 35 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 835 · contains: 575 · imports_from: 437 · MODIFIES: 209 · calls: 61 · ON_BRANCH: 26 · PARENT_OF: 25 · references: 13 · rationale_for: 3


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 204 · Candidates: 225
- Excluded: 0 untracked · 26323 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `78912b6`
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
- `1a3144d build(f4): presupuesto público 5 pasos + seguimiento + arte global (F4-07..17)` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 1 → community 4_
- `3c6071d feat: complete AH Sports product and public flows` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 11 → community 4_
- `5e59af6 feat(payments): cancellable payments with audit events and shared block gate` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 3 → community 4_
- `7a06139 chore: commit inicial AH Sports OS (F0-F3 completas + F4 parcial) con repo conectado` --ON_BRANCH--> `master`  [EXTRACTED]
  git → git  _Bridges community 0 → community 4_
- `7a06139 chore: commit inicial AH Sports OS (F0-F3 completas + F4 parcial) con repo conectado` --PARENT_OF--> `3f314b8 build(f4): storage + arte + adjuntos + aplicaciones verificados (F4-01..06)`  [EXTRACTED]
  git → git  _Bridges community 0 → community 1_

## Communities

### Community 0 - "Payments and Cash Register"
Cohesion: 0.06
Nodes (57): KIND_LABEL, ApplicationsManager(), AppLine, AppRow, AppStatusBadge(), AppTechnique, VIEWS, Tab (+49 more)

### Community 1 - "Attachments and Organization Library"
Cohesion: 0.06
Nodes (40): metadata, Step1Form(), metadata, Step2Form(), metadata, parseSizes(), PresupuestoStep3(), Step3Form() (+32 more)

### Community 2 - "API Routes and Validators"
Cohesion: 0.05
Nodes (33): addApplication(), copyAttachmentToOrder(), Fail, formStr(), listOpenOrgOrders(), uploadAttachment(), CopyToOrderButton(), OpenOrder (+25 more)

### Community 3 - "Order Creation Forms"
Cohesion: 0.07
Nodes (42): cancelPayment(), registerPayment(), 5e59af6 feat(payments): cancellable payments with audit events and shared block gate, a8a7ae3 feat(payments): order payments page, global ledger, F5-03..06 verified, dc80dbf feat(payments): authorized register/cancel actions and API with block recalculation, paymentEvents, DbTransaction, Transaction (+34 more)

### Community 4 - "Admin Dashboard and Formatting"
Cohesion: 0.05
Nodes (40): updateSetting(), updateSettingSchema, WORKSHOP_SETTING_KEYS, master, 01f49b8 feat(config): hub con 5 secciones y updateSetting, F5-07/08 verificadas, 077d51a docs(progress): F5 4/16 pagos verificados, total 91/108, 0e81d18 chore(graph): actualizar grafo con el tooling de agentes, 334561f docs: update guide QA render (+32 more)

### Community 5 - "Order Quoting Actions"
Cohesion: 0.06
Nodes (35): applicationView, attachmentKind, attachmentsRelations, attachmentStatus, bomConsumptionMode, bomItemsRelations, bomRecipesRelations, bundleSizeMode (+27 more)

### Community 6 - "Database Schema and Settings"
Cohesion: 0.10
Nodes (21): bomItems, bomRecipes, materials, parseItem(), PATCH(), BomConsumption, BomConsumptionInput, calculateBomConsumption() (+13 more)

### Community 7 - "Blocked Orders and Insumos"
Cohesion: 0.11
Nodes (21): CatalogProduct, Row, labelGarmentFamily(), Mold, MoldesManager(), Contact, NewOrderForm(), Org (+13 more)

### Community 8 - "Products and Item Stages"
Cohesion: 0.12
Nodes (13): applications, orderItems, orderLines, products, sizes, techniques, ItemEditor(), CYCLE (+5 more)

### Community 9 - "Landing pública y tablero Kanban"
Cohesion: 0.11
Nodes (21): GarmentMeasurementSchema, BUNDLE_SIZE_MODES, defaultMeasurementSchema(), defaults, GARMENT_FAMILIES, GARMENT_TYPES, GARMENT_TYPES_BY_FAMILY, PRODUCT_KINDS (+13 more)

### Community 10 - "Historial de commits del proyecto"
Cohesion: 0.11
Nodes (13): DesactivarButton(), EstadoButton(), kindLabel, stageLabel, statusLabel, labelGarmentType(), ProveedorForm(), SupplierInitial (+5 more)

### Community 11 - "Authentication and Sessions"
Cohesion: 0.12
Nodes (9): metadata, 3c6071d feat: complete AH Sports product and public flows, navigation, PublicShell(), LoginForm(), product_taxonomy_nodes, services, sizes (+1 more)

### Community 12 - "Recipes and Role Authorization"
Cohesion: 0.14
Nodes (15): garmentMolds, productBundleItems, productBundles, patchSchema, ProductStructureInput, replaceBundleItems(), validateProductClassification(), validateProductStructure() (+7 more)

### Community 13 - "Presupuesto público paso 2"
Cohesion: 0.13
Nodes (16): MaterialConsumptionSnapshot, PricingSnapshot, consumptionUnitCost(), MaterialSummary, quoteBundleLine(), QuoteLineInput, quoteOrder(), QuoteResult (+8 more)

### Community 14 - "Public Order Submission"
Cohesion: 0.13
Nodes (18): labelProductTaxonomy(), mergeProductTaxonomy(), PRODUCT_TAXONOMY, ProductTaxonomyCategory, ProductTaxonomyNode, ProductTaxonomySubcategory, ProductTaxonomyType, getProductTaxonomy() (+10 more)

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
Cohesion: 0.29
Nodes (7): AdminMobileNav(), AdminMobileNavProps, ADMIN_NAV_ICONS, AdminNavIcon, AdminNavItem, getAdminNavItems(), navigation

### Community 19 - "Public Upload Step and Wizard"
Cohesion: 0.44
Nodes (10): body(), bullets(), cell_setup(), code(), fields(), heading(), note(), set_font() (+2 more)

### Community 20 - "Techniques and Applications API"
Cohesion: 0.18
Nodes (5): requireRole(), requireUser(), contactSchema, organizationSchema, techniqueSchema

### Community 21 - "Application Management and Badges"
Cohesion: 0.20
Nodes (7): CACHE, { described, total }, GRAPH, HERE, NOTE: `graphify hook install` restores the stock hooks and will undo the, REAPPLY, REPO_ROOT

### Community 22 - "Organizations and Creation Forms"
Cohesion: 0.22
Nodes (8): cache, graph, HERE, hits, misses, PRIMARY_CACHE, REPO_ROOT, SKILL_DIR

### Community 23 - "Quote Wizard Step Three"
Cohesion: 0.25
Nodes (3): suppliers, materialSchema, supplierSchema

### Community 24 - "Workshop Settings Form"
Cohesion: 0.33
Nodes (4): CatalogManager(), labels, Node, getProductTaxonomyNodes()

### Community 25 - "Database Seed Script"
Cohesion: 0.29
Nodes (5): productionEvents, orderItemStageSchema, stageSchema, PRODUCTIVE, STAGE_TO_EVENT

### Community 26 - "Payment Cancellation Audit Schema"
Cohesion: 0.29
Nodes (5): Item, Line, PlanillaTable(), STAGES, stageTone

### Community 27 - "Public Layout and Login"
Cohesion: 0.40
Nodes (4): pricingRules, adminPassword, hashPasswordSeed(), main()

### Community 28 - "Production Stage Events"
Cohesion: 0.67
Nodes (5): garment_molds, product_bundle_items, product_bundles, products, sizes

### Community 29 - "Production Planilla Table"
Cohesion: 0.40
Nodes (2): productTaxonomyNodes, nodeSchema

### Community 30 - "Database Seed and Admin"
Cohesion: 0.50
Nodes (3): compat, __dirname, __filename

### Community 31 - "Garment Family Bundles Migration"
Cohesion: 0.50
Nodes (1): garmentMoldSchema

### Community 32 - "Workshop Settings Service"
Cohesion: 0.67
Nodes (1): pricingRuleSchema

### Community 33 - "Product Taxonomy Nodes Route"
Cohesion: 1.00
Nodes (2): materials, suppliers

### Community 34 - "Payment Cancellation Audit"
Cohesion: 1.00
Nodes (2): bom_recipes, sizes

## Knowledge Gaps
- **225 isolated node(s):** `HERE`, `SKILL_DIR`, `REPO_ROOT`, `PRIMARY_CACHE`, `cache` (+220 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Production Planilla Table`** (2 nodes): `productTaxonomyNodes`, `nodeSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Garment Family Bundles Migration`** (1 nodes): `garmentMoldSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Workshop Settings Service`** (1 nodes): `pricingRuleSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Product Taxonomy Nodes Route`** (2 nodes): `materials`, `suppliers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Payment Cancellation Audit`** (2 nodes): `bom_recipes`, `sizes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Payments and Cash Register` to `Attachments and Organization Library`, `API Routes and Validators`, `Admin Detail Pages`, `Admin Layout and Database Client`, `Admin Dashboard and Formatting`, `Artwork and Attachments Management`, `Products and Item Stages`, `Techniques and Applications API`, `Public Layout and Login`, `Garment Family Bundles Migration`, `Historial de commits del proyecto`, `Recipes and Role Authorization`, `Database Schema and Settings`, `Public Upload Sessions`, `Presupuesto público paso 2`, `Public Order Submission`, `Quote Wizard Step Three`, `Order Creation Forms`, `Workshop Settings Service`, `Production Planilla Table`, `Landing pública y tablero Kanban`, `Database Seed Script`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `orders` connect `Payments and Cash Register` to `API Routes and Validators`, `Admin Detail Pages`, `Attachments and Organization Library`, `Artwork and Attachments Management`, `Order Quoting Actions`, `Products and Item Stages`, `Historial de commits del proyecto`, `Order Creation Forms`, `Database Seed Script`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Button()` connect `Historial de commits del proyecto` to `Blocked Orders and Insumos`, `Attachments and Organization Library`, `API Routes and Validators`, `Payments and Cash Register`, `Workshop Settings Form`, `Admin Dashboard and Formatting`, `Admin Detail Pages`, `Products and Item Stages`, `Authentication and Sessions`, `Admin Layout and Database Client`, `Public Order Submission`, `Order Creation Forms`, `Payment Cancellation Audit Schema`, `Database Schema and Settings`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `HERE`, `SKILL_DIR`, `REPO_ROOT` to the rest of the system?**
  _225 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Payments and Cash Register` be split into smaller, more focused modules?**
  _Cohesion score 0.060142711518858305 - nodes in this community are weakly interconnected._
- **Should `Attachments and Organization Library` be split into smaller, more focused modules?**
  _Cohesion score 0.05747126436781609 - nodes in this community are weakly interconnected._
- **Should `API Routes and Validators` be split into smaller, more focused modules?**
  _Cohesion score 0.053544494720965306 - nodes in this community are weakly interconnected._