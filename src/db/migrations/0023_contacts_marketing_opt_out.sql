-- Wave 9 (A-10): contacts.marketing_opt_out — the opt-out flag the broadcast
-- send path must respect. Additive and idempotent.

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "marketing_opt_out" boolean NOT NULL DEFAULT false;
