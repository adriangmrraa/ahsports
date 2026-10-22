-- Wave 1 multichannel port: channel_accounts + lead_identities + channel_events,
-- account binding on conversations/chat_messages, and account→channel→global
-- scoping on agent_config. Additive and idempotent; creates no rows. Un-migrated
-- installs keep working: every new column is nullable and legacy dedup lives in
-- its own partial-index partition.

-- 1. Extend the channel enum (appends preserve existing label order).
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'reddit';

-- 2. channel_accounts — one row per connected provider account/sender.
--    credentials_ref stores WHERE secrets live (env:PREFIX_*, agent_config,
--    future vault ref), never the secret itself.
CREATE TABLE IF NOT EXISTS "channel_accounts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT 'default',
  "provider" text NOT NULL,
  "channel" "channel" NOT NULL,
  "provider_account_id" text NOT NULL,
  "sender_address" text NOT NULL,
  "display_name" text,
  "credentials_ref" text,
  "agent_config_id" integer REFERENCES "agent_config"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "channel_accounts_provider_account_uq"
  ON "channel_accounts" ("provider", "provider_account_id");

-- 3. agent_config becomes scope-aware: channel NULL + channel_account_id NULL
--    is the global default (id = 1); channel-scoped and per-account rows take
--    ids from the new sequence. The singleton CHECK is dropped.
ALTER TABLE "agent_config" DROP CONSTRAINT IF EXISTS "agent_config_singleton_check";

CREATE SEQUENCE IF NOT EXISTS "agent_config_id_seq" AS integer;
ALTER TABLE "agent_config" ALTER COLUMN "id" SET DEFAULT nextval('agent_config_id_seq');
SELECT setval('agent_config_id_seq', COALESCE((SELECT MAX("id") FROM "agent_config"), 1));

ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "channel" "channel";
ALTER TABLE "agent_config" ADD COLUMN IF NOT EXISTS "channel_account_id" varchar(36);
DO $$ BEGIN
  ALTER TABLE "agent_config" ADD CONSTRAINT "agent_config_channel_account_id_fkey"
    FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_config_channel_account_uq"
  ON "agent_config" ("channel_account_id") WHERE "channel_account_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agent_config_channel_scope_uq"
  ON "agent_config" ("channel") WHERE "channel" IS NOT NULL AND "channel_account_id" IS NULL;

-- 4. Account binding on conversations + chat_messages. New partial unique
--    indexes are created BEFORE the legacy global ones are dropped so dedup
--    coverage never lapses. A provisioned account never adopts a legacy
--    NULL-account conversation; a conversation is never rebound.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "channel_account_id" varchar(36);
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_account_id_fkey"
    FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_account_thread_uq"
  ON "conversations" ("channel", "channel_account_id", "external_thread_id")
  WHERE "channel_account_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_legacy_thread_uq"
  ON "conversations" ("channel", "external_thread_id")
  WHERE "channel_account_id" IS NULL;
CREATE INDEX IF NOT EXISTS "conversations_channel_account_idx"
  ON "conversations" ("channel", "channel_account_id");
DROP INDEX IF EXISTS "conversations_channel_thread_unique_idx";

ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "channel_account_id" varchar(36);
DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_account_id_fkey"
    FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_account_platform_uq"
  ON "chat_messages" ("channel", "channel_account_id", "platform_message_id")
  WHERE "channel_account_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_legacy_platform_uq"
  ON "chat_messages" ("channel", "platform_message_id")
  WHERE "channel_account_id" IS NULL;
DROP INDEX IF EXISTS "chat_messages_platform_unique_idx";

-- 5. channel_events — durable provider events with no conversation row.
--    Delivery-id uniqueness is per account (COALESCE partitions legacy rows).
CREATE TABLE IF NOT EXISTS "channel_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT 'default',
  "provider" text NOT NULL,
  "channel" "channel",
  "channel_account_id" varchar(36) REFERENCES "channel_accounts"("id") ON DELETE SET NULL,
  "provider_account_id" text,
  "delivery_id" text NOT NULL,
  "platform_message_id" text,
  "kind" text NOT NULL,
  "direction" text NOT NULL,
  "status" text,
  "event_timestamp" timestamptz,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "channel_events_provider_delivery_uq"
  ON "channel_events" ("provider", COALESCE("channel_account_id", ''), "delivery_id");
CREATE UNIQUE INDEX IF NOT EXISTS "channel_events_provider_platform_uq"
  ON "channel_events" ("provider", "platform_message_id", "kind", "status")
  WHERE "platform_message_id" IS NOT NULL AND "status" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "channel_events_account_created_idx"
  ON "channel_events" ("channel_account_id", "created_at");
CREATE INDEX IF NOT EXISTS "channel_events_provider_platform_idx"
  ON "channel_events" ("provider", "platform_message_id");

-- 6. lead_identities — one contact ↔ N channel identities, keyed by the
--    canonical per-channel external identity.
CREATE TABLE IF NOT EXISTS "lead_identities" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT 'default',
  "contact_id" varchar(36) NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "channel" "channel" NOT NULL,
  "external_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "lead_identities_channel_external_uq"
  ON "lead_identities" ("channel", "external_id");
CREATE INDEX IF NOT EXISTS "lead_identities_contact_idx"
  ON "lead_identities" ("contact_id");

-- 7. Phone fallback for identity resolution scans contacts.phone.
CREATE INDEX IF NOT EXISTS "contacts_phone_idx"
  ON "contacts" ("phone") WHERE "phone" IS NOT NULL;
