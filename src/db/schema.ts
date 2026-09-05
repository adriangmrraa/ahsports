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

export const materials = pgTable("materials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }).notNull(),
  unit: materialUnit("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  supplier: varchar("supplier", { length: 255 }),
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

export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
  minOrder: integer("min_order").notNull().default(1),
  zones: jsonb("zones").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sizes = pgTable("sizes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 32 }).notNull(),
  order: integer("order").notNull().default(0),
  measurements: jsonb("measurements").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
});

export const bomRecipes = pgTable(
  "bom_recipes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
    sizeId: varchar("size_id", { length: 36 }).references(() => sizes.id, { onDelete: "cascade" }),
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
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
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

export type PricingSnapshot = {
  rule: { id: string; name: string; marginPercent: number; urgentSurcharge: number; minAdvancePercent: number };
  lines: Array<{
    orderLineId?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    subtotal: number;
    materials: Array<{ name: string; totalQuantity: number; unit: string }>;
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

export const productsRelations = relations(products, ({ many }) => ({
  sizes: many(sizes),
  recipes: many(bomRecipes),
  lines: many(orderLines),
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
