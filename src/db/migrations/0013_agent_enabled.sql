-- Wave 7 config pack: agent_config operational columns.
-- Additive and idempotent; creates no rows. Existing installs keep today's
-- behavior: `enabled` defaults true (kill-switch off only when an admin
-- explicitly disables a scope) and every other column defaults off/NULL.

-- G-01 — kill-switch evaluated by the scoped dispatcher.
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true;

-- A-03 — first-contact auto-reply (config-driven, per scope).
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "auto_reply_24h" boolean NOT NULL DEFAULT false;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "auto_reply_24h_message" text;

-- A-08 — /presupuesto web-order redirect surfaced to the sales agent.
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "web_order_redirect_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "web_order_redirect_message" text;

-- A-15 — per-scope provider credentials resolved by channel accounts whose
-- credentials_ref is 'agent_config' (env:PREFIX remains the fallback).
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "ycloud_api_key_enc" text;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "ycloud_webhook_secret_enc" text;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "kapso_api_key_enc" text;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "kapso_webhook_secret_enc" text;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "zernio_api_key_enc" text;
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "zernio_webhook_secret_enc" text;
