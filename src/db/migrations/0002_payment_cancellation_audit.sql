-- Phase 3 (production-mvp-closure): cancellable payments + immutable audit events.
-- Additive only: existing payment rows default to cancelled=false and keep
-- counting toward totals exactly as before.
DO $$ BEGIN
  CREATE TYPE "payment_event_type" AS ENUM ('registered', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "cancelled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cancelled_by" varchar(36);

DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_cancelled_by_users_id_fk"
    FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" varchar(36) NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
  "order_id" varchar(36) NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "type" "payment_event_type" NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "created_by_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "payment_events_order_idx" ON "payment_events" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");
