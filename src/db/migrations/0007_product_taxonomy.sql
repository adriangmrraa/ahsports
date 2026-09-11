-- F6.3: general product taxonomy, independent from garment-specific logic.
-- Text columns are intentional: operators can extend the suggested vocabulary
-- without another database migration. Existing category data is preserved.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "product_category" varchar(128),
  ADD COLUMN IF NOT EXISTS "product_subcategory" varchar(128),
  ADD COLUMN IF NOT EXISTS "product_type" varchar(128);

UPDATE "products"
SET
  "product_category" = COALESCE(NULLIF(btrim("product_category"), ''), 'indumentaria'),
  "product_subcategory" = COALESCE(NULLIF(btrim("product_subcategory"), ''), CASE WHEN "product_kind" = 'bundle' THEN 'conjuntos' ELSE 'prendas' END),
  "product_type" = COALESCE(NULLIF(btrim("product_type"), ''), COALESCE("garment_type"::text, CASE WHEN "product_kind" = 'bundle' THEN 'conjunto' ELSE 'otro' END));

ALTER TABLE "products"
  ALTER COLUMN "product_category" SET DEFAULT 'indumentaria',
  ALTER COLUMN "product_category" SET NOT NULL,
  ALTER COLUMN "product_subcategory" SET DEFAULT 'prendas',
  ALTER COLUMN "product_subcategory" SET NOT NULL,
  ALTER COLUMN "product_type" SET DEFAULT 'otro',
  ALTER COLUMN "product_type" SET NOT NULL,
  ALTER COLUMN "garment_family" DROP NOT NULL,
  ALTER COLUMN "garment_type" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "products_taxonomy_idx"
  ON "products" USING btree ("product_category", "product_subcategory", "product_type");

