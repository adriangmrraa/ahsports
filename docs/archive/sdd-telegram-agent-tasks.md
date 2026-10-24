# Tasks: ai-telegram-sales-agent

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | 3,500–4,500 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

### Work Units
Feature-branch-chain: PR1 base = tracker `feature/ai-telegram-sales-agent`; each next PR base = previous PR branch.
1. PR1 Foundation: migration 0010, crypto, RBAC, env.
2. PR2 Persistence + Telegram.
3. PR3 AI runtime + read tools.
4. PR4 Draft-only commerce tools.
5. PR5 Admin surfaces.
6. PR6 Jobs + WhatsApp import.
7. PR7 Hardening/verification/docs.

## P0 Foundation/Security/Config
- [ ] P0.1 Idempotent `0010_agent_platform.sql`: enums, 8 tables, unique(channel,platformMessageId).
- [ ] P0.2 `src/db/schema.ts`: conversations, chat_messages, session states, memories, idempotency_keys, audit_events, agent_config.
- [ ] P0.3 Port AES-256-GCM `src/lib/crypto/secret-box.ts`; write-only (empty=keep, `CLEAR`=wipe).
- [ ] P0.4 `src/lib/env.ts` Zod requires SESSION_SECRET + SECRET_ENCRYPTION_KEY; drop `auth.ts:26` fallback.
- [ ] P0.5 Enforce `requireRole(["admin","gerencia"])` (`src/lib/auth.ts:82`) via `src/lib/agent/rbac.ts`.
- [ ] P0.6 Remove `db:push` from `render.yaml:6`.
- [ ] P0.7 `npm run typecheck`; migration re-run idempotent.

## P1 Persistence & Telegram
- [ ] P1.1 `src/lib/channels/intake.ts` writes in `withDbTransaction` keyed `${channel}:${platformMessageId}`.
- [ ] P1.2 Persist customer inbound (`senderKind:'customer'`).
- [ ] P1.3 Persist AI outbound (`senderKind:'agent'`).
- [ ] P1.4 Persist WhatsApp operator outbound (`senderKind:'operator', deliveryState:'imported'`).
- [ ] P1.5 Port `src/lib/channels/telegram.ts` + `src/app/api/telegram/webhook/[token]/route.ts`; verify secret, Zod.
- [ ] P1.6 Internal agent binds sender to authorized identity; persist inbound + reply.
- [ ] P1.7 Duplicate platformMessageId → one fact, safe success.

## P2 AI Runtime + Read Tools
- [ ] P2.1 `src/lib/ai/provider.ts` ChatProvider; `config.ts` resolves provider/model/tools; `registry.ts` adapter.
- [ ] P2.2 `src/lib/agents/loop.ts` tool loop; message content untrusted.
- [ ] P2.3 `src/lib/agents/system-prompt.ts`: AH garments/BOM/talles/etapas/seña copy.
- [ ] P2.4 Read tools: getConversation, findMissingInfo, salesPerformance, lookupOrder, lookupCustomer, quotePreview (`quoteOrder`).
- [ ] P2.5 Provider/model changeable via DB.

## P3 Guarded Draft-Only Tools
- [ ] P3.1 `draftLead`→contacts; `draftQuote` wraps `quoteOrder` (`src/lib/pricing.ts:101`) → `orders.status='borrador'`.
- [ ] P3.2 `draftOrder` reuses `createPublicOrder` (`src/app/actions/public-orders.ts:65`).
- [ ] P3.3 Money via toCents/fromCents (`src/lib/payments.ts:16,30`); multi-step writes in `withDbTransaction`.
- [ ] P3.4 Human confirmation required; NEVER finalize orders, register payments, advance production.
- [ ] P3.5 Draft inputs Zod-validated; `quoteOrder` throw → structured error.

## P4 Admin Surfaces
- [ ] P4.1 `src/app/(admin)/admin/agent/page.tsx` + `AgentConfigForm.tsx` (write-only secrets, records actor).
- [ ] P4.2 `.../agent/inbox/page.tsx` + `[conversationId]/page.tsx` searchable timeline, provenance.
- [ ] P4.3 Add nav + `messages`/`telegram`/`ai` icons in `src/components/layout/adminNavigation.ts`.

## P5 Jobs & Observability
- [ ] P5.1 `src/app/api/agent/reconcile/route.ts` cron: expire/purge idempotencyKeys, retry `failed`, retention.
- [ ] P5.2 `src/lib/agents/retention.ts`; audit via insert-only `audit_events`.
- [ ] P5.3 Retry-safe; no duplicate delivery or draft.

## P6 WhatsApp Import (observe)
- [ ] P6.1 `src/lib/channels/whatsapp/import.ts` + `signature.ts`; `api/whatsapp/webhook/[token]` config-gated, no send path.

## P7 Hardening & Docs
- [ ] P7.1 `npm run typecheck` + `npm run build` EXIT 0; no db:push/db:seed.
- [ ] P7.2 Sync graph: `node .opencode/skills/graph-first/scripts/graphify-sync.mjs`.
- [ ] P7.3 ADR `docs/02-ARCHITECTURE.md` + routes `docs/03-API-ROUTES.md`.
