-- F6 integrity: protect recipe references and normalize supplier uniqueness.
-- Safe for existing data: merge suppliers with the same trimmed, case-insensitive name
-- by repointing material FKs before creating the unique index.
DO $$ BEGIN
  ALTER TABLE "bom_recipes" DROP CONSTRAINT IF EXISTS "bom_recipes_size_id_sizes_id_fk";
  ALTER TABLE "bom_recipes"
    ADD CONSTRAINT "bom_recipes_size_id_sizes_id_fk"
    FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY lower(btrim(name))
      ORDER BY created_at, id
    ) AS keeper
  FROM "suppliers"
  WHERE btrim(name) <> ''
)
UPDATE "materials" m
SET "supplier_id" = ranked.keeper
FROM ranked
WHERE m."supplier_id" = ranked.id
  AND ranked.id <> ranked.keeper;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(btrim(name))
      ORDER BY created_at, id
    ) AS position
  FROM "suppliers"
  WHERE btrim(name) <> ''
)
DELETE FROM "suppliers" s
USING ranked
WHERE s.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_name_unique_idx"
  ON "suppliers" (lower(btrim("name")))
  WHERE btrim("name") <> '';
