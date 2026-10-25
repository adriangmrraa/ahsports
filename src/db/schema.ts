import {
  pgTable,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["admin", "disenador", "operario", "gerencia"]);
export const orderStatus = pgEnum("order_status", [
  "borrador",
  "presupuesto_enviado",
  "aprobado",
  "seniado",
  "en_produccion",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "entregado",
  "cancelado",
  "bloqueado_pago",
]);
export const productionStage = pgEnum("production_stage", [
  "ingreso",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "entrega",
]);
export const paymentMethod = pgEnum("payment_method", ["efectivo", "transferencia", "cheque", "mercadopago", "otro"]);
export const paymentKind = pgEnum("payment_kind", ["sena", "pago", "saldo"]);
export const paymentEventType = pgEnum("payment_event_type", ["registered", "cancelled"]);
export const attachmentKind = pgEnum("attachment_kind", [
  "identidad_organizacion",
  "sponsor",
  "diseno_pedido",
  "personalizacion_individual",
  "documento_operativo",
  "produccion_calidad",
]);
export const attachmentStatus = pgEnum("attachment_status", [
  "pendiente_revision",
  "aprobado",
  "requiere_reemplazo",
  "rechazado",
  "archivado",
]);
export const uploadSessionStatus = pgEnum("upload_session_status", ["active", "consumed", "expired"]);
export const applicationView = pgEnum("application_view", ["frente", "espalda", "lateral", "manga", "otro"]);
export const organizationKind = pgEnum("organization_kind", ["club", "empresa", "colegio", "institucion", "particular"]);
export const leadStatus = pgEnum("lead_status", ["nuevo", "contactado", "calificado", "convertido", "perdido"]);
export const materialUnit = pgEnum("material_unit", ["metro", "kilo", "unidad", "centimetro", "mililitro", "metro_cuadrado", "rollo"]);
export const bomConsumptionMode = pgEnum("bom_consumption_mode", ["direct", "yield"]);
export const garmentFamily = pgEnum("garment_family", ["parte_superior", "campera", "pantalon", "short_futbol", "bermuda", "accesorio"]);
export const garmentType = pgEnum("garment_type", ["remera", "chomba", "camiseta", "campera", "pantalon", "short", "bermuda", "conjunto", "accesorio"]);
export const productKind = pgEnum("product_kind", ["garment", "bundle"]);
export const bundleSizeMode = pgEnum("bundle_size_mode", ["same_label", "fixed"]);
export const productTaxonomyNodeKind = pgEnum("product_taxonomy_node_kind", ["category", "subcategory", "type"]);

// Agent platform enums (P0 — see migration 0010_agent_platform.sql).
// Multichannel port (migration 0011): the enum gains instagram/facebook/sms/
// reddit; telegram + whatsapp keep their leading positions.
export const channel = pgEnum("channel", [
  "telegram",
  "whatsapp",
  "instagram",
  "facebook",
  "sms",
  "reddit",
  "linkedin",
  "tiktok",
  "youtube",
  "threads",
  "pinterest",
  "discord",
  "slack",
]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageSenderKind = pgEnum("message_sender_kind", ["customer", "agent", "operator"]);
export const messageContentType = pgEnum("message_content_type", ["text", "image", "document", "system"]);
export const messageDeliveryState = pgEnum("message_delivery_state", ["received", "queued", "sent", "failed", "imported"]);
export const conversationStatus = pgEnum("conversation_status", ["open", "closed"]);
export const agentKind = pgEnum("agent_kind", ["customer", "operator"]);
export const agentMemoryScope = pgEnum("agent_memory_scope", ["customer", "operator", "global"]);
export const auditActorKind = pgEnum("audit_actor_kind", ["system", "user", "agent", "channel"]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRole("role").notNull().default("operario"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  kind: organizationKind("kind").notNull().default("club"),
  name: varchar("name", { length: 255 }).notNull(),
  taxId: varchar("tax_id", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  role: varchar("role", { length: 128 }),
  notes: text("notes"),
  status: leadStatus("status").notNull().default("nuevo"),
  marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 255 }),
  address: varchar("address", { length: 255 }),
  contactName: varchar("contact_name", { length: 255 }),
  taxId: varchar("tax_id", { length: 64 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  normalizedNameUnique: uniqueIndex("suppliers_name_unique_idx")
    .on(sql`lower(btrim(${t.name}))`)
    .where(sql`btrim(${t.name}) <> ''`),
}));

export const materials = pgTable("materials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }).notNull(),
  unit: materialUnit("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  supplier: varchar("supplier", { length: 255 }),
  supplierId: varchar("supplier_id", { length: 36 }).references(() => suppliers.id, { onDelete: "set null" }),
  color: varchar("color", { length: 64 }),
  width: numeric("width", { precision: 8, scale: 2 }),
  gramsPerMeter: numeric("grams_per_meter", { precision: 8, scale: 2 }),
  metersPerKilo: numeric("meters_per_kilo", { precision: 8, scale: 2 }),
  yieldPercent: numeric("yield_percent", { precision: 5, scale: 2 }).notNull().default("85"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const techniques = pgTable("techniques", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 128 }).notNull(),
  costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 2 }).notNull().default("0"),
  costPerSquareMeter: numeric("cost_per_square_meter", { precision: 12, scale: 2 }).notNull().default("0"),
  setupCost: numeric("setup_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description"),
  requiresSublimableFabric: boolean("requires_sublimable_fabric").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

/**
 * Customer-facing fabric catalog (telas). Deliberately separate from
 * `materials`: materials tracks purchasing/consumption for BOM cost, while a
 * fabric is an option the customer picks — it carries a sell-price modifier
 * and whether it accepts sublimation.
 */
export const fabrics = pgTable("fabrics", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  sublimable: boolean("sublimable").notNull().default(true),
  /** Catalog-level sell-price delta; product_fabrics adds a per-product one. */
  priceModifier: numeric("price_modifier", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  normalizedNameUnique: uniqueIndex("fabrics_name_unique_idx")
    .on(sql`lower(btrim(${t.name}))`)
    .where(sql`btrim(${t.name}) <> ''`),
}));

/** Which fabrics a product offers + per-product sell-price delta. */
export const productFabrics = pgTable("product_fabrics", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  fabricId: varchar("fabric_id", { length: 36 }).notNull().references(() => fabrics.id),
  priceModifier: numeric("price_modifier", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productFabricUnique: uniqueIndex("product_fabrics_unique_idx").on(t.productId, t.fabricId),
  fabricIdx: index("product_fabrics_fabric_idx").on(t.fabricId),
}));

/** Which decoration methods a product offers + per-product sell-price delta. */
export const productTechniques = pgTable("product_techniques", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  techniqueId: varchar("technique_id", { length: 36 }).notNull().references(() => techniques.id),
  priceModifier: numeric("price_modifier", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productTechniqueUnique: uniqueIndex("product_techniques_unique_idx").on(t.productId, t.techniqueId),
  techniqueIdx: index("product_techniques_technique_idx").on(t.techniqueId),
}));

/** Per-product quantity ladder: highest minQty <= quantity wins. */
export const productVolumeTiers = pgTable("product_volume_tiers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  minQty: integer("min_qty").notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productMinQtyUnique: uniqueIndex("product_volume_tiers_unique_idx").on(t.productId, t.minQty),
}));

export type GarmentMeasurementSchema = { required: string[]; optional: string[] };

export const garmentMolds = pgTable("garment_molds", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 128 }).notNull(),
  family: garmentFamily("family").notNull(),
  measurementSchema: jsonb("measurement_schema").$type<GarmentMeasurementSchema>().notNull().default(sql`'{"required":[],"optional":[]}'::jsonb`),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  productKind: productKind("product_kind").notNull().default("garment"),
  productCategory: varchar("product_category", { length: 128 }).notNull().default("indumentaria"),
  productSubcategory: varchar("product_subcategory", { length: 128 }).notNull().default("prendas"),
  productType: varchar("product_type", { length: 128 }).notNull().default("otro"),
  garmentFamily: garmentFamily("garment_family"),
  garmentType: garmentType("garment_type"),
  moldId: varchar("mold_id", { length: 36 }).references(() => garmentMolds.id, { onDelete: "set null" }),
  imageUrl: text("image_url"),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
  minOrder: integer("min_order").notNull().default(1),
  zones: jsonb("zones").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Editable catalog for the general product classification used by admin forms. */
export const productTaxonomyNodes = pgTable("product_taxonomy_nodes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  kind: productTaxonomyNodeKind("kind").notNull(),
  value: varchar("value", { length: 128 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  // The self-referencing FK is declared in SQL migration; keeping this column
  // plain here avoids Drizzle's recursive table initializer type cycle.
  parentId: varchar("parent_id", { length: 36 }),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  parentIdx: index("product_taxonomy_nodes_parent_idx").on(t.parentId),
  lookupIdx: index("product_taxonomy_nodes_lookup_idx").on(t.kind, t.parentId, t.value),
  uniqueValue: uniqueIndex("product_taxonomy_nodes_unique_value_idx").on(t.kind, sql`coalesce(${t.parentId}, '')`, t.value),
}));

export const sizes = pgTable("sizes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 32 }).notNull(),
  order: integer("order").notNull().default(0),
  measurements: jsonb("measurements").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
});

export const productBundles = pgTable("product_bundles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().unique().references(() => products.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productBundleItems = pgTable("product_bundle_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id", { length: 36 }).notNull().references(() => productBundles.id, { onDelete: "cascade" }),
  componentProductId: varchar("component_product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull().default("1"),
  sizeMode: bundleSizeMode("size_mode").notNull().default("same_label"),
  componentSizeId: varchar("component_size_id", { length: 36 }).references(() => sizes.id, { onDelete: "restrict" }),
}, (t) => ({
  bundleIdx: index("product_bundle_items_bundle_idx").on(t.bundleId),
}));

export const bomRecipes = pgTable(
  "bom_recipes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
    // A size can be removed only after its recipes/references are explicitly
    // removed. The API preserves IDs on edit and rejects referenced deletes.
    sizeId: varchar("size_id", { length: 36 }).references(() => sizes.id, { onDelete: "restrict" }),
    techniqueId: varchar("technique_id", { length: 36 }).references(() => techniques.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("bom_product_idx").on(t.productId),
  }),
);

export const bomItems = pgTable(
  "bom_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    recipeId: varchar("recipe_id", { length: 36 }).notNull().references(() => bomRecipes.id, { onDelete: "cascade" }),
    materialId: varchar("material_id", { length: 36 }).notNull().references(() => materials.id),
    consumptionMode: bomConsumptionMode("consumption_mode").notNull().default("direct"),
    /** Legacy quantity is kept as the calculated base quantity for compatibility. */
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    directQuantity: numeric("direct_quantity", { precision: 12, scale: 4 }),
    unitsPerConsumptionUnit: numeric("units_per_consumption_unit", { precision: 12, scale: 4 }),
    wastePercent: numeric("waste_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  },
  (t) => ({
    recipeIdx: index("bom_items_recipe_idx").on(t.recipeId),
  }),
);

export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 128 }).notNull(),
  marginPercent: numeric("margin_percent", { precision: 5, scale: 2 }).notNull().default("40"),
  urgentSurcharge: numeric("urgent_surcharge", { precision: 5, scale: 2 }).notNull().default("15"),
  minAdvancePercent: numeric("min_advance_percent", { precision: 5, scale: 2 }).notNull().default("50"),
  rounding: numeric("rounding", { precision: 12, scale: 2 }).notNull().default("100"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    publicToken: varchar("public_token", { length: 64 }).notNull().unique(),
    organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "set null" }),
    contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id, { onDelete: "set null" }),
    status: orderStatus("status").notNull().default("borrador"),
    urgent: boolean("urgent").notNull().default(false),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    pricingRuleId: varchar("pricing_rule_id", { length: 36 }).references(() => pricingRules.id),
    snapshot: jsonb("snapshot").$type<PricingSnapshot | null>(),
    snapshotHistory: jsonb("snapshot_history").$type<SnapshotHistoryEntry[]>().notNull().default(sql`'[]'::jsonb`),
    totalQuoted: numeric("total_quoted", { precision: 14, scale: 2 }).notNull().default("0"),
    totalCost: numeric("total_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    marginPercent: numeric("margin_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    createdById: varchar("created_by_id", { length: 36 }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("orders_status_idx").on(t.status),
    orgIdx: index("orders_org_idx").on(t.organizationId),
  }),
);

export type MaterialConsumptionSnapshot = {
  itemId?: string;
  sourceProductId?: string;
  sourceProductName?: string;
  materialId?: string;
  name: string;
  unit: string;
  sizeId: string | null;
  sizeLabel: string | null;
  consumptionMode: "direct" | "yield";
  directQuantity: number | null;
  unitsPerConsumptionUnit: number | null;
  baseQuantityPerUnit: number;
  calculatedQuantityPerUnit: number;
  totalQuantity: number;
  wastePercent: number;
};

/** What the customer picked per line — stored on the snapshot for traceability. */
export type LineOptionsSnapshot = {
  fabricId: string;
  fabricName: string;
  fabricDelta: number;
  /** Stackable methods applied to the line, each with the sell delta it added. */
  methods: Array<{ techniqueId: string; techniqueName: string; delta: number }>;
  /** Sum of every method delta — what the customer pays on top of the fabric. */
  methodsDelta: number;
  /** Sum of the selected methods' costPerUnit (internal cost, not a sell delta). */
  methodsCostPerUnit: number;
  basePrice: number;
  listUnitPrice: number;
  volumeTier: { minQty: number; discountPercent: number } | null;
  discountPercent: number;
};

export type PricingSnapshot = {
  rule: { id: string; name: string; marginPercent: number; urgentSurcharge: number; minAdvancePercent: number; rounding: number };
  lines: Array<{
    orderLineId?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    subtotal: number;
    materials: Array<{ materialId?: string; name: string; totalQuantity: number; unit: string }>;
    bundleComponents?: Array<{ productId: string; productName: string; quantity: number }>;
    options?: LineOptionsSnapshot;
    techniques?: Array<{
      id: string;
      name: string;
      costPerUnit: number;
      costPerSquareMeter: number;
      setupCost: number;
      setupCostApplied: boolean;
      areaM2: number | null;
    }>;
    sizeBreakdown?: Array<{
      sizeId: string | null;
      sizeLabel: string | null;
      quantity: number;
      unitCost: number;
      unitPrice: number;
      subtotal: number;
      materials: Array<{ materialId?: string; name: string; totalQuantity: number; unit: string }>;
      consumption?: MaterialConsumptionSnapshot[];
    }>;
  }>;
  totals: { cost: number; price: number; margin: number; marginPercent: number };
  generatedAt: string;
};

export type SnapshotHistoryEntry = {
  snapshot: PricingSnapshot;
  supersededAt: string;
  reason: "re-quote" | "confirm";
};

export const orderLines = pgTable(
  "order_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    techniqueId: varchar("technique_id", { length: 36 }).references(() => techniques.id),
    fabricId: varchar("fabric_id", { length: 36 }).references(() => fabrics.id),
    recipeId: varchar("recipe_id", { length: 36 }).references(() => bomRecipes.id),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
  },
  (t) => ({
    orderIdx: index("order_lines_order_idx").on(t.orderId),
  }),
);

/**
 * Stackable decoration methods picked per order line — a garment can be
 * 100% sublimado AND also carry DTF/bordado for logos & sponsors, so the
 * selection is a set, not a single FK. order_lines.technique_id keeps the
 * first selected method for legacy readers (recipe matching, ficha técnica,
 * agent tools); this table is the authoritative full selection.
 */
export const orderLineTechniques = pgTable(
  "order_line_techniques",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    orderLineId: varchar("order_line_id", { length: 36 }).notNull().references(() => orderLines.id, { onDelete: "cascade" }),
    techniqueId: varchar("technique_id", { length: 36 }).notNull().references(() => techniques.id),
    /** Sell-price delta applied at line creation (product_techniques snapshot). */
    priceModifier: numeric("price_modifier", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lineTechniqueUnique: uniqueIndex("order_line_techniques_unique_idx").on(t.orderLineId, t.techniqueId),
    techniqueIdx: index("order_line_techniques_technique_idx").on(t.techniqueId),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    orderLineId: varchar("order_line_id", { length: 36 }).notNull().references(() => orderLines.id, { onDelete: "cascade" }),
    sizeId: varchar("size_id", { length: 36 }).references(() => sizes.id),
    individualName: varchar("individual_name", { length: 128 }),
    individualNumber: varchar("individual_number", { length: 32 }),
    status: productionStage("status").notNull().default("ingreso"),
  },
  (t) => ({
    lineIdx: index("order_items_line_idx").on(t.orderLineId),
  }),
);

/**
 * Opaque, short-lived proof for files uploaded before a public order exists.
 * Only the SHA-256 hash of the browser secret is persisted.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    secretHash: varchar("secret_hash", { length: 64 }).notNull(),
    status: uploadSessionStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiryIdx: index("upload_sessions_expiry_idx").on(t.status, t.expiresAt),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    orderId: varchar("order_id", { length: 36 }).references(() => orders.id, { onDelete: "cascade" }),
    organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "cascade" }),
    orderLineId: varchar("order_line_id", { length: 36 }).references(() => orderLines.id, { onDelete: "set null" }),
    orderItemId: varchar("order_item_id", { length: 36 }).references(() => orderItems.id, { onDelete: "set null" }),
    uploadSessionId: varchar("upload_session_id", { length: 36 }).references(() => uploadSessions.id, { onDelete: "set null" }),
    kind: attachmentKind("kind").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }),
    mimeType: varchar("mime_type", { length: 128 }),
    sizeBytes: integer("size_bytes"),
    url: text("url").notNull(),
    /** Provider-independent object identity. `url` remains for legacy/local previews. */
    storageKey: varchar("storage_key", { length: 512 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    status: attachmentStatus("status").notNull().default("pendiente_revision"),
    uploadedByRole: varchar("uploaded_by_role", { length: 32 }).notNull().default("cliente"),
    version: integer("version").notNull().default(1),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("attachments_order_idx").on(t.orderId),
    orgIdx: index("attachments_org_idx").on(t.organizationId),
    uploadSessionIdx: index("attachments_upload_session_idx").on(t.uploadSessionId, t.status),
  }),
);

export const applications = pgTable(
  "applications",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    attachmentId: varchar("attachment_id", { length: 36 }).notNull().references(() => attachments.id, { onDelete: "cascade" }),
    orderLineId: varchar("order_line_id", { length: 36 }).references(() => orderLines.id, { onDelete: "cascade" }),
    zone: varchar("zone", { length: 64 }).notNull(),
    view: applicationView("view").notNull().default("frente"),
    techniqueId: varchar("technique_id", { length: 36 }).references(() => techniques.id),
    widthCm: numeric("width_cm", { precision: 6, scale: 2 }),
    heightCm: numeric("height_cm", { precision: 6, scale: 2 }),
    quantity: integer("quantity").notNull().default(1),
    instructions: text("instructions"),
  },
  (t) => ({
    attachIdx: index("applications_attach_idx").on(t.attachmentId),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
    kind: paymentKind("kind").notNull(),
    method: paymentMethod("method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    reference: varchar("reference", { length: 128 }),
    notes: text("notes"),
    createdById: varchar("created_by_id", { length: 36 }).references(() => users.id),
    /** Soft-cancel: cancelled rows never count toward order totals. */
    cancelled: boolean("cancelled").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: varchar("cancelled_by", { length: 36 }).references(() => users.id),
  },
  (t) => ({
    orderIdx: index("payments_order_idx").on(t.orderId),
  }),
);

/**
 * Immutable audit trail for payment lifecycle. Rows are insert-only:
 * no update/delete path exists in the application.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    paymentId: varchar("payment_id", { length: 36 }).notNull().references(() => payments.id, { onDelete: "cascade" }),
    orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
    type: paymentEventType("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdById: varchar("created_by_id", { length: 36 }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("payment_events_order_idx").on(t.orderId),
    paymentIdx: index("payment_events_payment_idx").on(t.paymentId),
  }),
);

export const productionEvents = pgTable(
  "production_events",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: varchar("order_item_id", { length: 36 }).references(() => orderItems.id, { onDelete: "cascade" }),
    stage: productionStage("stage").notNull(),
    note: text("note"),
    userId: varchar("user_id", { length: 36 }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("prod_events_order_idx").on(t.orderId),
  }),
);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
  orders: many(orders),
  attachments: many(attachments),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
  leadIdentities: many(leadIdentities),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  materials: many(materials),
}));

export const materialsRelations = relations(materials, ({ one }) => ({
  supplierRef: one(suppliers, { fields: [materials.supplierId], references: [suppliers.id] }),
}));

export const garmentMoldsRelations = relations(garmentMolds, ({ many }) => ({
  products: many(products),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  organization: one(organizations, { fields: [orders.organizationId], references: [organizations.id] }),
  contact: one(contacts, { fields: [orders.contactId], references: [contacts.id] }),
  lines: many(orderLines),
  attachments: many(attachments),
  payments: many(payments),
  events: many(productionEvents),
}));

export const orderLinesRelations = relations(orderLines, ({ one, many }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderLines.productId], references: [products.id] }),
  technique: one(techniques, { fields: [orderLines.techniqueId], references: [techniques.id] }),
  fabric: one(fabrics, { fields: [orderLines.fabricId], references: [fabrics.id] }),
  items: many(orderItems),
  lineTechniques: many(orderLineTechniques),
}));

export const orderLineTechniquesRelations = relations(orderLineTechniques, ({ one }) => ({
  orderLine: one(orderLines, { fields: [orderLineTechniques.orderLineId], references: [orderLines.id] }),
  technique: one(techniques, { fields: [orderLineTechniques.techniqueId], references: [techniques.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  mold: one(garmentMolds, { fields: [products.moldId], references: [garmentMolds.id] }),
  sizes: many(sizes),
  recipes: many(bomRecipes),
  lines: many(orderLines),
  bundle: one(productBundles, { fields: [products.id], references: [productBundles.productId] }),
  bundleItems: many(productBundleItems),
  fabricOptions: many(productFabrics),
  techniqueOptions: many(productTechniques),
  volumeTiers: many(productVolumeTiers),
}));

export const fabricsRelations = relations(fabrics, ({ many }) => ({
  productLinks: many(productFabrics),
}));

export const productFabricsRelations = relations(productFabrics, ({ one }) => ({
  product: one(products, { fields: [productFabrics.productId], references: [products.id] }),
  fabric: one(fabrics, { fields: [productFabrics.fabricId], references: [fabrics.id] }),
}));

export const productTechniquesRelations = relations(productTechniques, ({ one }) => ({
  product: one(products, { fields: [productTechniques.productId], references: [products.id] }),
  technique: one(techniques, { fields: [productTechniques.techniqueId], references: [techniques.id] }),
}));

export const productVolumeTiersRelations = relations(productVolumeTiers, ({ one }) => ({
  product: one(products, { fields: [productVolumeTiers.productId], references: [products.id] }),
}));

export const productBundlesRelations = relations(productBundles, ({ one, many }) => ({
  product: one(products, { fields: [productBundles.productId], references: [products.id] }),
  items: many(productBundleItems),
}));

export const productBundleItemsRelations = relations(productBundleItems, ({ one }) => ({
  bundle: one(productBundles, { fields: [productBundleItems.bundleId], references: [productBundles.id] }),
  componentProduct: one(products, { fields: [productBundleItems.componentProductId], references: [products.id] }),
  componentSize: one(sizes, { fields: [productBundleItems.componentSizeId], references: [sizes.id] }),
}));

export const bomRecipesRelations = relations(bomRecipes, ({ one, many }) => ({
  product: one(products, { fields: [bomRecipes.productId], references: [products.id] }),
  size: one(sizes, { fields: [bomRecipes.sizeId], references: [sizes.id] }),
  technique: one(techniques, { fields: [bomRecipes.techniqueId], references: [techniques.id] }),
  items: many(bomItems),
}));

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  recipe: one(bomRecipes, { fields: [bomItems.recipeId], references: [bomRecipes.id] }),
  material: one(materials, { fields: [bomItems.materialId], references: [materials.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one, many }) => ({
  order: one(orders, { fields: [attachments.orderId], references: [orders.id] }),
  organization: one(organizations, { fields: [attachments.organizationId], references: [organizations.id] }),
  uploadSession: one(uploadSessions, { fields: [attachments.uploadSessionId], references: [uploadSessions.id] }),
  applications: many(applications),
}));

export const uploadSessionsRelations = relations(uploadSessions, ({ many }) => ({
  attachments: many(attachments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  events: many(paymentEvents),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, { fields: [paymentEvents.paymentId], references: [payments.id] }),
  order: one(orders, { fields: [paymentEvents.orderId], references: [orders.id] }),
}));

// ─── Agent platform (P0) ────────────────────────────────────────────────────
// Canonical omnichannel conversation record, agent configuration, session and
// memory state, idempotency and audit. Every message is persisted as a DB fact;
// the idempotency anchor is unique(channel, platform_message_id).

/** Tool identifiers enabled for the agent, resolved from config at runtime. */
export type AgentEnabledTools = string[];

export type AuditPayload = {
  before?: unknown;
  after?: unknown;
  error?: string;
  issues?: string[];
};

export type AgentRawPayload = Record<string, unknown>;

export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    customerId: varchar("customer_id", { length: 36 }).references(() => contacts.id, { onDelete: "set null" }),
    organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "set null" }),
    channel: channel("channel").notNull(),
    /**
     * Bound channel account (nullable). NULL marks a legacy install-global
     * thread. Identity is (channel, channel_account_id, external_thread_id)
     * for bound rows and (channel, external_thread_id) for legacy rows: a
     * provisioned account never adopts a legacy row and a conversation is
     * never rebound between accounts.
     */
    channelAccountId: varchar("channel_account_id", { length: 36 }).references(
      (): AnyPgColumn => channelAccounts.id,
      { onDelete: "restrict" },
    ),
    externalThreadId: varchar("external_thread_id", { length: 255 }).notNull(),
    status: conversationStatus("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountThreadUnique: uniqueIndex("conversations_account_thread_uq")
      .on(t.channel, t.channelAccountId, t.externalThreadId)
      .where(sql`${t.channelAccountId} is not null`),
    legacyThreadUnique: uniqueIndex("conversations_legacy_thread_uq")
      .on(t.channel, t.externalThreadId)
      .where(sql`${t.channelAccountId} is null`),
    channelAccountIdx: index("conversations_channel_account_idx").on(t.channel, t.channelAccountId),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
    channel: channel("channel").notNull(),
    /**
     * Account that delivered/authored this message (nullable). Dedup is
     * account-scoped: two provisioned accounts may carry the same platform
     * message id; legacy NULL-account rows dedup in their own partition.
     */
    channelAccountId: varchar("channel_account_id", { length: 36 }).references(
      (): AnyPgColumn => channelAccounts.id,
      { onDelete: "restrict" },
    ),
    platformMessageId: varchar("platform_message_id", { length: 255 }).notNull(),
    direction: messageDirection("direction").notNull(),
    senderKind: messageSenderKind("sender_kind").notNull(),
    senderRef: text("sender_ref"),
    contentType: messageContentType("content_type").notNull().default("text"),
    content: text("content").notNull().default(""),
    rawPayload: jsonb("raw_payload").$type<AgentRawPayload>(),
    deliveryState: messageDeliveryState("delivery_state").notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency anchor: duplicate provider deliveries never create new
    // facts. Scoped per account — the same platform_message_id may arrive once
    // per provisioned account; NULL-account rows keep the legacy partition.
    accountPlatformUnique: uniqueIndex("chat_messages_account_platform_uq")
      .on(t.channel, t.channelAccountId, t.platformMessageId)
      .where(sql`${t.channelAccountId} is not null`),
    legacyPlatformUnique: uniqueIndex("chat_messages_legacy_platform_uq")
      .on(t.channel, t.platformMessageId)
      .where(sql`${t.channelAccountId} is null`),
    conversationIdx: index("chat_messages_conversation_idx").on(t.conversationId, t.createdAt),
  }),
);

export const agentSessionStates = pgTable("agent_session_states", {
  conversationId: varchar("conversation_id", { length: 36 }).primaryKey().references(() => conversations.id, { onDelete: "cascade" }),
  kind: agentKind("kind").notNull(),
  summary: text("summary"),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSessionEvents = pgTable(
  "agent_session_events",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index("agent_session_events_conversation_idx").on(t.conversationId, t.createdAt),
  }),
);

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    scope: agentMemoryScope("scope").notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeKeyUnique: uniqueIndex("agent_memories_scope_key_unique_idx").on(t.scope, t.key),
  }),
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    response: jsonb("response").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    expiresIdx: index("idempotency_keys_expires_idx").on(t.expiresAt),
  }),
);

/**
 * Immutable audit trail for agent activity. Rows are insert-only: no
 * update/delete path exists in the application (mirrors payment_events).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    actorKind: auditActorKind("actor_kind").notNull().default("system"),
    actorRef: text("actor_ref"),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }),
    entityId: varchar("entity_id", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    payload: jsonb("payload").$type<AuditPayload>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actionIdx: index("audit_events_action_idx").on(t.action, t.createdAt),
    correlationIdx: index("audit_events_correlation_idx").on(t.correlationId),
  }),
);

/**
 * Singleton agent configuration (id = 1). Secrets are stored AES-256-GCM
 * encrypted (see src/lib/crypto/secret-box.ts) and are never returned. No
 * provider or model is hardcoded: both are DB-resolved.
 */
export const agentConfig = pgTable(
  "agent_config",
  {
    // Scope-aware rows share the table: the global default stays id = 1,
    // channel/account-scoped rows take ids from agent_config_id_seq.
    id: integer("id").primaryKey().default(sql`nextval('agent_config_id_seq')`),
    provider: text("provider"),
    model: text("model"),
    systemPrompt: text("system_prompt"),
    enabledTools: jsonb("enabled_tools").$type<AgentEnabledTools>().notNull().default(sql`'[]'::jsonb`),
    botTokenEnc: text("bot_token_enc"),
    providerKeyEnc: text("provider_key_enc"),
    webhookSecretEnc: text("webhook_secret_enc"),
    /**
     * Provider endpoint/base URL chosen in /admin/agent (catalog default or
     * manual). Not a secret — the API key stays in `providerKeyEnc`.
     */
    providerEndpointUrl: text("provider_endpoint_url"),
    /**
     * Kill-switch (G-01): the scoped dispatcher replies only while enabled.
     * Defaults true so existing installs keep their behavior after migration.
     */
    enabled: boolean("enabled").notNull().default(true),
    /**
     * First-contact auto-reply (A-03): when enabled, the inbound pipeline
     * sends `autoReply24hMessage` once per conversation (durable claim).
     */
    autoReply24h: boolean("auto_reply_24h").notNull().default(false),
    autoReply24hMessage: text("auto_reply_24h_message"),
    /**
     * Web-order redirect (A-08): exposes the public /presupuesto link to the
     * sales agent so it can offer the wizard when a customer wants to order.
     */
    webOrderRedirectEnabled: boolean("web_order_redirect_enabled").notNull().default(false),
    webOrderRedirectMessage: text("web_order_redirect_message"),
    /**
     * Per-scope provider credentials (A-15): a channel account whose
     * `credentialsRef` is `agent_config` resolves these encrypted fields
     * through account → channel → global scoping (env:PREFIX stays fallback).
     *
     * Each credential column resolves INDEPENDENTLY through that chain: the
     * first scope holding a non-empty value for the field wins, so a scoped
     * row created only to change `enabled` (or another flag) does not hide a
     * parent scope's credential. Empty everywhere → provider env scope, then
     * fail closed (`MissingScopedCredentialError`).
     */
    ycloudApiKeyEnc: text("ycloud_api_key_enc"),
    ycloudWebhookSecretEnc: text("ycloud_webhook_secret_enc"),
    kapsoApiKeyEnc: text("kapso_api_key_enc"),
    kapsoWebhookSecretEnc: text("kapso_webhook_secret_enc"),
    zernioApiKeyEnc: text("zernio_api_key_enc"),
    zernioWebhookSecretEnc: text("zernio_webhook_secret_enc"),
    /**
     * Resolution scope (account → channel → global):
     *   channel NULL + channelAccountId NULL → global default (id = 1)
     *   channel set  + channelAccountId NULL → channel-scoped row
     *   channelAccountId set                 → per-account row (channel
     *                                          informative-only)
     */
    channel: channel("channel"),
    channelAccountId: varchar("channel_account_id", { length: 36 }).references(
      (): AnyPgColumn => channelAccounts.id,
      { onDelete: "cascade" },
    ),
    updatedById: varchar("updated_by_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelAccountUq: uniqueIndex("agent_config_channel_account_uq")
      .on(t.channelAccountId)
      .where(sql`${t.channelAccountId} is not null`),
    channelScopeUq: uniqueIndex("agent_config_channel_scope_uq")
      .on(t.channel)
      .where(sql`${t.channel} is not null and ${t.channelAccountId} is null`),
  }),
);

// ─── Channel accounts, events & lead identities (multichannel port) ────────

/**
 * One row per connected provider account/sender: a WhatsApp Business number
 * via YCloud, a social account via Zernio, a Telegram bot.
 *
 * `credentialsRef` stores WHERE the secrets live — `env:YCLOUD_*`-style
 * prefixes, `agent_config`, or a future vault reference — never the secret
 * itself. `tenantId` stays the constant "default": single install, no
 * tenancy logic.
 */
export const channelAccounts = pgTable(
  "channel_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: text("tenant_id").notNull().default("default"),
    provider: text("provider").notNull(),
    channel: channel("channel").notNull(),
    /** Provider's own account id: ycloud E.164 sender · zernio account id · telegram bot id. */
    providerAccountId: text("provider_account_id").notNull(),
    /** E.164 number, @handle, or page id — the surface customers see. */
    senderAddress: text("sender_address").notNull(),
    displayName: text("display_name"),
    credentialsRef: text("credentials_ref"),
    /** Optional explicit binding to an agent_config row (resolved after the account-scope row). */
    agentConfigId: integer("agent_config_id").references((): AnyPgColumn => agentConfig.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerAccountUq: uniqueIndex("channel_accounts_provider_account_uq").on(t.provider, t.providerAccountId),
  }),
);

/**
 * Durable, idempotent provider events that have no conversation/message row:
 * status transitions, account lifecycle facts, other normalized envelopes.
 * The raw envelope stays in `payload` for audit/replay.
 */
export const channelEvents = pgTable(
  "channel_events",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: text("tenant_id").notNull().default("default"),
    provider: text("provider").notNull(),
    channel: channel("channel"),
    channelAccountId: varchar("channel_account_id", { length: 36 }).references(
      (): AnyPgColumn => channelAccounts.id,
      { onDelete: "set null" },
    ),
    providerAccountId: text("provider_account_id"),
    deliveryId: text("delivery_id").notNull(),
    platformMessageId: text("platform_message_id"),
    kind: text("kind").notNull(),
    direction: text("direction").notNull(),
    status: text("status"),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Delivery-id uniqueness is per ACCOUNT: provider redeliveries fan out
    // once per channel account; COALESCE keeps legacy NULL-account rows in
    // their own partition.
    providerDeliveryUq: uniqueIndex("channel_events_provider_delivery_uq")
      .on(t.provider, sql`coalesce(${t.channelAccountId}, '')`, t.deliveryId),
    providerPlatformUq: uniqueIndex("channel_events_provider_platform_uq")
      .on(t.provider, t.platformMessageId, t.kind, t.status)
      .where(sql`${t.platformMessageId} is not null and ${t.status} is not null`),
    accountLookupIdx: index("channel_events_account_created_idx").on(t.channelAccountId, t.createdAt),
    platformLookupIdx: index("channel_events_provider_platform_idx").on(t.provider, t.platformMessageId),
  }),
);

/**
 * One contact ↔ N channel identities. Social leads may have no phone: the
 * identity lives here keyed by (channel, external_id), where external_id is
 * the canonical per-channel identity key (digits-normalized for phone
 * channels, the provider id verbatim for social channels).
 */
export const leadIdentities = pgTable(
  "lead_identities",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: text("tenant_id").notNull().default("default"),
    contactId: varchar("contact_id", { length: 36 }).notNull().references(() => contacts.id, { onDelete: "cascade" }),
    channel: channel("channel").notNull(),
    externalId: text("external_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelExternalUq: uniqueIndex("lead_identities_channel_external_uq").on(t.channel, t.externalId),
    contactIdx: index("lead_identities_contact_idx").on(t.contactId),
  }),
);

/**
 * Durable inbound-turn queue (gap A-02). Every accepted inbound message
 * enqueues a job keyed `turn:<conversation_id>` alongside the in-process
 * debounce flush: the durable copy is what survives a restart. A partial
 * unique index keeps at most one LIVE (queued/running) job per conversation,
 * so debounce coalescing holds at the durable layer too. `status='dead'` is
 * the DLQ surfaced by /api/admin/dlq and /admin/agent/dlq.
 *
 * Un-migrated installs degrade to the in-memory buffer (the queue layer
 * swallows 42P01) — matching the wave-1 migration-tolerance contract.
 */
export const agentInboundJobs = pgTable(
  "agent_inbound_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    tenantId: text("tenant_id").notNull().default("default"),
    dedupKey: text("dedup_key").notNull(),
    channel: channel("channel").notNull(),
    channelAccountId: varchar("channel_account_id", { length: 36 }).references(
      (): AnyPgColumn => channelAccounts.id,
      { onDelete: "set null" },
    ),
    conversationId: varchar("conversation_id", { length: 36 }).notNull().references(
      (): AnyPgColumn => conversations.id,
      { onDelete: "cascade" },
    ),
    /** Buffer key (account-scoped sender id) — ops correlation, never logged raw. */
    conversationKey: text("conversation_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    liveDedupUq: uniqueIndex("agent_inbound_jobs_live_dedup_uq")
      .on(t.dedupKey)
      .where(sql`${t.status} in ('queued', 'running')`),
    claimIdx: index("agent_inbound_jobs_claim_idx")
      .on(t.runAfter)
      .where(sql`${t.status} = 'queued'`),
    statusCreatedIdx: index("agent_inbound_jobs_status_created_idx").on(t.status, t.createdAt),
  }),
);

/**
 * Marketing/attribution leads (W6 port of SocialCRM `leads`). Distinct from
 * `contacts`: a lead is a top-of-funnel capture (ad click, wa.me ref link,
 * public signup) carrying UTM/ad attribution; it links to a contact once the
 * conversation materializes.
 *
 * `channelAccountId` is the FIRST-attribution account: set once at capture
 * and only ever filled while NULL — traffic on another account never migrates
 * ownership. `phone` is the dedup key for messaging leads; social leads may
 * keep NULL phone with the identity in `lead_identities`.
 */
export const leads = pgTable(
  "leads",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }),
    phone: varchar("phone", { length: 64 }).unique(),
    channel: channel("channel"),
    externalUserId: text("external_user_id"),
    channelAccountId: varchar("channel_account_id", { length: 36 }).references(() => channelAccounts.id, { onDelete: "set null" }),
    contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id, { onDelete: "set null" }),
    email: varchar("email", { length: 255 }),
    firstMessage: text("first_message"),
    lastMessage: text("last_message"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    refCode: varchar("ref_code", { length: 255 }),
    utmSource: varchar("utm_source", { length: 255 }),
    utmMedium: varchar("utm_medium", { length: 255 }),
    utmCampaign: varchar("utm_campaign", { length: 255 }),
    utmContent: varchar("utm_content", { length: 255 }),
    adId: varchar("ad_id", { length: 255 }),
    campaignId: varchar("campaign_id", { length: 255 }),
    adsetId: varchar("adset_id", { length: 255 }),
    platform: varchar("platform", { length: 100 }),
    status: leadStatus("status").notNull().default("nuevo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelExternalUq: uniqueIndex("leads_channel_external_uq")
      .on(t.channel, t.externalUserId)
      .where(sql`${t.externalUserId} is not null`),
    channelAccountIdx: index("leads_channel_account_idx").on(t.channelAccountId),
    contactIdx: index("leads_contact_idx").on(t.contactId),
    createdIdx: index("leads_created_idx").on(t.createdAt),
  }),
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  customer: one(contacts, { fields: [conversations.customerId], references: [contacts.id] }),
  organization: one(organizations, { fields: [conversations.organizationId], references: [organizations.id] }),
  account: one(channelAccounts, { fields: [conversations.channelAccountId], references: [channelAccounts.id] }),
  messages: many(chatMessages),
  sessionState: one(agentSessionStates, { fields: [conversations.id], references: [agentSessionStates.conversationId] }),
  events: many(agentSessionEvents),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [chatMessages.conversationId], references: [conversations.id] }),
  account: one(channelAccounts, { fields: [chatMessages.channelAccountId], references: [channelAccounts.id] }),
}));

export const agentSessionStatesRelations = relations(agentSessionStates, ({ one }) => ({
  conversation: one(conversations, { fields: [agentSessionStates.conversationId], references: [conversations.id] }),
}));

export const agentSessionEventsRelations = relations(agentSessionEvents, ({ one }) => ({
  conversation: one(conversations, { fields: [agentSessionEvents.conversationId], references: [conversations.id] }),
}));

export const agentConfigRelations = relations(agentConfig, ({ one }) => ({
  updatedBy: one(users, { fields: [agentConfig.updatedById], references: [users.id] }),
  account: one(channelAccounts, { fields: [agentConfig.channelAccountId], references: [channelAccounts.id] }),
}));

export const channelAccountsRelations = relations(channelAccounts, ({ one, many }) => ({
  agentConfig: one(agentConfig, { fields: [channelAccounts.agentConfigId], references: [agentConfig.id] }),
  scopedConfigs: many(agentConfig),
  conversations: many(conversations),
  chatMessages: many(chatMessages),
  channelEvents: many(channelEvents),
}));

export const channelEventsRelations = relations(channelEvents, ({ one }) => ({
  account: one(channelAccounts, { fields: [channelEvents.channelAccountId], references: [channelAccounts.id] }),
}));

export const agentInboundJobsRelations = relations(agentInboundJobs, ({ one }) => ({
  conversation: one(conversations, { fields: [agentInboundJobs.conversationId], references: [conversations.id] }),
  account: one(channelAccounts, { fields: [agentInboundJobs.channelAccountId], references: [channelAccounts.id] }),
}));

export const leadIdentitiesRelations = relations(leadIdentities, ({ one }) => ({
  contact: one(contacts, { fields: [leadIdentities.contactId], references: [contacts.id] }),
}));

// ---------------------------------------------------------------------------
// Wave 9 — SocialCRM parity (additive; see docs/12-SOCIALCRM-PARITY-AUDIT.md)
// ---------------------------------------------------------------------------

export const orderContextStatus = pgEnum("order_context_status", ["active", "ordered", "removed"]);
export const cashSessionStatus = pgEnum("cash_session_status", ["open", "closed"]);

/**
 * A-09: conversation-scoped pre-draft cart. Rows are transient: each add
 * refreshes `expiresAt` (30 min TTL) and the sales agent drafts an order from
 * the active, unexpired rows only. `productName`/`techniqueName` are snapshots
 * so a deleted catalog row can't corrupt pending context.
 */
export const orderContextItems = pgTable(
  "order_context_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id", { length: 36 })
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 64 }).notNull().default(""),
    productId: varchar("product_id", { length: 36 }).references(() => products.id, { onDelete: "set null" }),
    productName: varchar("product_name", { length: 255 }).notNull(),
    sizeLabel: varchar("size_label", { length: 32 }),
    techniqueName: varchar("technique_name", { length: 128 }),
    quantity: integer("quantity").notNull().default(1),
    notes: text("notes"),
    status: orderContextStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    convStatusIdx: index("order_context_items_conv_status_idx").on(t.conversationId, t.status, t.expiresAt),
  }),
);

/**
 * A-14/C-04: named promotions composed of real catalog products. `items`
 * denormalizes productId+productName+quantity so the row survives renames;
 * `customPrice` is a full-promo override (NULL = sum of live prices).
 */
export const promotions = pgTable(
  "promotions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    items: jsonb("items").$type<Array<{ productId: string; productName: string; quantity: number }>>().notNull().default(sql`'[]'::jsonb`),
    customPrice: numeric("custom_price", { precision: 12, scale: 2 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index("promotions_active_idx").on(t.active, t.createdAt),
  }),
);

/**
 * A-13: physical cash drawer for in-person pickup payments. Sessions chain:
 * each opens where the previous closed (openingCash = previous actualCash,
 * openedAt = previous closedAt). A closed session is immutable — the app layer
 * exposes no update/delete path, and `report` is the frozen audit seat.
 */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    status: cashSessionStatus("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
    expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }),
    actualCash: numeric("actual_cash", { precision: 12, scale: 2 }),
    difference: numeric("difference", { precision: 12, scale: 2 }),
    closedBy: varchar("closed_by", { length: 100 }),
    report: jsonb("report").$type<Record<string, unknown>>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("cash_sessions_status_idx").on(t.status, t.openedAt),
  }),
);

/** A-13: manual cash in/out inside a session (payments also count — see lib). */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    sessionId: varchar("session_id", { length: 36 }).notNull().references(() => cashSessions.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 10 }).notNull(), // 'in' | 'out'
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    createdBy: varchar("created_by", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("cash_movements_session_idx").on(t.sessionId, t.createdAt),
  }),
);

export const orderContextItemsRelations = relations(orderContextItems, ({ one }) => ({
  conversation: one(conversations, { fields: [orderContextItems.conversationId], references: [conversations.id] }),
  product: one(products, { fields: [orderContextItems.productId], references: [products.id] }),
}));

export const cashSessionsRelations = relations(cashSessions, ({ many }) => ({
  movements: many(cashMovements),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  session: one(cashSessions, { fields: [cashMovements.sessionId], references: [cashSessions.id] }),
}));

/**
 * File bytes for STORAGE_PROVIDER=db — migration 0025_stored_files.
 * neon-http has no binary params: `toDriver` ships bytea as a `\x` hex
 * literal; `fromDriver` tolerates both the `\x…` hex string the driver
 * returns and a raw Uint8Array in case the wire format ever changes.
 */
const bytea = customType<{
  data: Buffer;
  driverData: string | Uint8Array;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value) {
    if (typeof value !== "string") return Buffer.from(value);
    return Buffer.from(value.startsWith("\\x") ? value.slice(2) : value, "hex");
  },
});

export const storedFiles = pgTable(
  "stored_files",
  {
    path: text("path").primaryKey(),
    scope: text("scope").notNull(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index("stored_files_scope_idx").on(t.scope),
  }),
);
