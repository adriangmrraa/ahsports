-- Wave 9 (A-09): order_context_items — conversation-scoped cart for the sales
-- agent. Items are transient pre-draft state: each add refreshes a 30-minute
-- TTL (see src/lib/order-context.ts). Additive and idempotent; creates no rows.

DO $$ BEGIN CREATE TYPE "order_context_status" AS ENUM ('active', 'ordered', 'removed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "order_context_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar(36) NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "phone" varchar(64) NOT NULL DEFAULT '',
  "product_id" varchar(36) REFERENCES "products"("id") ON DELETE SET NULL,
  "product_name" varchar(255) NOT NULL,
  "size_label" varchar(32),
  "technique_name" varchar(128),
  "quantity" integer NOT NULL DEFAULT 1,
  "notes" text,
  "status" "order_context_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "order_context_items_conv_status_idx"
  ON "order_context_items" ("conversation_id", "status", "expires_at");
