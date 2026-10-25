-- 0029_stackable_line_methods.sql — print methods become STACKABLE.
--
-- A garment can be 100% sublimado AND also carry DTF/bordado for logos and
-- sponsors. order_lines.technique_id (single FK) cannot express that, so the
-- full selection moves to order_line_techniques; order_lines.technique_id
-- keeps the FIRST selected method as the "primary" one for legacy readers
-- (recipe matching, ficha técnica, agent tools).
--
-- price_modifier snapshots the product_techniques sell delta applied at line
-- creation so the price stays traceable even if the product config changes.
--
-- Also seeds the fabric catalog the business asked for (independent rows,
-- per-row sublimable flag — there is no fabric "type"). Idempotent: re-run is
-- a no-op, creates no duplicates, wipes nothing.

CREATE TABLE IF NOT EXISTS "order_line_techniques" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_line_id" varchar(36) NOT NULL REFERENCES "order_lines"("id") ON DELETE cascade,
  "technique_id" varchar(36) NOT NULL REFERENCES "techniques"("id"),
  "price_modifier" numeric(12, 2) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_line_techniques_unique_idx"
  ON "order_line_techniques" ("order_line_id", "technique_id");
CREATE INDEX IF NOT EXISTS "order_line_techniques_technique_idx"
  ON "order_line_techniques" ("technique_id");

-- Backfill: lines that already carried a single technique get a join row so
-- re-quotes read the full selection from one place. price_modifier 0 because
-- the historical delta is unknowable — snapshot stays the source of truth.
INSERT INTO "order_line_techniques" ("order_line_id", "technique_id")
SELECT "id", "technique_id" FROM "order_lines"
WHERE "technique_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "order_line_techniques" olt
    WHERE olt."order_line_id" = "order_lines"."id"
      AND olt."technique_id" = "order_lines"."technique_id"
  );

-- Fabric catalog seed (user-requested): each row is an independent fabric
-- with its own sublimable flag — no type logic. Non-sublimable fabrics only
-- offer DTF/bordado-style methods; sublimable ones also offer Sublimado 100%.
INSERT INTO "fabrics" ("name", "sublimable", "sort_order")
SELECT seed."name", seed."sublimable", seed."sort_order"
FROM (VALUES
  ('Piqué',              false, 10),
  ('Piqué sublimable',   true,  20),
  ('Algodón',            false, 30),
  ('Set deportivo',      true,  40),
  ('Dry fit deportivo',  true,  50)
) AS seed("name", "sublimable", "sort_order")
WHERE NOT EXISTS (
  SELECT 1 FROM "fabrics" f WHERE lower(btrim(f."name")) = lower(btrim(seed."name"))
);
