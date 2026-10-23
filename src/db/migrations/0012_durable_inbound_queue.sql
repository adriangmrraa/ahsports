-- A-02 (parity audit): durable inbound-turn queue. `agent_inbound_jobs` backs
-- the in-process debounce buffer so a restart/deploy can never silently drop a
-- pending agent turn: every inbound schedules a durable job AND the in-memory
-- flush; a drain pass (webhook-triggered or instrumentation) claims live rows.
--
-- Additive and idempotent; creates no rows. Un-migrated installs keep working:
-- every code path treats a missing table (SQLSTATE 42P01) as "queue disabled"
-- and falls back to the in-memory buffer semantics unchanged.

-- agent_inbound_jobs — one row per debounced conversation turn.
--   dedup_key        : `turn:<conversation_id>` — one live job per conversation,
--                      so the debounce coalesces at the durable layer too.
--   conversation_key : the buffer key (account-scoped sender id) used by the
--                      in-memory BufferManager — kept for ops correlation only.
--   payload          : minimal turn context needed to rebuild a dispatch after
--                      restart (to / external_thread_id / provider_conversation_id);
--                      the message batch itself is rebuilt from chat_messages.
--   status           : queued → running → done | dead. 'dead' is the DLQ.
--   run_after        : earliest claim time — enqueued with the debounce window
--                      plus a grace margin so the in-process flush always wins;
--                      retries use exponential backoff.
CREATE TABLE IF NOT EXISTS "agent_inbound_jobs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT 'default',
  "dedup_key" text NOT NULL,
  "channel" "channel" NOT NULL,
  "channel_account_id" varchar(36) REFERENCES "channel_accounts"("id") ON DELETE SET NULL,
  "conversation_id" varchar(36) NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "conversation_key" text NOT NULL,
  "payload" jsonb,
  "status" text NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "run_after" timestamptz NOT NULL DEFAULT now(),
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- At most ONE live (queued/running) job per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS "agent_inbound_jobs_live_dedup_uq"
  ON "agent_inbound_jobs" ("dedup_key")
  WHERE "status" IN ('queued', 'running');

-- Claim scan: due queued jobs, ordered by run_after.
CREATE INDEX IF NOT EXISTS "agent_inbound_jobs_claim_idx"
  ON "agent_inbound_jobs" ("run_after")
  WHERE "status" = 'queued';

-- Admin/DLQ views: status + recency.
CREATE INDEX IF NOT EXISTS "agent_inbound_jobs_status_created_idx"
  ON "agent_inbound_jobs" ("status", "created_at");

DO $$ BEGIN
  ALTER TABLE "agent_inbound_jobs" ADD CONSTRAINT "agent_inbound_jobs_status_check"
    CHECK ("status" IN ('queued', 'running', 'done', 'dead'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
