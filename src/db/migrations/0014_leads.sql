-- Wave 6 attribution pack (A-17/H-01): `leads` entity — port of the SocialCRM
-- leads model adapted to AH conventions (uuid ids, existing `lead_status`
-- enum, `channel_accounts` first-attribution binding). Additive and
-- idempotent; creates no rows.
--
-- `channel_account_id` is the FIRST-attribution account: set once at capture
-- and only ever filled when NULL — arbitrary inbound traffic on another
-- account must never migrate ownership. `contact_id` links the lead to the
-- contact shell `ensureLeadIdentity` creates; social leads may have NULL
-- phone (the identity then lives in `lead_identities`).

CREATE TABLE IF NOT EXISTS "leads" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255),
  -- Phone stays the primary dedup key for messaging leads; social leads may
  -- have no phone. UNIQUE allows multiple NULLs, so phoneless rows coexist.
  "phone" varchar(64) UNIQUE,
  "channel" "channel",
  "external_user_id" text,
  "channel_account_id" varchar(36) REFERENCES "channel_accounts"("id") ON DELETE SET NULL,
  "contact_id" varchar(36) REFERENCES "contacts"("id") ON DELETE SET NULL,
  "email" varchar(255),
  "first_message" text,
  "last_message" text,
  "last_message_at" timestamptz,
  "ref_code" varchar(255),
  "utm_source" varchar(255),
  "utm_medium" varchar(255),
  "utm_campaign" varchar(255),
  "utm_content" varchar(255),
  "ad_id" varchar(255),
  "campaign_id" varchar(255),
  "adset_id" varchar(255),
  "platform" varchar(100),
  "status" "lead_status" NOT NULL DEFAULT 'nuevo',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "leads_channel_external_uq"
  ON "leads" ("channel", "external_user_id")
  WHERE "external_user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "leads_channel_account_idx"
  ON "leads" ("channel_account_id");
CREATE INDEX IF NOT EXISTS "leads_contact_idx"
  ON "leads" ("contact_id");
CREATE INDEX IF NOT EXISTS "leads_created_idx"
  ON "leads" ("created_at");
