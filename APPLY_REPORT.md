# APPLY REPORT — `ai-telegram-sales-agent` · P0 Foundation (PR1)

## Summary
Implemented Work Unit 1 (P0 Foundation/Security/Config) only: idempotent agent
platform migration, Drizzle schema/types/relations, AES-256-GCM secret box, env
validation, `requireRole` enforcement seam, and deployment config fix. No
webhook, inbox, AI runtime, tools, UI, jobs, or WhatsApp integration was built.

## Delivery
- Change: `ai-telegram-sales-agent` · Strict TDD: `false` (standard mode)
- Strategy: `auto-chain` / `feature-branch-chain`
- PR1 base boundary: tracker `feature/ai-telegram-sales-agent` @ `334561f`
  (branch `adriangmrraa/apply-ai-telegram-sales-agent-p0`)
- No merge, push, deploy, `db:push` or `db:seed` performed.

## Tasks completed (mark in tasks artifact)
- [x] P0.1 `src/db/migrations/0010_agent_platform.sql` — 9 enums, 8 tables,
  `unique(channel, platform_message_id)`; all `IF NOT EXISTS` +
  `duplicate_object` guards (idempotent, additive).
- [x] P0.2 `src/db/schema.ts` — `conversations`, `chat_messages`,
  `agent_session_states`, `agent_session_events`, `agent_memories`,
  `idempotency_keys`, `audit_events`, `agent_config` + 5 `relations`.
- [x] P0.3 `src/lib/crypto/secret-box.ts` — AES-256-GCM over
  `SECRET_ENCRYPTION_KEY`; `resolveSecretUpdate` (empty = keep, `CLEAR` = wipe);
  never returns/logs plaintext.
- [x] P0.4 `src/lib/env.ts` — Zod `safeParse` requiring `SESSION_SECRET` +
  `SECRET_ENCRYPTION_KEY`; `auth.ts` fallback removed (`getSessionSecret()`).
- [x] P0.5 `src/lib/agent/rbac.ts` — `requireAgentAdmin()` /
  `authorizeAgentApi()` over `requireRole(["admin","gerencia"])`, with the
  service-principal seam documented for P7.
- [x] P0.6 `render.yaml` — `db:push` removed (now `db:migrate`), added
  `SECRET_ENCRYPTION_KEY`; `.env.example` updated.
- [x] P0.7 `npm run typecheck` EXIT 0; migration idempotent by construction
  (live re-run intentionally skipped — no DB writes).

## Files
- `src/db/migrations/0010_agent_platform.sql` (new)
- `src/db/migrations/meta/_journal.json` (added idx 8)
- `src/db/schema.ts` (enums, tables, relations, JSONB types)
- `src/lib/env.ts` (new)
- `src/lib/crypto/secret-box.ts` (new)
- `src/lib/agent/rbac.ts` (new)
- `src/lib/auth.ts` (drop hardcoded fallback)
- `render.yaml`, `.env.example`

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — identical to baseline (0 new) |
| `npx drizzle-kit check` | PASS |
| `npm run build` | **PRE-EXISTING BASE FAILURE** — `DATABASE_URL is required in production` (`src/db/client.ts`) with no `.env`/reachable Neon in this isolated worktree; reproduced identically on `HEAD`. Compilation completes (only DB pre-render/module-load fails). P0 adds no routes or pages. |

## Decisions / notes
- 8th table: `agent_session_events` — the tasks artifact states 8 tables while
  the design enumerates 7; the proposal/explore reference "session
  state/events". Added the events table to honor the count and session audit
  parity (no sessions/effect-claims chain built).
- `env.ts` is lazy (no import-time throw) so it never breaks `next build`; it
  fails fast in production via `getSessionSecret` / `assertServerEnv`.
- Migration number `0010`: master carries `0009_product_image.sql` but this
  worktree base (`334561f`) predates it. Journal idx 8 is correct for this
  branch; the chain merge must reconcile indices once `0009` lands.

## Next unit
P1 — Persistence & Telegram (`channel-runtime`, intake keyed by
`${channel}:${platformMessageId}`).
