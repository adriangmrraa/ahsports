-- Wave 9 (A-13): physical cash drawer — cash_sessions + cash_movements.
-- Sessions form a continuous chain: each session opens where the previous one
-- closed (opened_at = previous closed_at, opening_cash = previous actual_cash),
-- so no cash payment can fall outside a window or inside two at once. A closed
-- session is immutable (no update/delete path in the app) — it is an audit
-- seat. No automatic rollover: unlike SocialCRM's food service, the factory
-- does not run past midnight, so rollover is delegated to the operator opening
-- the next session (see src/lib/cash/session.ts header).
--
-- Additive and idempotent; creates no rows.

DO $$ BEGIN CREATE TYPE "cash_session_status" AS ENUM ('open', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "cash_sessions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" "cash_session_status" NOT NULL DEFAULT 'open',
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  "opening_cash" numeric(12, 2) NOT NULL DEFAULT '0',
  "expected_cash" numeric(12, 2),
  "actual_cash" numeric(12, 2),
  "difference" numeric(12, 2),
  "closed_by" varchar(100),
  "report" jsonb,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cash_sessions_status_idx"
  ON "cash_sessions" ("status", "opened_at");

CREATE TABLE IF NOT EXISTS "cash_movements" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar(36) NOT NULL REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
  "direction" varchar(10) NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "reason" text NOT NULL,
  "created_by" varchar(100),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_direction_check" CHECK ("direction" IN ('in', 'out'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "cash_movements_session_idx"
  ON "cash_movements" ("session_id", "created_at");
