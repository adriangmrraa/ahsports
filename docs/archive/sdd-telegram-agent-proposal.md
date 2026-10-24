# Proposal: ai-telegram-sales-agent

## Intent
AH Sports OS has no messaging, AI, or conversation persistence; `requireRole` (`src/lib/auth.ts:82`) is unused. We add a Telegram-first operator agent and an AI customer sales agent sharing one channel runtime that persists every message as a DB fact and helps analyse and draft — never finalizing orders or payments autonomously.

## Scope
### In Scope
- P0 (blocking): migration 0010, secret encryption, RBAC, env validation, render.yaml fix.
- Telegram-first runtime (WhatsApp import/observe); inbound + outbound persisted.
- Admin-configurable AI provider/model; read-only analysis (conversations, gaps, performance).
- Draft-only lead/quote/order tools wrapping existing services.
- Admin surfaces: agent config + inbox.

### Out of Scope
- Autonomous order/payment finalization, production advance.
- WhatsApp Cloud API sending (observe/import only).
- Attribution (P6), hardening (P7), NextAuth/shadcn/Muzapp dead code.

## Capabilities
### New Capabilities
- `agent-platform-foundations`: migration 0010 (conversations, chat_messages, session state/events, agent_memories, idempotency, agent_config); AES-256-GCM; RBAC + service-principal; env validation.
- `channel-runtime`: shared Telegram-first (WhatsApp observe) webhooks; idempotent intake by platformMessageId.
- `conversation-persistence`: customer inbound, agent outbound, imported WhatsApp operator outbound.
- `ai-agent-core`: admin-configurable provider/model; agent loop; read-only analysis tools.
- `agent-write-tools`: draft-only lead/quote/order tools.
- `agent-admin-surfaces`: write-only-secret config + inbox.

### Modified Capabilities
- None (greenfield; auth enforcement in `agent-platform-foundations`).

## Approach
Port ~14 Muzapp core files (encryption, idempotency, signature, logger, ai config, telegram bot); adapt ~30 (agent loop, session machine, tools wrapping `quoteOrder`/`createPublicOrder`/`registerPaymentTx`, admin screens, config); rebuild ~22 (tables, webhooks, inbox, prompts, env, CI). Enforce `requireRole`; cents inside `withDbTransaction`; idempotent `0010_*.sql`; never `db:push`/`db:seed`.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `src/db/schema.ts`, `migrations/0010_*.sql` | New | Agent/conversation tables |
| `src/lib/auth.ts` | Modified | Enforce requireRole |
| `src/app/api/{telegram,whatsapp}/webhook` | New | Channel runtime |
| `src/lib/ai/**`, `src/lib/agents/**` | New | Agent + tools |
| `src/app/(admin)/admin/agent/**` | New | Config + inbox |
| `render.yaml` | Modified | Remove db:push |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Agent inherits full admin | High | P0 blocking; enforce first |
| Retries duplicate writes | Med | Idempotency key |
| neon-http lacks transactions | Med | `withDbTransaction` Pool |
| LLM-hallucinated prices | Med | Always call `quoteOrder` |

## Rollback Plan
P7 merges last; revert its merge commit. Migration 0010 is additive, so reverting restores prior state; no `db:push`/`db:seed`.

## Dependencies
- Telegram bot token + AI provider keys (encrypted).
- Muzapp source reference.

## Success Criteria
- [ ] Migration 0010 idempotent; RBAC enforced on admin routes.
- [ ] Inbound + agent outbound persisted as DB facts.
- [ ] Draft tools only; zero autonomous finalization.
- [ ] Provider/model changeable from admin without code change.
- [ ] typecheck + build pass.
