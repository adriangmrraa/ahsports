# APPLY REPORT — `ai-telegram-sales-agent` · P5 Jobs & Observability (Work Unit 6)

## Summary
Implemented Work Unit 6 only: the **reconcile/retention job** for the agent
platform. A cron caller (or an authorized admin session) can now run a single
idempotent maintenance pass over the canonical conversation record:

1. **Purge** expired `idempotency_keys`.
2. **Delete** expired `agent_memories`.
3. **Retention sweep**: scrub `raw_payload` (PII) from messages past the window.
4. **Retry** outbound Telegram messages stuck in `deliveryState='failed'`,
   re-delivering through the Telegram adapter and transitioning to `sent` on
   success (or back to `failed`), never creating a new fact.
5. **Reconcile inbound-without-reply**: flag recent customer/operator inbound
   messages whose conversation has no later outbound.

Every mutation is recorded as an insert-only `audit_events` row. This closes the
P1 review MEDIUM (inbound-without-reply) and the P4 carry-forward
"jobs/observability" item. No AI loop was wired into the live webhook router
(P5.4, out of this task's scope — see "Excluded").

## Tasks completed (mark in tasks artifact)
- [x] **P5.1** `src/app/api/agent/reconcile/route.ts` — GET + POST cron endpoint;
  expires/purges idempotency keys, retries `failed`, retention sweep,
  inbound-without-reply. Idempotent and safe to run repeatedly/concurrently.
- [x] **P5.2** `src/lib/agents/retention.ts` (pure decisions) +
  `src/lib/agents/reconcile.ts` (step executors); all mutations audited via the
  insert-only `audit_events` table (`actorKind` `system`/`channel`,
  `correlationId`, `payload` with counts / `before` / `after`).
- [x] **P5.3** Retry-safe: each step is individually idempotent; no duplicate
  delivery (conditional `failed → queued` claim) and no duplicate draft.

## Files
- `src/lib/agents/retention.ts` (new) — pure, `server-only`-free policy:
  `isExpired`, `shouldScrubRawPayload`, `findInboundWithoutReply`, the retention
  windows (`RAW_PAYLOAD_RETENTION_MS` 90d, `INBOUND_WITHOUT_REPLY_WINDOW_MS` 7d,
  `NO_REPLY_AUDIT_DEDUPE_TTL_MS` 1d) and `RECONCILE_DEFAULT_BATCH_SIZE`. No I/O,
  so it is checkable without a database.
- `src/lib/agents/reconcile.ts` (new) — `runReconcile({ now?, batchSize? })`
  orchestrates the five bounded steps, writes the per-step and run-level audit
  events, carries a `correlationId` per run, and audits `agent.reconcile.failed`
  (best-effort) before rethrowing. `NO_REPLY_IDEMPOTENCY_SCOPE` /
  `ReconcileSummary` exported.
- `src/app/api/agent/reconcile/route.ts` (new) — GET/POST, `runtime = "nodejs"`,
  `dynamic = "force-dynamic"`. `batchSize` validated with Zod (`1..500`).

## Security boundaries
- **Route never open**: a cron caller has no session, so access requires either a
  constant-time match of a presented secret against `CRON_SECRET` (falling back
  to `AGENT_CRON_SECRET`), supplied via `x-cron-secret` or
  `Authorization: Bearer`, **or** an authenticated `admin`/`gerencia` session via
  `authorizeAgentApi()`. Otherwise 401/403 before any work. `timingSafeEqualString`
  (the Telegram adapter's constant-time comparator) is reused.
- **No new facts / no double delivery**: retry updates `chat_messages` in place
  and claims the row with a conditional `failed → queued` update that returns a
  row only to the winning run; the idempotency anchor `unique(channel,
  platform_message_id)` is never violated.
- **Zod on input**; generic errors (no internals); secrets never logged
  (bot token is only decrypted and passed to the adapter).

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — **identical to baseline** (0 new; all 12 in pre-existing files) |
| `npm run build` | `✓ Compiled successfully` (new route compiled; lint + type validity passed). Then **PRE-EXISTING ENVIRONMENTAL BASELINE FAILURE** — `DATABASE_URL is required in production` (`src/db/client.ts:7`) at "Collecting page data" for `/api/attachments/[id]`; same message/stage as HEAD pre-change. No new failure mode introduced by P5. |
| `npm run check:agent-tools` | PASS (unchanged) |
| DB-free behavior check (temp `tsx`, deleted) | PASS — 15 assertions over `isExpired`, `shouldScrubRawPayload` and `findInboundWithoutReply` (no reply, replied, partial, multiple unanswered, agent-inbound exclusion, window constant) |

## Decisions / notes
- **Claim via `failed → queued`** rather than a new enum state (no migration):
  `queued` already means "awaiting send". Only the run that wins the conditional
  update sends; a crash between claim and send leaves a `queued` row that is not
  auto-retried (documented residual, deferred to P7 with the other
  `queued`-stuck cases).
- **Inbound-without-reply dedupe**: a one-per-conversation audit is emitted and
  a `reconcile.no_reply:<conversationId>` idempotency key (1-day TTL) suppresses
  duplicate findings across runs; the key expires and re-surfaces if still
  unanswered. No auto-reply, as required.
- **No migration / no schema change**: all steps operate on existing tables
  (`idempotency_keys`, `agent_memories`, `chat_messages`, `audit_events`).

## Excluded (unchanged, as required)
- **P5.4** wiring the AI loop + `enabledTools` into the live webhook router (the
  runtime is still a library; `agent_config.enabledTools` has no live effect yet)
  — left unchecked in the tasks artifact.
- WhatsApp import webhook (P6), P7 hardening/docs (graph sync, ADR, routes,
  fresh-DB migration bootstrap, `CLEAR` sentinel collision, inbox pagination).
- No `db:push`, no `db:seed`, no merge/push/deploy.

## Next unit
P6 — WhatsApp import (observe only): `src/lib/channels/whatsapp/import.ts` +
`signature.ts`, config-gated `api/whatsapp/webhook/[token]`, no send path.
