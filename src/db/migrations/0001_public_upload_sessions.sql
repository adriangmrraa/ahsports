-- Production prerequisite: apply only after the existing AH Sports base schema
-- has been reconciled with Neon (see docs/NEON-MIGRATION-BASELINE.md).
DO $$ BEGIN
  CREATE TYPE "upload_session_status" AS ENUM ('active', 'consumed', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "upload_sessions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "secret_hash" varchar(64) NOT NULL,
  "status" "upload_session_status" DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "attachments"
  ADD COLUMN IF NOT EXISTS "upload_session_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "storage_key" varchar(512),
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_upload_session_id_upload_sessions_id_fk"
    FOREIGN KEY ("upload_session_id") REFERENCES "upload_sessions"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "upload_sessions_expiry_idx" ON "upload_sessions" USING btree ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "attachments_upload_session_idx" ON "attachments" USING btree ("upload_session_id", "status");

-- Existing local previews retain url. Their future provider key can be backfilled
-- deliberately during storage-provider migration rather than guessed here.
