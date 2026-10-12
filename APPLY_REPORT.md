# APPLY REPORT — `ai-telegram-sales-agent` · P4 Admin Surfaces (Work Unit 5)

## Summary
Implemented Work Unit 5 only: the **admin surfaces** for the agent platform.
An authorized admin (role `admin`/`gerencia`) can now:

1. **Configure the agent** at `/admin/agent` — provider, model, system prompt,
   enabled tools and the three credentials (bot token, provider key, webhook
   secret) as **write-only** fields, with the acting admin recorded on
   `agent_config.updatedById`.
2. **Browse conversations** at `/admin/agent/inbox` (searchable, filterable) and
   open a **provenance-rich timeline** at `/admin/agent/inbox/[conversationId]`.
3. **See Telegram channel status** at `/admin/agent/telegram`.
4. **Bind an operator** — the P1 `bindOperatorIdentity(channel, transportId, userId)`
   contract is now wired to a validated admin form/action.

New nav entries (`Agente IA`, `Conversaciones`, `Telegram`) with the `ai`,
`messages` and `telegram` icons were added to the admin sidebar. No AI loop was
wired into the live webhook router, no jobs, no WhatsApp provider — those remain
P5/P6/P7.

## Tasks completed (mark in tasks artifact)
- [x] **P4.1** `src/app/(admin)/admin/agent/page.tsx` (server, `await requireAgentAdmin()`)
  + `AgentConfigForm.tsx` (client). Configures provider/model/systemPrompt/enabledTools.
  Secret fields are write-only: empty = keep, `CLEAR` = wipe; only a boolean
  "configured" status is ever sent to the client — never ciphertext or plaintext.
  Persisted by `saveAgentConfig` (`src/app/actions/agent-config.ts`) which records
  `updatedById` and resolves secrets via `resolveSecretUpdate` + `encryptSecret`.
- [x] **P4.2** `.../agent/inbox/page.tsx` (searchable conversation list, `q` + channel
  filter) and `.../agent/inbox/[conversationId]/page.tsx` (timeline with provenance:
  channel, direction, senderKind, deliveryState, contentType, timestamp, senderRef,
  platform message id). Both `await requireAgentAdmin()`.
- [x] **P4.3** Nav entries + icons: extended `AdminNavIcon` with `ai`/`messages`/
  `telegram`, added the three `navigation` entries and the `ADMIN_NAV_ICONS`
  mappings (`Bot`, `MessagesSquare`, `Send`).
- [x] **Operator binding wire**: `bindAgentOperator` action + `OperatorBindingForm`
  client component on the config page, calling the previously-unwired
  `bindOperatorIdentity` (`src/lib/agent/identity.ts:66`). The action validates the
  target user exists, is active and holds an authorized role before binding.

## Files
- `src/app/actions/agent-config.ts` (new) — `saveAgentConfig` and `bindAgentOperator`
  server actions. `saveAgentConfig`: `requireAgentAdmin()` → Zod `safeParse` →
  filter `enabledTools` to the closed registry set → load current encrypted secrets →
  `resolveSecretUpdate` for each → upsert `agent_config` id=1 with `updatedById` +
  `updatedAt` → `revalidatePath("/admin/agent")`. Encryption failures (e.g. missing
  `SECRET_ENCRYPTION_KEY`) surface as a generic error, never internals.
  `bindAgentOperator`: validates the operator user, then calls `bindOperatorIdentity`.
- `src/app/(admin)/admin/agent/page.tsx` (new) — server page; loads config, operator
  users, current bindings and the closed tool set; passes a secret-free view model to
  the client forms.
- `src/app/(admin)/admin/agent/AgentConfigForm.tsx` (new) — client form; tool
  checkboxes grouped by effect (read/draft); write-only secret inputs with a
  "Configurado"/"Sin configurar" badge and a `CLEAR` toggle; clears secret inputs
  after a successful save.
- `src/app/(admin)/admin/agent/OperatorBindingForm.tsx` (new) — client form to bind
  `channel` + `transportId` to an authorized operator user.
- `src/app/(admin)/admin/agent/inbox/page.tsx` (new) — searchable conversation list.
- `src/app/(admin)/admin/agent/inbox/[conversationId]/page.tsx` (new) — message
  timeline with full provenance.
- `src/app/(admin)/admin/agent/telegram/page.tsx` (new) — Telegram channel status
  (bot token / webhook secret configured, secret header name, non-secret webhook
  path fingerprint).
- `src/components/layout/adminNavigation.ts` (modified) — three new icon keys,
  three nav entries, three icon mappings.

## Security boundaries
- **RBAC**: every agent page/action uses `requireAgentAdmin()` (admin/gerencia), NOT
  `requireUser()`. Unauthenticated/unauthorized callers are redirected by the
  existing `redirect("/admin")` boundary before any load or write.
- **Write-only secrets**: submitted secrets go through `resolveSecretUpdate`
  (empty = keep, `CLEAR` = wipe, else `encryptSecret`). The client receives only
  boolean "configured" flags; the stored ciphertext is never rendered or logged.
- **No secret leakage in errors**: encryption/DB failures return a generic message.
- **Validated inputs**: both actions validate with Zod `safeParse`; `enabledTools`
  is additionally filtered to the closed `ALL_AGENT_TOOLS` set (same gate the
  runtime uses), so an unknown id can never be persisted.
- **Operator binding guard**: the bound user must exist, be active and hold an
  authorized role; the resolver still re-checks at message time.

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — **byte-identical to baseline** (`diff` empty, 0 new) |
| `npm run build` | `✓ Compiled successfully` (new routes compiled; lint + type validity passed). Then **PRE-EXISTING ENVIRONMENTAL BASELINE FAILURE** — `DATABASE_URL is required in production` (`src/db/client.ts:7`) at "Collecting page data". Same message/stage reproduced on the pre-change HEAD (baseline route `/api/attachments/[id]`, this run `/api/attachments/[id]/applications`); the specific route varies run-to-run. No new failure mode introduced by P4. |
| `npm run check:agent-tools` | PASS (unchanged; registry import still DB-free-safe) |

## Decisions / notes
- **Boolean secret status over masked ciphertext**: the config page deliberately
  sends only `{ botToken, providerKey, webhookSecret }` booleans to the client
  instead of `maskSecret`-ing the stored ciphertext. Masking ciphertext leaks
  meaningless-but-real bytes of the encrypted blob; a boolean is strictly safer and
  satisfies the "never returned as plaintext — show only a masked status" rule.
- **`SECRET_CLEAR` literal duplicated in the client**: `src/lib/crypto/secret-box.ts`
  is `server-only`, so `AgentConfigForm.tsx` declares `const SECRET_CLEAR = "CLEAR"`
  with a comment pointing at the source of truth; both sides must agree.
- **Dedicated `/admin/agent/telegram` status page**: the `telegram` nav entry needed
  a real destination (no broken links, per the KI-02 discipline). This matches the
  design's "Telegram status" admin view. It shows only non-secret readiness signals;
  the webhook path is the documented non-secret `sha256(secret)[0:32]` fingerprint.
- **Search filtering in JS after `LIMIT 200`**: mirrors the P0-era `/admin/pedidos`
  precedent (no `ilike` yet); acceptable for the current data volume.

## Excluded (unchanged, as required)
Wiring the AI loop + `enabledTools` into the live webhook router (P5), background
jobs/retention (P5), WhatsApp import webhook (P6), P7 hardening/docs.
No migration, no `db:push`, no `db:seed`, no merge/push/deploy.

## Next unit
P5 — Jobs & observability: `api/agent/reconcile` cron (expire/purge idempotency
keys, retry `failed` deliveries, retention sweep), `src/lib/agents/retention.ts`,
audit emission, and wiring the loop into the live router.
