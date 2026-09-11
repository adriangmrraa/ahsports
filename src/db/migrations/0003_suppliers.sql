-- F6-01: proveedores como entidad + vínculo materials.supplier_id.
-- Additive only + backfill idempotente: los nombres de proveedor en texto
-- libre se convierten en filas de suppliers y se enlazan. La columna
-- materials.supplier (texto) se conserva como legado.
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(64),
  "email" varchar(255),
  "address" varchar(255),
  "contact_name" varchar(255),
  "tax_id" varchar(64),
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "supplier_id" varchar(36);

DO $$ BEGIN
  ALTER TABLE "materials"
    ADD CONSTRAINT "materials_supplier_id_suppliers_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Backfill: un supplier por cada nombre distinto ya cargado en texto libre.
INSERT INTO "suppliers" ("name")
SELECT DISTINCT m."supplier" FROM "materials" m
WHERE m."supplier" IS NOT NULL AND btrim(m."supplier") <> ''
  AND NOT EXISTS (SELECT 1 FROM "suppliers" s WHERE s."name" = m."supplier");

UPDATE "materials" m
SET "supplier_id" = s."id"
FROM "suppliers" s
WHERE m."supplier_id" IS NULL
  AND m."supplier" IS NOT NULL
  AND s."name" = m."supplier";
