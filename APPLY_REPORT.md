# APPLY REPORT — `ai-telegram-sales-agent` · P1 Persistence & Telegram (Work Unit 2)

## Summary
Implemented Work Unit 2 only: transactional **canonical conversation intake**,
the **normalized channel router**, the **Telegram webhook runtime** with
secret-token verification and Zod validation, **internal-agent sender
binding/allowlist** and safe command handling. Customer inbound, agent outbound
and imported WhatsApp operator outbound are all persisted as canonical DB facts
keyed by `${channel}:${platformMessageId}`. No AI runtime, sales tools, admin
UI, jobs, WhatsApp provider client, payments or order finalization were built.

## Delivery
- Change: `ai-telegram-sales-agent` · Strict TDD: `false` (standard mode)
- Strategy: `auto-chain` / `feature-branch-chain`
- Chained from P0 commit `5adef3e` (PR1). Branch
  `adriangmrraa/apply-ai-telegram-sales-agent-p1`.
- No merge, push, deploy, `db:push`, `db:seed`, or destructive DB write performed.

## Tasks completed (mark in tasks artifact)
- [x] P1.1 `src/lib/channels/intake.ts` — `persistCanonicalMessage` writes
  inside `withDbTransaction`, keyed `${channel}:${platformMessageId}`.
- [x] P1.2 Persist customer inbound — `persistCustomerInbound` (`senderKind:'customer'`).
- [x] P1.3 Persist AI outbound — `persistAgentOutbound` (`senderKind:'agent'`).
- [x] P1.4 Persist WhatsApp operator outbound — `importOperatorOutbound`
  (`senderKind:'operator', deliveryState:'imported'`); import-only, no send path.
- [x] P1.5 `src/lib/channels/telegram.ts` +
  `src/app/api/telegram/webhook/[token]/route.ts` — constant-time secret-token
  verification + Zod validation before any side effect.
- [x] P1.6 Internal agent binds sender to authorized identity
  (`src/lib/agent/identity.ts`) and persists inbound + reply
  (`src/lib/agents/commands.ts`, `src/lib/channels/router.ts`).
- [x] P1.7 Duplicate `platformMessageId` → one fact, safe 2xx success, no second
  reply, audit trail preserved.

## Files
- `src/lib/channels/types.ts` (new) — Zod normalized channel contract + delivery
  defaults.
- `src/lib/channels/intake.ts` (new) — transactional persistence, idempotency
  anchor, `idempotency_keys` record, insert-only audit, failure audit outside tx.
- `src/lib/channels/telegram.ts` (new) — Bot API adapter, update Zod schema,
  update normalizer, constant-time secret verification, `sendMessage`.
- `src/lib/channels/router.ts` (new) — normalized channel router.
- `src/lib/agent/identity.ts` (new) — operator binding/allowlist via
  `agent_memories` + `users` (no new table).
- `src/lib/agents/commands.ts` (new) — safe, non-mutating command handling.
- `src/app/api/telegram/webhook/[token]/route.ts` (new) — webhook endpoint.

## APIs / types
- `persistCanonicalMessage(input: unknown): Promise<IntakeOutcome>` — validates
  with Zod `safeParse`, returns `{ ok:true, conversationId, messageId, duplicate }`
  or `{ ok:false, error:'invalid_input'|'persistence_failed', issues? }`.
- `routeInboundMessage(message: NormalizedMessage): Promise<RouteResult>` —
  `{ persisted, replyText, replyMessageId }`.
- `NormalizedMessage` (channel, externalThreadId, platformMessageId, direction,
  senderKind, senderRef, contentType, content, deliveryState, rawPayload,
  customerId, organizationId).
- `resolveOperatorIdentity(channel, transportId)` /
  `bindOperatorIdentity(channel, transportId, userId)`.
- `verifyTelegramRequest({ pathToken, headerSecret, expectedSecret })`.

## Auth boundaries
- Webhook: request is rejected before any persistence unless the
  `x-telegram-bot-api-secret-token` header matches the decrypted webhook secret
  (constant time) **and** the URL `[token]` equals its non-secret SHA-256
  fingerprint; missing config → 503, mismatch → 403, bad payload → 400.
- Internal agent: only bound, active users whose role ∈ `["admin","gerencia"]`
  (`AGENT_ADMIN_ROLES`) are authorized; unbound/inactive/unauthorized senders get
  an actionable denial message.
- Secrets are decrypted only to verify/send and are never returned or logged.

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — identical to baseline (0 new) |
| `npm run build` | **PRE-EXISTING ENVIRONMENTAL BASELINE FAILURE** — `DATABASE_URL is required in production` (`src/db/client.ts:8`) during "Collecting page data"; reproduced identically on stashed HEAD at the same pre-existing route. No `.env`/reachable Neon in this isolated worktree. P1 adds no new failure mode. |
| DB-free behavior check (temp `tsx`, removed) | PASS — secret verification true/false paths, bot/non-message ignore, `${chatId}:${messageId}` id, Zod rejection + defaults, delivery-state defaults |

## Decisions / notes
- **Idempotency = chat_messages unique index** `(channel, platform_message_id)`
  as the anchor (`onConflictDoNothing` + select-existing), with an
  `idempotency_keys` row keyed `${channel}:${platformMessageId}` recording the
  processed response. Retried deliveries return a safe success and never create a
  duplicate message or reply.
- **Outbound persisted before delivery**: the router writes the agent reply with
  `deliveryState:'queued'`; the route transitions it to `sent`/`failed` after the
  Bot API call, so a failed send preserves the outbound fact.
- **Operator binding** is stored in `agent_memories` (scope `operator`,
  key `telegram:<transportId>`) — P0 owns migrations, so P1 adds no table. The
  binding function is exposed for the P4 admin surface.
- **WhatsApp**: only the P1.4 persistence seam exists (`importOperatorOutbound`,
  generic intake). No `whatsapp/*` module, signature verifier, webhook route or
  provider client was created — those remain P6.
- **No AI/prompt execution**: replies are deterministic safe commands only;
  unknown input returns help.

## Excluded (unchanged, as required)
AI provider runtime/prompts (P2), sales/draft tools (P3), admin inbox/settings UI
(P4), background jobs (P5), WhatsApp import webhook (P6), and P7 hardening.
P0's documented P7 follow-ups are preserved: **fresh-DB migration bootstrap**
(base tables live only in `schema.ts`; `0010` references `contacts`) and
**journal ordering** (`meta/_journal.json` idx 8 = `0010` while master carries
`0009_product_image.sql`; reconcile on chain merge).

## Next unit
P2 — AI Runtime + Read Tools: `src/lib/ai/{provider,config,registry}.ts`,
`src/lib/agents/loop.ts`, `src/lib/agents/system-prompt.ts` (AH garments/BOM/
talles/etapas/seña copy), and read-only tools (`getConversation`,
`findMissingInfo`, `salesPerformance`, `lookupOrder`, `lookupCustomer`,
`quotePreview`). External content stays untrusted; no authoritative facts invented.
