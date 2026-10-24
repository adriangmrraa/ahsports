# Design: ai-telegram-sales-agent

Artifact reference (Engram): `sdd/ai-telegram-sales-agent/design` (project ahsports)
Base commit: 675e6e1. Inputs: explore #5323, proposal #5325, spec #5330, guardrails #5324, plan #5332, testing-capabilities #5312.

## Architecture
One channel runtime persists every message as a DB fact; two agents (customer sales, internal operator) consume it. DB is the only source of truth; agents never invent prices/stock/payments — they call `quoteOrder`/services. Telegram-first; WhatsApp is observe/import only. Provider-neutral: provider/model are DB config, not code.

## Schema — migration `src/db/migrations/0010_agent_platform.sql` (idempotent, additive)
Enums: `channel('telegram','whatsapp')`, `msg_direction('inbound','outbound')`, `sender_kind('customer','agent','operator')`, `delivery_state('received','queued','sent','failed','imported')`, `conversation_status('open','closed')`, `agent_kind('customer','operator')`.

Tables (added to `src/db/schema.ts`, extending the 621-line drizzle schema):
- `conversations(id uuid pk, customerId→contacts, organizationId→organizations, channel, externalThreadId, status, lastMessageAt, unreadCount, createdAt)` — unique(channel, externalThreadId).
- `chatMessages(id, conversationId→conversations, channel, platformMessageId, direction, senderKind, senderRef text, contentType('text','image','document','system'), content text, rawPayload jsonb, deliveryState, createdAt)` — **unique(channel, platformMessageId)** = idempotency anchor.
- `agentSessionStates(conversationId pk, kind, summary text, state jsonb, updatedAt)`.
- `agentMemories(id, scope('customer','operator','global'), key, value jsonb, expiresAt nullable)`.
- `idempotencyKeys(key text pk, scope, response jsonb, createdAt, expiresAt)`.
- `auditEvents(id, actorKind, actorRef, action, entityType, entityId, correlationId, payload jsonb, createdAt)` — insert-only, mirrors `payment_events` discipline.
- `agentConfig(id, provider text, model text, systemPrompt text, enabledTools jsonb, botTokenEnc text, providerKeyEnc text, webhookSecretEnc text, updatedById→users, updatedAt)`.

JSONB contracts (typed as in `orders.snapshot`, schema.ts:289/:322): `agentConfig.enabledTools: ToolId[]`, `rawPayload: TelegramUpdate | WhatsAppImport`, `auditEvents.payload: AuditPayload` (`{before?,after?,error?,issues?}`).

## Credentials + RBAC
`src/lib/crypto/secret-box.ts` ports Muzapp AES-256-GCM over `SECRET_ENCRYPTION_KEY`; write-only UX (empty=keep, `CLEAR`=wipe), never returned/logged. `src/lib/env.ts` Zod-`safeParse` requires `SESSION_SECRET`+`SECRET_ENCRYPTION_KEY` in prod (removes `auth.ts:26` fallback). `src/lib/agent/rbac.ts` enforces the currently-unused `requireRole(["admin","gerencia"])` (`src/lib/auth.ts:82`) on `/admin/agent/**`, webhook admin, and `api/agent/**`; service-principal seam documented for P7 token auth.

## Provider-neutral runtime + prompts/tools
`src/lib/ai/provider.ts` exposes `interface ChatProvider { complete(messages, tools) }`; `src/lib/ai/config.ts` resolves provider/model/tools from `agentConfig`; `src/lib/ai/registry.ts` maps the model string to an adapter. `src/lib/agents/loop.ts` runs the tool-calling loop; `src/lib/agents/system-prompt.ts` composes AH domain copy (prendas, BOM, talles, etapas de producción, seña — **never Muzapp food logic**).

Tool contract `{ id, description, inputSchema: ZodType, handler, effect: 'read'|'draft' }`:
- read: `getConversation`, `findMissingInfo`, `salesPerformance`, `lookupOrder`, `lookupCustomer`, `quotePreview` (calls `quoteOrder`).
- draft (never finalize): `draftLead`→`contacts`; `draftQuote`→wrap `quoteOrder` (`src/lib/pricing.ts:101`) into `orders.status='borrador'`; `draftOrder`→reuse `createPublicOrder` internals (`src/app/actions/public-orders.ts:65`). Money via `toCents/fromCents` (`src/lib/payments.ts:16,30`); multi-step writes inside `withDbTransaction` (`src/lib/db-transaction.ts:20`, Neon Pool — neon-http lacks tx). `quoteOrder` throws → caught into structured tool errors.

## Channels
- `src/app/api/telegram/webhook/[token]/route.ts` + `src/lib/channels/telegram.ts` (port Muzapp `bot.ts`).
- `src/lib/channels/whatsapp/import.ts` (observe/import only) + signature verify `src/lib/channels/signature.ts`; `api/whatsapp/webhook/[token]` is config-gated, **no send path**.
- `src/lib/channels/intake.ts` normalizes then writes inside a transaction keyed by `${channel}:${platformMessageId}`; operator outbound WhatsApp = `direction:'outbound', senderKind:'operator', deliveryState:'imported'`.

## Admin surfaces
`src/app/(admin)/admin/agent/page.tsx` (server) + `AgentConfigForm.tsx` (client, write-only secrets); `.../agent/inbox/page.tsx` and `.../[conversationId]/page.tsx` searchable timeline with provenance. Nav entries added to `src/components/layout/adminNavigation.ts` (icons `messages`,`telegram`,`ai`). Components named exports, pages default exports, semantic Tailwind.

## Jobs / retention
`src/app/api/agent/reconcile/route.ts` (cron): expire+purge `idempotencyKeys`, retry `deliveryState='failed'`, retention sweep of `rawPayload`/expired `agentMemories` (`src/lib/agents/retention.ts`). Everything idempotent and audited via `auditEvents`.

## Verification
No test runner (#5312): gate = `npm run typecheck` + `npm run build` EXIT 0; migration re-run idempotency; Zod rejects bad webhook/config input; inspect routes; `node .opencode/skills/graph-first/scripts/graphify-sync.mjs` after code lands. No `db:push`/`db:seed`; remove `db:push` from `render.yaml:6`.
