-- 0027_ai_provider_endpoint.sql — provider endpoint/base URL for the agent's
-- AI provider, editable from /admin/agent (catalog default or manual). Not a
-- secret — the API key stays in provider_key_enc. Idempotent: safe to re-run.
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "provider_endpoint_url" text;
