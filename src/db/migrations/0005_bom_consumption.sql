-- F6.1: explicit BOM consumption model, additive and idempotent.
-- quantity remains the legacy/base quantity for existing readers.
DO $$ BEGIN
  CREATE TYPE "bom_consumption_mode" AS ENUM ('direct', 'yield');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "bom_items"
  ADD COLUMN IF NOT EXISTS "consumption_mode" "bom_consumption_mode" DEFAULT 'direct' NOT NULL,
  ADD COLUMN IF NOT EXISTS "direct_quantity" numeric(12, 4),
  ADD COLUMN IF NOT EXISTS "units_per_consumption_unit" numeric(12, 4);

UPDATE "bom_items"
SET "direct_quantity" = "quantity"
WHERE "consumption_mode" = 'direct' AND "direct_quantity" IS NULL;

DO $$ BEGIN
  ALTER TABLE "bom_items"
    ADD CONSTRAINT "bom_items_consumption_data_ck"
    CHECK (
      ("consumption_mode" = 'direct' AND "direct_quantity" IS NOT NULL AND "direct_quantity" > 0 AND "units_per_consumption_unit" IS NULL)
      OR
      ("consumption_mode" = 'yield' AND "units_per_consumption_unit" IS NOT NULL AND "units_per_consumption_unit" > 0 AND "direct_quantity" IS NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "bom_items_consumption_mode_idx"
  ON "bom_items" USING btree ("consumption_mode");
