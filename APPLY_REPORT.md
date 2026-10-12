# APPLY REPORT — `ai-telegram-sales-agent` · P3 Guarded Draft-Only Commerce Tools (Work Unit 4)

## Summary
Implemented Work Unit 4 only: **guarded draft-only commerce tools** (`effect: 'draft'`)
alongside the existing read tools, and extended the tool-calling loop to permit them.
Every draft write is reversible and non-authoritative — the only state persisted is
`contacts.status='nuevo'` and `orders.status='borrador'` (with a pricing snapshot for
quotes). Nothing is finalized, nothing is charged, production never advances, and every
draft result explicitly states that human confirmation is required. No admin UI, no jobs
and no WhatsApp provider were built.

## Delivery
- Change: `ai-telegram-sales-agent` · Strict TDD: `false` (standard mode)
- Strategy: `auto-chain` / `feature-branch-chain`
- Chained from P2 tip `175d9e3` (PR3). Branch
  `adriangmrraa/apply-ai-telegram-sales-agent-p3`.
- No merge, push, deploy, `db:push`, `db:seed`, or destructive DB write performed.
- No new migration: `borrador` is an existing order status and `contacts` already exists.

## Tasks completed (mark in tasks artifact)
- [x] P3.1 `draftLead` → creates/locates an organization by name and inserts (or reuses)
  a `contacts` row with `status='nuevo'`. Zod-validated (name + email/phone required).
- [x] P3.2 `draftQuote` → wraps `quoteOrder` (`src/lib/pricing.ts:101`) and persists the
  result as `orders.status='borrador'` with the pricing snapshot captured on
  `orders.snapshot`, plus `order_lines` with decimal-safe unit prices/costs.
- [x] P3.3 `draftOrder` → reuses the extracted internals of `createPublicOrder`
  (`src/app/actions/public-orders.ts:65`) to create a `borrador` order; money via
  `toCents`/`fromCents` (`src/lib/payments.ts:16,30`); all multi-step writes inside
  `withDbTransaction` (`src/lib/db-transaction.ts:20`).
- [x] P3.4 Hard guard: no handler finalizes orders, registers payments, cancels payments
  or advances production; the loop refuses any effect outside `'read'`/`'draft'`; every
  draft result carries `requiresHumanConfirmation: true` + an explicit note.
- [x] P3.5 Every draft input is Zod-validated; `quoteOrder` throwing is caught into a
  structured tool error (`{ ok:false, error:'quote_failed', reason }`) — no raw exception
  text or stack leaks.

## Files
- `src/lib/agents/tools/draft.ts` (new) — `draftLeadTool`, `draftQuoteTool`,
  `draftOrderTool` (all `effect: 'draft'`) + `draftTools`. Money via `money()` =
  `fromCents(toCents(v))`. `withDbTransaction` imported lazily (same pattern as
  `src/lib/ai/config.ts`) so the module stays importable without a server-only runtime.
- `src/lib/orders/draft-order.ts` (new) — `createOrderDraftTx(tx, input)` +
  `OrderDraftDomainError`: the transactional core extracted verbatim from
  `createPublicOrder` (product/size/min-order validation, item↔talla reconciliation,
  organization + contact resolution, order+line+items insert). Shared by the public
  action and `draftOrder`; writes only `borrador` state.
- `src/app/actions/public-orders.ts` (modified) — `createPublicOrder` now delegates its
  core to `createOrderDraftTx`; behavior preserved (same error messages, same org note via
  `organizationNotes`, same attachment claiming/session consumption). Removed the now-unused
  imports. `PublicOrderDomainError extends OrderDraftDomainError` so one catch covers both.
- `src/lib/agents/tools/types.ts` (modified) — added `AGENT_TOOL_EFFECTS = ['read','draft']`
  (single source of truth for executable effects) + updated contract docs.
- `src/lib/agents/tools/registry.ts` (modified) — registers `draftTools`;
  `resolveEnabledTools` now filters by `AGENT_TOOL_EFFECTS` instead of hard-coding `'read'`.
- `src/lib/agents/loop.ts` (modified) — refusal check uses `AGENT_TOOL_EFFECTS`; permits
  `'draft'`, still refuses unknown/other effects, unknown tools and invalid args.
- `src/lib/agents/system-prompt.ts` (modified) — domain prompt now describes the drafting
  scope and the rule that drafts are reversible proposals requiring human confirmation.

## Security boundaries
- **Effect gate**: `AGENT_TOOL_EFFECTS` is the closed allowlist; anything else is reported
  to the model as `effect_not_allowed` and never executed.
- **Reversible-only writes**: draft handlers persist only `contacts.status='nuevo'` and
  `orders.status='borrador'`. No payment, production or finalization path is importable
  from the draft modules.
- **Untrusted input**: draft args are Zod-validated before execution; a client-supplied
  price field is stripped by Zod (pricing is authoritative and server-side only).
- **Structured errors**: `quoteOrder` failures map to a stable `reason` code with a generic
  message; `OrderDraftDomainError` domain messages are returned without internals.
- **Human confirmation**: every successful or failed draft result states that human review
  and confirmation is required.

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — identical to baseline (0 new; `diff` empty) |
| `npm run build` | **PRE-EXISTING ENVIRONMENTAL BASELINE FAILURE** — `DATABASE_URL is required in production` (`src/db/client.ts:8`) at "Collecting page data"; identical message/stage reproduced on the pre-change HEAD. The specific pre-existing route that trips first varies run-to-run (baseline `[id]/applications`, P3 run `[id]`) — same message, same `db/client` chunk, no new failure mode. No P3 module is imported by any route. |
| DB-free behavior check (temp `tsx`, removed) | PASS (50 assertions) — registry closed set + effect allowlist; loop EXECUTES `'draft'` but REFUSES an unknown effect and still rejects unknown tool / invalid JSON / Zod-invalid args; draft Zod rejects empty/negative/zero/non-integer quantities and bad contact/order data, and strips client-supplied prices; `toCents`/`fromCents` round-trip and reject malformed money; static scan proves no payment/production call and only reversible statuses (`borrador`/`nuevo`) are written, and that `requiresHumanConfirmation` is declared |

## Decisions / notes
- **Extraction over duplication**: the `createPublicOrder` transactional core moved to
  `src/lib/orders/draft-order.ts` so `draftOrder` genuinely reuses it rather than copying
  ~80 lines. Public behavior is preserved (error strings, org-note text via a parameter,
  attachment/session flow unchanged).
- **Lazy `withDbTransaction` import** in `draft.ts` mirrors `config.ts` and keeps the tool
  module importable without the Next `server-only` runtime (used by the behavioral check).
- **`AGENT_TOOL_EFFECTS` as the single allowlist** consumed by both the registry and the
  loop, so the two can never drift.
- **Not wired into the live path yet**: the loop/tools are a library; wiring the sales
  runtime into intake and the admin config surface remain P4/P5+.

## Excluded (unchanged, as required)
Admin inbox/settings UI (P4), background jobs and retention (P5), WhatsApp import webhook
(P6), P7 hardening. Deferred to P4/P5: wiring the loop + `enabledTools` config into the live
webhook router; audit-event emission for draft writes. P7 follow-ups preserved: fresh-DB
migration bootstrap and journal ordering (`0010` vs `0009`); `wrapUntrustedContent` sentinel
neutralization before wiring the loop to live inbound content.

## Next unit
P4 — Admin surfaces: agent config form (write-only secrets, records actor), searchable
conversation inbox/timeline with provenance, and nav entries (`messages`/`telegram`/`ai`).
