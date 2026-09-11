-- F6.4: editable catalog for product category/subcategory/type selects.
-- Deliberately creates no rows: catalog values are managed from the admin UI.
DO $$ BEGIN
  CREATE TYPE "product_taxonomy_node_kind" AS ENUM ('category', 'subcategory', 'type');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product_taxonomy_nodes" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" "product_taxonomy_node_kind" NOT NULL,
  "value" varchar(128) NOT NULL,
  "label" varchar(255) NOT NULL,
  "parent_id" varchar(36) REFERENCES "product_taxonomy_nodes"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "product_taxonomy_nodes_parent_idx" ON "product_taxonomy_nodes" ("parent_id");
CREATE INDEX IF NOT EXISTS "product_taxonomy_nodes_lookup_idx" ON "product_taxonomy_nodes" ("kind", "parent_id", "value");
CREATE UNIQUE INDEX IF NOT EXISTS "product_taxonomy_nodes_unique_value_idx" ON "product_taxonomy_nodes" ("kind", coalesce("parent_id", ''), "value");
