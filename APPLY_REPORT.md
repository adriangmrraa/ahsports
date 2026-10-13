# APPLY REPORT — `ai-telegram-sales-agent` · P7 Hardening, migration reconciliation & docs (final)

## Summary
Final phase **P7** on branch `adriangmrraa/apply-ai-telegram-sales-agent-p7`
(base = P6 tip `c8ce11a`). Four accumulated hardening findings were fixed, the
migration/journal bootstrap risk was verified and documented (no risky hand-written
baseline), the agent-platform ADR and API-route inventory were added, and the
graph-sync step was confirmed unavailable (script absent) and documented as skipped.

No `db:push`, no `db:seed`, no merge/push/deploy.

## 1. Hardening fixes

1. **Sentinel breakout (P2 finding).** `wrapUntrustedContent` (`src/lib/agents/loop.ts`)
   now neutralizes the delimiter token inside untrusted content before wrapping
   (`neutralizeUntrustedSentinel`), case-insensitively. An inbound message that
   contains the literal `<<<END_UNTRUSTED_CUSTOMER_MESSAGE>>>` can no longer forge
   the closing sentinel and escape the delimited data block. Covered by a new
   regression assertion in `scripts/check-agent-tools.mts`.
2. **`error.message` leak (P3 finding).** The loop's generic tool `catch` no longer
   forwards raw exception text/stack to the model — every thrown tool failure
   (domain or unexpected) becomes a stable `{ error: "tool_error", message: <generic> }`
   result. Domain failures surfaced as tool results were also hardened:
   `draftOrder` (`src/lib/agents/tools/draft.ts`) maps `OrderDraftDomainError` to a
   stable `reason` code via `orderDraftFailureReason` instead of echoing
   `error.message`. `draftQuote` already returned stable reason codes.
3. **`auditsWritten` hardcoded 0 (P5 finding).** `runReconcile`
   (`src/lib/agents/reconcile.ts`) now writes audits through a
   `createAuditRecorder` that counts every inserted row; the summary reports the
   real count `audit.written + 1` (the `+1` is the terminal
   `agent.reconcile.completed` row, documented in code). No more misleading metric.
4. **`draftLead` role free-text (P3 finding).** `role` is now constrained to a
   closed Zod enum (`DRAFT_LEAD_ROLES`: cliente, profesor, entrenador, encargado,
   coordinador, administrativo) so a prompt-injected value cannot land arbitrary
   text in `contacts.role`. Documented as the agent-side canonical vocabulary,
   promotable to `src/lib/validators.ts` if the app adopts it globally.

## 2. Migration bootstrap + journal reconciliation (documented, not executed)

- **Journal is internally consistent:** `meta/_journal.json` entries are `idx 0..8`
  with tags `0001..0008` then `idx 8 = 0010_agent_platform`; monotonic, no
  duplicate tags.
- **Confirmed gap:** `0010_agent_platform.sql` declares FKs to `contacts`,
  `organizations` and `users`, but **no migration in this repo creates those core
  tables** (they came from an original `db:push`). A fresh DB running only
  `db:migrate` will fail. Remediation documented in `docs/02-ARCHITECTURE.md`
  (ADR-19): generate a `0000_core_baseline.sql` from a reference DB and chain it
  before `0001`, or provision fresh DBs with `db:push` then `db:migrate`. No
  hand-written giant baseline was produced (cannot be verified in this DB-less
  worktree).
- **Chain-merge reconciliation for `0009_product_image.sql`** (exists on
  `master`, absent here): documented in ADR-19. On merge, `0009` must slot before
  `0010` with its own journal `idx`, and `0010` must be re-indexed after it
  (`idx 8 = 0009`, `idx 9 = 0010`), adjusting `when` to preserve order, then
  validated with `npm run db:migrate` on a reference DB.

## 3. Docs
- `docs/02-ARCHITECTURE.md` — added decision row **D19** + full **ADR-19**
  (provider-neutral runtime `provider → protocol → adapter` with model
  pass-through; channel runtime; draft-only commerce tools; secrets-at-rest;
  RBAC boundary; service-principal seam deferred to token auth; fresh-DB
  migration bootstrap risk + merge reconciliation).
- `docs/03-API-ROUTES.md` — added section **L2. Agente IA**: `POST
  /api/telegram/webhook/[token]`, `GET|POST /api/whatsapp/webhook/[token]`,
  `GET|POST /api/agent/reconcile`, and the admin pages `/admin/agent`,
  `/admin/agent/inbox`, `/admin/agent/inbox/[conversationId]`,
  `/admin/agent/telegram`; updated section N (auth exceptions + route counts).

## 4. Graph sync (P7.2) — SKIPPED (script absent)
`node .opencode/skills/graph-first/scripts/graphify-sync.mjs` does **not** exist
in this repo: there is no `.opencode/` directory and no `graphify-sync.*` file
anywhere outside `node_modules`. The graph-sync step is **skipped** — no script
was invented.

## 5. Files changed
- `src/lib/agents/loop.ts` — sentinel neutralization + non-leaking tool-failure result.
- `src/lib/agents/tools/draft.ts` — `DRAFT_LEAD_ROLES` enum on `draftLead.role`; `orderDraftFailureReason` for `draftOrder`.
- `src/lib/agents/reconcile.ts` — `createAuditRecorder`; real `auditsWritten`.
- `scripts/check-agent-tools.mts` — P7 regression assertions (role enum + sentinel).
- `docs/02-ARCHITECTURE.md`, `docs/03-API-ROUTES.md` — docs (above).

## 6. Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — **identical to baseline** (0 new) |
| `npm run check:agent-tools` | PASS (registry projection + new P7 role-enum/sentinel assertions) |
| `npm run build` | `✓ Compiled successfully` (lint/types valid). Then **PRE-EXISTING ENVIRONMENTAL BASELINE**: `DATABASE_URL is required in production` (`src/db/client.ts:7`) at "Collecting page data" for `/api/applications/[id]` — a pre-existing route statically importing `@/db/client`; no `.env` in this worktree. Same message/stage as the documented P5/P6 baseline. **No new failure mode.** True `build EXIT 0` requires a real `DATABASE_URL`. |

## 7. Deferred / remaining risks for the merge
- **P5.4** — the AI loop + `enabledTools` are still a library; they are not wired
  into the live webhook router. (Deliberately out of P7 scope.)
- **P5 crash window** — a crash between the `failed→queued` retry claim and the
  final write can leave a row stuck `queued`. Documented carry-forward.
- **Reconcile audit** `correlationId` from `platform_messageId` (varchar 255) vs
  `audit_events.correlation_id` (varchar 64) can overflow for long ids.
- **`AGENT_MEMORY_DEFAULT_TTL_MS`** exported but unused.
- **Migration order** must be reconciled at merge time (`0009` before `0010`, see
  ADR-19) and a fresh-DB core baseline is required before `db:migrate` alone is
  sufficient.
- **WhatsApp inbound** `messages`/`statuses` still not imported (observe-only
  operator outbound by design); non-image/document types coerce to `text`;
  `whatsAppWebhookSchema` requires a non-empty `entry` array.
