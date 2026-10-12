-- P0: AI agent platform foundation (additive, idempotent).
-- Creates the canonical omnichannel conversation record plus agent config,
-- session/memory state, idempotency and audit tables. Deliberately creates no
-- rows: provider/model and secrets are managed from the admin UI.
DO $$ BEGIN
  CREATE TYPE "channel" AS ENUM ('telegram', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "message_sender_kind" AS ENUM ('customer', 'agent', 'operator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "message_content_type" AS ENUM ('text', 'image', 'document', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "message_delivery_state" AS ENUM ('received', 'queued', 'sent', 'failed', 'imported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "conversation_status" AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_kind" AS ENUM ('customer', 'operator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_memory_scope" AS ENUM ('customer', 'operator', 'global');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "audit_actor_kind" AS ENUM ('system', 'user', 'agent', 'channel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" varchar(36) REFERENCES "contacts"("id") ON DELETE SET NULL,
  "organization_id" varchar(36) REFERENCES "organizations"("id") ON DELETE SET NULL,
  "channel" "channel" NOT NULL,
  "external_thread_id" varchar(255) NOT NULL,
  "status" "conversation_status" NOT NULL DEFAULT 'open',
  "last_message_at" timestamptz,
  "unread_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_channel_thread_unique_idx"
  ON "conversations" ("channel", "external_thread_id");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar(36) NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "channel" "channel" NOT NULL,
  "platform_message_id" varchar(255) NOT NULL,
  "direction" "message_direction" NOT NULL,
  "sender_kind" "message_sender_kind" NOT NULL,
  "sender_ref" text,
  "content_type" "message_content_type" NOT NULL DEFAULT 'text',
  "content" text NOT NULL DEFAULT '',
  "raw_payload" jsonb,
  "delivery_state" "message_delivery_state" NOT NULL DEFAULT 'received',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Idempotency anchor: duplicate provider deliveries never create new facts.
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_platform_unique_idx"
  ON "chat_messages" ("channel", "platform_message_id");
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_idx"
  ON "chat_messages" ("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "agent_session_states" (
  "conversation_id" varchar(36) PRIMARY KEY REFERENCES "conversations"("id") ON DELETE CASCADE,
  "kind" "agent_kind" NOT NULL,
  "summary" text,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_session_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar(36) NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "event_type" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_session_events_conversation_idx"
  ON "agent_session_events" ("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "agent_memories" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope" "agent_memory_scope" NOT NULL,
  "key" varchar(255) NOT NULL,
  "value" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_memories_scope_key_unique_idx"
  ON "agent_memories" ("scope", "key");

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "key" text PRIMARY KEY,
  "scope" varchar(64) NOT NULL,
  "response" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_idx"
  ON "idempotency_keys" ("expires_at");

-- Insert-only audit trail; no update/delete path exists in the application.
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_kind" "audit_actor_kind" NOT NULL DEFAULT 'system',
  "actor_ref" text,
  "action" varchar(128) NOT NULL,
  "entity_type" varchar(64),
  "entity_id" varchar(64),
  "correlation_id" varchar(64),
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_events_action_idx"
  ON "audit_events" ("action", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_correlation_idx"
  ON "audit_events" ("correlation_id");

-- Singleton agent configuration row (id = 1). Secrets are stored AES-256-GCM
-- encrypted (see src/lib/crypto/secret-box.ts); no provider/model is hardcoded.
CREATE TABLE IF NOT EXISTS "agent_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "provider" text,
  "model" text,
  "system_prompt" text,
  "enabled_tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bot_token_enc" text,
  "provider_key_enc" text,
  "webhook_secret_enc" text,
  "updated_by_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "agent_config_singleton_check" CHECK ("id" = 1)
);
