-- F6.2: reusable garment molds, family/type metadata and product bundles.
-- Additive and idempotent. Existing products remain individual upper-body garments
-- until an operator classifies them explicitly.
DO $$ BEGIN
  CREATE TYPE "garment_family" AS ENUM ('parte_superior', 'campera', 'pantalon', 'short_futbol', 'bermuda', 'accesorio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "garment_type" AS ENUM ('remera', 'chomba', 'camiseta', 'campera', 'pantalon', 'short', 'bermuda', 'conjunto', 'accesorio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "product_kind" AS ENUM ('garment', 'bundle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "bundle_size_mode" AS ENUM ('same_label', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "garment_molds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "family" "garment_family" NOT NULL,
  "measurement_schema" jsonb DEFAULT '{"required":[],"optional":[]}'::jsonb NOT NULL,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "product_kind" "product_kind" DEFAULT 'garment' NOT NULL,
  ADD COLUMN IF NOT EXISTS "garment_family" "garment_family" DEFAULT 'parte_superior' NOT NULL,
  ADD COLUMN IF NOT EXISTS "garment_type" "garment_type" DEFAULT 'remera' NOT NULL,
  ADD COLUMN IF NOT EXISTS "mold_id" varchar(36);

DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_mold_id_garment_molds_id_fk"
    FOREIGN KEY ("mold_id") REFERENCES "garment_molds"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product_bundles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" varchar(36) NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_bundle_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bundle_id" varchar(36) NOT NULL REFERENCES "product_bundles"("id") ON DELETE CASCADE,
  "component_product_id" varchar(36) NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "quantity" numeric(8, 2) DEFAULT '1' NOT NULL,
  "size_mode" "bundle_size_mode" DEFAULT 'same_label' NOT NULL,
  "component_size_id" varchar(36) REFERENCES "sizes"("id") ON DELETE RESTRICT,
  CONSTRAINT "product_bundle_items_quantity_ck" CHECK ("quantity" > 0)
);

CREATE INDEX IF NOT EXISTS "product_bundle_items_bundle_idx" ON "product_bundle_items" USING btree ("bundle_id");
CREATE INDEX IF NOT EXISTS "products_garment_family_idx" ON "products" USING btree ("garment_family");
