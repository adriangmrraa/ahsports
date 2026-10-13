-- 0000_core_schema.sql — baseline idempotente del esquema base de AH Sports OS.
-- Crea enums, tablas, índices y constraints definidos en src/db/schema.ts (más los
-- constraints que agregan 0001..0010) en su forma final. Es idempotente: seguro
-- tanto en una base PostgreSQL virgen como sobre la base Neon existente, porque
-- usa CREATE ... IF NOT EXISTS y guards `duplicate_object`. Al crear todo, las
-- migraciones incrementales 0001..0010 quedan como no-ops históricas en una base
-- nueva (todas usan guards idempotentes).

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "user_role" AS ENUM ('admin', 'disenador', 'operario', 'gerencia'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "order_status" AS ENUM ('borrador', 'presupuesto_enviado', 'aprobado', 'seniado', 'en_produccion', 'corte', 'confeccion', 'estampado', 'control', 'entregado', 'cancelado', 'bloqueado_pago'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "production_stage" AS ENUM ('ingreso', 'corte', 'confeccion', 'estampado', 'control', 'entrega'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "payment_method" AS ENUM ('efectivo', 'transferencia', 'cheque', 'mercadopago', 'otro'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "payment_kind" AS ENUM ('sena', 'pago', 'saldo'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "payment_event_type" AS ENUM ('registered', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "attachment_kind" AS ENUM ('identidad_organizacion', 'sponsor', 'diseno_pedido', 'personalizacion_individual', 'documento_operativo', 'produccion_calidad'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "attachment_status" AS ENUM ('pendiente_revision', 'aprobado', 'requiere_reemplazo', 'rechazado', 'archivado'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "upload_session_status" AS ENUM ('active', 'consumed', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "application_view" AS ENUM ('frente', 'espalda', 'lateral', 'manga', 'otro'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "organization_kind" AS ENUM ('club', 'empresa', 'colegio', 'institucion', 'particular'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "lead_status" AS ENUM ('nuevo', 'contactado', 'calificado', 'convertido', 'perdido'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "material_unit" AS ENUM ('metro', 'kilo', 'unidad', 'centimetro', 'mililitro', 'metro_cuadrado', 'rollo'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "bom_consumption_mode" AS ENUM ('direct', 'yield'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "garment_family" AS ENUM ('parte_superior', 'campera', 'pantalon', 'short_futbol', 'bermuda', 'accesorio'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "garment_type" AS ENUM ('remera', 'chomba', 'camiseta', 'campera', 'pantalon', 'short', 'bermuda', 'conjunto', 'accesorio'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "product_kind" AS ENUM ('garment', 'bundle'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "bundle_size_mode" AS ENUM ('same_label', 'fixed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "product_taxonomy_node_kind" AS ENUM ('category', 'subcategory', 'type'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "channel" AS ENUM ('telegram', 'whatsapp'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "message_sender_kind" AS ENUM ('customer', 'agent', 'operator'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "message_content_type" AS ENUM ('text', 'image', 'document', 'system'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "message_delivery_state" AS ENUM ('received', 'queued', 'sent', 'failed', 'imported'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "conversation_status" AS ENUM ('open', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "agent_kind" AS ENUM ('customer', 'operator'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "agent_memory_scope" AS ENUM ('customer', 'operator', 'global'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "audit_actor_kind" AS ENUM ('system', 'user', 'agent', 'channel'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Tablas (orden de dependencias) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "users" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" text NOT NULL,
  "name" varchar(255) NOT NULL,
  "role" "user_role" DEFAULT 'operario' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "organization_kind" DEFAULT 'club' NOT NULL,
  "name" varchar(255) NOT NULL,
  "tax_id" varchar(64),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" varchar(36),
  "name" varchar(255) NOT NULL,
  "email" varchar(255),
  "phone" varchar(64),
  "role" varchar(128),
  "notes" text,
  "status" "lead_status" DEFAULT 'nuevo' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(64),
  "email" varchar(255),
  "address" varchar(255),
  "contact_name" varchar(255),
  "tax_id" varchar(64),
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "materials" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "category" varchar(128) NOT NULL,
  "unit" "material_unit" NOT NULL,
  "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "supplier" varchar(255),
  "supplier_id" varchar(36),
  "color" varchar(64),
  "width" numeric(8, 2),
  "grams_per_meter" numeric(8, 2),
  "meters_per_kilo" numeric(8, 2),
  "yield_percent" numeric(5, 2) DEFAULT '85' NOT NULL,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "materials_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "techniques" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "cost_per_unit" numeric(12, 2) DEFAULT '0' NOT NULL,
  "cost_per_square_meter" numeric(12, 2) DEFAULT '0' NOT NULL,
  "setup_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
  "description" text,
  "active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "garment_molds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "family" "garment_family" NOT NULL,
  "measurement_schema" jsonb DEFAULT '{"required":[],"optional":[]}'::jsonb NOT NULL,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sku" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "category" varchar(128),
  "product_kind" "product_kind" DEFAULT 'garment' NOT NULL,
  "product_category" varchar(128) DEFAULT 'indumentaria' NOT NULL,
  "product_subcategory" varchar(128) DEFAULT 'prendas' NOT NULL,
  "product_type" varchar(128) DEFAULT 'otro' NOT NULL,
  "garment_family" "garment_family",
  "garment_type" "garment_type",
  "mold_id" varchar(36),
  "image_url" text,
  "base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "min_order" integer DEFAULT 1 NOT NULL,
  "zones" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "products_sku_unique" UNIQUE("sku"),
  CONSTRAINT "products_mold_id_garment_molds_id_fk" FOREIGN KEY ("mold_id") REFERENCES "garment_molds"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "product_taxonomy_nodes" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "product_taxonomy_node_kind" NOT NULL,
  "value" varchar(128) NOT NULL,
  "label" varchar(255) NOT NULL,
  "parent_id" varchar(36),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_taxonomy_nodes_parent_id_product_taxonomy_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "product_taxonomy_nodes"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "sizes" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" varchar(36) NOT NULL,
  "label" varchar(32) NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "measurements" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "sizes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "product_bundles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" varchar(36) NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_bundles_product_id_unique" UNIQUE("product_id"),
  CONSTRAINT "product_bundles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "product_bundle_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bundle_id" varchar(36) NOT NULL,
  "component_product_id" varchar(36) NOT NULL,
  "quantity" numeric(8, 2) DEFAULT '1' NOT NULL,
  "size_mode" "bundle_size_mode" DEFAULT 'same_label' NOT NULL,
  "component_size_id" varchar(36),
  CONSTRAINT "product_bundle_items_quantity_ck" CHECK ("quantity" > 0),
  CONSTRAINT "product_bundle_items_bundle_id_product_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "product_bundles"("id") ON DELETE CASCADE,
  CONSTRAINT "product_bundle_items_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "product_bundle_items_component_size_id_sizes_id_fk" FOREIGN KEY ("component_size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "bom_recipes" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" varchar(36) NOT NULL,
  "size_id" varchar(36),
  "technique_id" varchar(36),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bom_recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "bom_recipes_size_id_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT,
  CONSTRAINT "bom_recipes_technique_id_techniques_id_fk" FOREIGN KEY ("technique_id") REFERENCES "techniques"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "bom_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" varchar(36) NOT NULL,
  "material_id" varchar(36) NOT NULL,
  "consumption_mode" "bom_consumption_mode" DEFAULT 'direct' NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "direct_quantity" numeric(12, 4),
  "units_per_consumption_unit" numeric(12, 4),
  "waste_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  CONSTRAINT "bom_items_consumption_data_ck" CHECK (
    ("consumption_mode" = 'direct' AND "direct_quantity" IS NOT NULL AND "direct_quantity" > 0 AND "units_per_consumption_unit" IS NULL)
    OR
    ("consumption_mode" = 'yield' AND "units_per_consumption_unit" IS NOT NULL AND "units_per_consumption_unit" > 0 AND "direct_quantity" IS NULL)
  ),
  CONSTRAINT "bom_items_recipe_id_bom_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "bom_recipes"("id") ON DELETE CASCADE,
  CONSTRAINT "bom_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "materials"("id")
);

CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "margin_percent" numeric(5, 2) DEFAULT '40' NOT NULL,
  "urgent_surcharge" numeric(5, 2) DEFAULT '15' NOT NULL,
  "min_advance_percent" numeric(5, 2) DEFAULT '50' NOT NULL,
  "rounding" numeric(12, 2) DEFAULT '100' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "orders" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "number" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  "public_token" varchar(64) NOT NULL,
  "organization_id" varchar(36),
  "contact_id" varchar(36),
  "status" "order_status" DEFAULT 'borrador' NOT NULL,
  "urgent" boolean DEFAULT false NOT NULL,
  "notes" text,
  "internal_notes" text,
  "pricing_rule_id" varchar(36),
  "snapshot" jsonb,
  "snapshot_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "total_quoted" numeric(14, 2) DEFAULT '0' NOT NULL,
  "total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
  "margin_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "created_by_id" varchar(36),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "orders_public_token_unique" UNIQUE("public_token"),
  CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL,
  CONSTRAINT "orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "orders_pricing_rule_id_pricing_rules_id_fk" FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules"("id"),
  CONSTRAINT "orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "order_lines" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" varchar(36) NOT NULL,
  "product_id" varchar(36) NOT NULL,
  "technique_id" varchar(36),
  "recipe_id" varchar(36),
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "unit_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
  "notes" text,
  CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id"),
  CONSTRAINT "order_lines_technique_id_techniques_id_fk" FOREIGN KEY ("technique_id") REFERENCES "techniques"("id"),
  CONSTRAINT "order_lines_recipe_id_bom_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "bom_recipes"("id")
);

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_line_id" varchar(36) NOT NULL,
  "size_id" varchar(36),
  "individual_name" varchar(128),
  "individual_number" varchar(32),
  "status" "production_stage" DEFAULT 'ingreso' NOT NULL,
  CONSTRAINT "order_items_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE CASCADE,
  CONSTRAINT "order_items_size_id_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "sizes"("id")
);

CREATE TABLE IF NOT EXISTS "upload_sessions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "secret_hash" varchar(64) NOT NULL,
  "status" "upload_session_status" DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" varchar(36),
  "organization_id" varchar(36),
  "order_line_id" varchar(36),
  "order_item_id" varchar(36),
  "upload_session_id" varchar(36),
  "kind" "attachment_kind" NOT NULL,
  "name" varchar(255) NOT NULL,
  "original_name" varchar(255),
  "mime_type" varchar(128),
  "size_bytes" integer,
  "url" text NOT NULL,
  "storage_key" varchar(512),
  "expires_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "status" "attachment_status" DEFAULT 'pendiente_revision' NOT NULL,
  "uploaded_by_role" varchar(32) DEFAULT 'cliente' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attachments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "attachments_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL,
  CONSTRAINT "attachments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL,
  CONSTRAINT "attachments_upload_session_id_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "upload_sessions"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "applications" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attachment_id" varchar(36) NOT NULL,
  "order_line_id" varchar(36),
  "zone" varchar(64) NOT NULL,
  "view" "application_view" DEFAULT 'frente' NOT NULL,
  "technique_id" varchar(36),
  "width_cm" numeric(6, 2),
  "height_cm" numeric(6, 2),
  "quantity" integer DEFAULT 1 NOT NULL,
  "instructions" text,
  CONSTRAINT "applications_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE,
  CONSTRAINT "applications_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE CASCADE,
  CONSTRAINT "applications_technique_id_techniques_id_fk" FOREIGN KEY ("technique_id") REFERENCES "techniques"("id")
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" varchar(36) NOT NULL,
  "kind" "payment_kind" NOT NULL,
  "method" "payment_method" NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "date" timestamp with time zone DEFAULT now() NOT NULL,
  "reference" varchar(128),
  "notes" text,
  "created_by_id" varchar(36),
  "cancelled" boolean DEFAULT false NOT NULL,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" varchar(36),
  CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
  CONSTRAINT "payments_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" varchar(36) NOT NULL,
  "order_id" varchar(36) NOT NULL,
  "type" "payment_event_type" NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "created_by_id" varchar(36),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE,
  CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "payment_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "production_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" varchar(36) NOT NULL,
  "order_item_id" varchar(36),
  "stage" "production_stage" NOT NULL,
  "note" text,
  "user_id" varchar(36),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "production_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "production_events_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE,
  CONSTRAINT "production_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" varchar(128) PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" varchar(36),
  "organization_id" varchar(36),
  "channel" "channel" NOT NULL,
  "external_thread_id" varchar(255) NOT NULL,
  "status" "conversation_status" DEFAULT 'open' NOT NULL,
  "last_message_at" timestamp with time zone,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversations_customer_id_contacts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" varchar(36) NOT NULL,
  "channel" "channel" NOT NULL,
  "platform_message_id" varchar(255) NOT NULL,
  "direction" "message_direction" NOT NULL,
  "sender_kind" "message_sender_kind" NOT NULL,
  "sender_ref" text,
  "content_type" "message_content_type" DEFAULT 'text' NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "raw_payload" jsonb,
  "delivery_state" "message_delivery_state" DEFAULT 'received' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "agent_session_states" (
  "conversation_id" varchar(36) PRIMARY KEY NOT NULL,
  "kind" "agent_kind" NOT NULL,
  "summary" text,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_session_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "agent_session_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" varchar(36) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_session_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "agent_memories" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" "agent_memory_scope" NOT NULL,
  "key" varchar(255) NOT NULL,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "key" text PRIMARY KEY NOT NULL,
  "scope" varchar(64) NOT NULL,
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_kind" "audit_actor_kind" DEFAULT 'system' NOT NULL,
  "actor_ref" text,
  "action" varchar(128) NOT NULL,
  "entity_type" varchar(64),
  "entity_id" varchar(64),
  "correlation_id" varchar(64),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_config" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "provider" text,
  "model" text,
  "system_prompt" text,
  "enabled_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "bot_token_enc" text,
  "provider_key_enc" text,
  "webhook_secret_enc" text,
  "updated_by_id" varchar(36),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_config_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "agent_config_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- ─── Índices y constraints únicos ────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_name_unique_idx"
  ON "suppliers" (lower(btrim("name")))
  WHERE btrim("name") <> '';

CREATE INDEX IF NOT EXISTS "product_taxonomy_nodes_parent_idx" ON "product_taxonomy_nodes" ("parent_id");
CREATE INDEX IF NOT EXISTS "product_taxonomy_nodes_lookup_idx" ON "product_taxonomy_nodes" ("kind", "parent_id", "value");
CREATE UNIQUE INDEX IF NOT EXISTS "product_taxonomy_nodes_unique_value_idx" ON "product_taxonomy_nodes" ("kind", coalesce("parent_id", ''), "value");

CREATE INDEX IF NOT EXISTS "product_bundle_items_bundle_idx" ON "product_bundle_items" USING btree ("bundle_id");
CREATE INDEX IF NOT EXISTS "products_garment_family_idx" ON "products" USING btree ("garment_family");
CREATE INDEX IF NOT EXISTS "products_taxonomy_idx" ON "products" USING btree ("product_category", "product_subcategory", "product_type");

CREATE INDEX IF NOT EXISTS "bom_product_idx" ON "bom_recipes" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "bom_items_recipe_idx" ON "bom_items" USING btree ("recipe_id");
CREATE INDEX IF NOT EXISTS "bom_items_consumption_mode_idx" ON "bom_items" USING btree ("consumption_mode");

CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "orders_org_idx" ON "orders" USING btree ("organization_id");

CREATE INDEX IF NOT EXISTS "order_lines_order_idx" ON "order_lines" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "order_items_line_idx" ON "order_items" USING btree ("order_line_id");

CREATE INDEX IF NOT EXISTS "upload_sessions_expiry_idx" ON "upload_sessions" USING btree ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "attachments_order_idx" ON "attachments" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "attachments_org_idx" ON "attachments" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "attachments_upload_session_idx" ON "attachments" USING btree ("upload_session_id", "status");

CREATE INDEX IF NOT EXISTS "applications_attach_idx" ON "applications" USING btree ("attachment_id");

CREATE INDEX IF NOT EXISTS "payments_order_idx" ON "payments" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "payment_events_order_idx" ON "payment_events" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");

CREATE INDEX IF NOT EXISTS "prod_events_order_idx" ON "production_events" USING btree ("order_id");

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_channel_thread_unique_idx" ON "conversations" ("channel", "external_thread_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_platform_unique_idx" ON "chat_messages" ("channel", "platform_message_id");
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_idx" ON "chat_messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_session_events_conversation_idx" ON "agent_session_events" ("conversation_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_memories_scope_key_unique_idx" ON "agent_memories" ("scope", "key");
CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_idx" ON "idempotency_keys" ("expires_at");
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events" ("action", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_correlation_idx" ON "audit_events" ("correlation_id");
