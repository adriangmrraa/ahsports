-- 0028_product_options.sql — configurable product options: fabrics (telas),
-- decoration methods and per-product volume discount tiers.
--
-- `fabrics` is a dedicated catalog instead of reusing `materials` on purpose:
-- materials models purchasing/consumption (unit, yield, metersPerKilo) while a
-- fabric is a customer-facing choice (sublimable flag + sell-price modifier).
-- Telas still live in `materials` for BOM cost; `fabrics` only drives the
-- public/admin option picker and the options pricing path.
--
-- `product_fabrics` / `product_techniques` define WHICH options each product
-- allows plus the per-product sell-price delta on top of the catalog default.
-- `product_volume_tiers` is the per-product quantity → discount ladder.
--
-- Additive + idempotent: safe to re-run, creates no rows, wipes nothing.

CREATE TABLE IF NOT EXISTS "fabrics" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "sublimable" boolean NOT NULL DEFAULT true,
  "price_modifier" numeric(12, 2) NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "fabrics_name_unique_idx"
  ON "fabrics" (lower(btrim("name")))
  WHERE btrim("name") <> '';

CREATE TABLE IF NOT EXISTS "product_fabrics" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" varchar(36) NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "fabric_id" varchar(36) NOT NULL REFERENCES "fabrics"("id"),
  "price_modifier" numeric(12, 2) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_fabrics_unique_idx"
  ON "product_fabrics" ("product_id", "fabric_id");
CREATE INDEX IF NOT EXISTS "product_fabrics_fabric_idx"
  ON "product_fabrics" ("fabric_id");

CREATE TABLE IF NOT EXISTS "product_techniques" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" varchar(36) NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "technique_id" varchar(36) NOT NULL REFERENCES "techniques"("id"),
  "price_modifier" numeric(12, 2) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_techniques_unique_idx"
  ON "product_techniques" ("product_id", "technique_id");
CREATE INDEX IF NOT EXISTS "product_techniques_technique_idx"
  ON "product_techniques" ("technique_id");

CREATE TABLE IF NOT EXISTS "product_volume_tiers" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" varchar(36) NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "min_qty" integer NOT NULL,
  "discount_percent" numeric(5, 2) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "product_volume_tiers_min_qty_check" CHECK ("min_qty" > 0),
  CONSTRAINT "product_volume_tiers_discount_check" CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_volume_tiers_unique_idx"
  ON "product_volume_tiers" ("product_id", "min_qty");

-- A technique that prints through sublimation can only run on sublimable
-- fabrics (polyester). The flag lives on the technique: it is a property of
-- the method itself, not of the product pairing.
ALTER TABLE "techniques"
  ADD COLUMN IF NOT EXISTS "requires_sublimable_fabric" boolean NOT NULL DEFAULT false;

-- Canonical names already seeded as "Sublimación"/"Sublimado" get flagged.
-- Idempotent: re-running is a no-op.
UPDATE "techniques" SET "requires_sublimable_fabric" = true
  WHERE lower("name") LIKE 'sublim%';

ALTER TABLE "order_lines"
  ADD COLUMN IF NOT EXISTS "fabric_id" varchar(36) REFERENCES "fabrics"("id");
