-- 0030_configurator_drafts.sql — server-side state for the 3D garment configurator.
--
-- The public wizard currently carries flow state (contact data, product picks,
-- upload secrets) in query params. Configurator drafts replace that with an
-- opaque bearer token: only the SHA-256 of the token is stored, same threat
-- model as upload_sessions.
--
-- Provenance chain: draft -> item (config jsonb, GarmentConfig) ->
-- design_revisions (immutable append-only snapshots) -> design_renders
-- (deterministic artifacts bound to a revision). order_lines.design_revision_id
-- links the active revision once a draft converts into an order; admin edits
-- append new revisions and never mutate old ones.
--
-- Idempotent: re-run is a no-op, creates no duplicates, wipes nothing.

DO $$ BEGIN CREATE TYPE "configurator_draft_status" AS ENUM ('active', 'converted', 'expired', 'archived'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "design_revision_source" AS ENUM ('home', 'wizard', 'admin', 'system'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "configurator_drafts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" varchar(64) NOT NULL,
  "status" "configurator_draft_status" NOT NULL DEFAULT 'active',
  -- Wizard flow state lives here instead of URL params: contact refs, product
  -- picks, size quantities, notes. PII stays server-side.
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "order_id" varchar(36) REFERENCES "orders"("id") ON DELETE set null,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "configurator_drafts_token_hash_idx" ON "configurator_drafts"("token_hash");
CREATE INDEX IF NOT EXISTS "configurator_drafts_expiry_idx" ON "configurator_drafts"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "configurator_drafts_order_idx" ON "configurator_drafts"("order_id");

CREATE TABLE IF NOT EXISTS "configurator_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "draft_id" varchar(36) NOT NULL REFERENCES "configurator_drafts"("id") ON DELETE cascade,
  "product_id" varchar(36) NOT NULL REFERENCES "products"("id"),
  -- Normalized GarmentConfig: colors, fabric preset, collar, sleeves, view,
  -- placements[] (assetRef = attachments.id staged via upload_sessions).
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "current_revision_no" integer NOT NULL DEFAULT 0,
  "order_line_id" varchar(36) REFERENCES "order_lines"("id") ON DELETE set null,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "configurator_items_draft_idx" ON "configurator_items"("draft_id", "sort_order");
CREATE INDEX IF NOT EXISTS "configurator_items_order_line_idx" ON "configurator_items"("order_line_id");
CREATE INDEX IF NOT EXISTS "configurator_items_product_idx" ON "configurator_items"("product_id");

CREATE TABLE IF NOT EXISTS "design_revisions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" varchar(36) NOT NULL REFERENCES "configurator_items"("id") ON DELETE cascade,
  "revision_no" integer NOT NULL,
  "config" jsonb NOT NULL,
  "source" "design_revision_source" NOT NULL DEFAULT 'wizard',
  "note" text,
  "created_by_id" varchar(36) REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "design_revisions_item_rev_idx" ON "design_revisions"("item_id", "revision_no");

CREATE TABLE IF NOT EXISTS "design_renders" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "revision_id" varchar(36) NOT NULL REFERENCES "design_revisions"("id") ON DELETE cascade,
  "view" varchar(16) NOT NULL,
  -- The rendered frame is stored as a regular attachment so storage, media
  -- serving and retention reuse the existing pipeline.
  "attachment_id" varchar(36) REFERENCES "attachments"("id") ON DELETE set null,
  "storage_key" varchar(512),
  "content_hash" varchar(64),
  "width" integer,
  "height" integer,
  "mime" varchar(64) NOT NULL DEFAULT 'image/png',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "design_renders_revision_idx" ON "design_renders"("revision_id", "created_at");

ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "design_revision_id" varchar(36);
DO $$ BEGIN
  ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_design_revision_fk"
    FOREIGN KEY ("design_revision_id") REFERENCES "design_revisions"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- fabrics.visual_preset maps a catalog fabric to a configurator FabricPresetId
-- (performance|satin|pique|mesh). NULL falls back to the name heuristic in code.
ALTER TABLE "fabrics" ADD COLUMN IF NOT EXISTS "visual_preset" varchar(32);

-- Seed sensible presets for the existing catalog only where unset.
UPDATE "fabrics" SET "visual_preset" = 'pique'       WHERE "visual_preset" IS NULL AND lower(btrim("name")) = 'piqué';
UPDATE "fabrics" SET "visual_preset" = 'satin'       WHERE "visual_preset" IS NULL AND lower(btrim("name")) = 'piqué sublimable';
UPDATE "fabrics" SET "visual_preset" = 'pique'       WHERE "visual_preset" IS NULL AND lower(btrim("name")) = 'algodón';
UPDATE "fabrics" SET "visual_preset" = 'performance' WHERE "visual_preset" IS NULL AND lower(btrim("name")) = 'set deportivo';
UPDATE "fabrics" SET "visual_preset" = 'performance' WHERE "visual_preset" IS NULL AND lower(btrim("name")) = 'dry fit deportivo';
