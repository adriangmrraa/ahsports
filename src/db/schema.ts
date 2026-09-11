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
  active: boolean("active").notNull().default(true),
});

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

export const contactsRelations = relations(contacts, ({ one }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
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
  items: many(orderItems),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  mold: one(garmentMolds, { fields: [products.moldId], references: [garmentMolds.id] }),
  sizes: many(sizes),
  recipes: many(bomRecipes),
  lines: many(orderLines),
  bundle: one(productBundles, { fields: [products.id], references: [productBundles.productId] }),
  bundleItems: many(productBundleItems),
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
