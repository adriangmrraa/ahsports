-- Wave 9 (A-14): promotions — named offers composed of real catalog products.
-- `items` is a jsonb array of { productId, productName, quantity }; productName
-- is a snapshot denormalized at write time so the row stays readable if a
-- product is renamed. Additive and idempotent; creates no rows.

CREATE TABLE IF NOT EXISTS "promotions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "description" text,
  "image_url" text,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "custom_price" numeric(12, 2),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "promotions_active_idx"
  ON "promotions" ("active", "created_at");
