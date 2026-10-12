# APPLY REPORT — `ai-telegram-sales-agent` · P2 AI Runtime + Read Tools (Work Unit 3)

## Summary
Implemented Work Unit 3 only: a **provider-neutral chat runtime** (interface +
fetch adapter + registry + DB-backed config resolution), the **tool-calling agent
loop** that treats every inbound message as untrusted data, an **AH Sports domain
system prompt** (prendas, BOM, talles, etapas de producción, seña) with a hard
prompt-injection guard, and **six read-only tools** with Zod `inputSchema`.
No payment, no final order, no production advancement, no draft/write tools, no
admin UI, no jobs and no WhatsApp provider were built.

## Delivery
- Change: `ai-telegram-sales-agent` · Strict TDD: `false` (standard mode)
- Strategy: `auto-chain` / `feature-branch-chain`
- Chained from P1 commit `bfe0f96` (PR2). Branch
  `adriangmrraa/apply-ai-telegram-sales-agent-p2`.
- Commit: `318394f` (12 files, +1,215).
- No merge, push, deploy, `db:push`, `db:seed`, or destructive DB write performed.

## Tasks completed (mark in tasks artifact)
- [x] P2.1 `src/lib/ai/provider.ts` (`ChatProvider` interface), `src/lib/ai/config.ts`
  (resolves provider/model/systemPrompt/enabledTools from `agent_config`),
  `src/lib/ai/registry.ts` (protocol → adapter). No provider, model or endpoint
  is hardcoded — all resolved from DB config + env.
- [x] P2.2 `src/lib/agents/loop.ts` — tool-calling loop; inbound content is only
  ever appended as a delimited `user` message, never as a system instruction.
- [x] P2.3 `src/lib/agents/system-prompt.ts` — AH copy (prendas, BOM/receta,
  talles, etapas de producción, seña, cotización) + `PROMPT_INJECTION_GUARD`.
  No Muzapp/food logic.
- [x] P2.4 Read tools with `effect: 'read'` and Zod `inputSchema`:
  `getConversation`, `findMissingInfo`, `salesPerformance`, `lookupOrder`,
  `lookupCustomer`, `quotePreview` (wraps `quoteOrder` from `src/lib/pricing.ts`).
- [x] P2.5 Provider/model changeable via DB (`agent_config.provider` /
  `.model`) — no code change required to switch.

## Files
- `src/lib/ai/provider.ts` (new) — `ChatProvider`, message/tool/completion types,
  `ChatProviderError`.
- `src/lib/ai/adapters/chat-completions.ts` (new) — fetch-based adapter for the
  `chat-completions` wire protocol; model/key/endpoint injected.
- `src/lib/ai/config.ts` (new) — `resolveRuntimeFromConfig` (pure) +
  `loadAgentConfigRow` / `resolveAgentRuntime` (DB). `AGENT_AI_*` env.
- `src/lib/ai/registry.ts` (new) — protocol registry; built-in
  `chat-completions`; `createChatProvider(runtime)`.
- `src/lib/agents/system-prompt.ts` (new) — domain copy + injection guard.
- `src/lib/agents/injection-guard.ts` (new) — advisory manipulation-pattern
  detector used to annotate the untrusted block.
- `src/lib/agents/loop.ts` (new) — bounded tool-calling loop; Zod-validates every
  model-supplied argument; refuses `effect !== 'read'`.
- `src/lib/agents/tools/types.ts` (new) — `AgentTool` contract + `toToolSpec`.
- `src/lib/agents/tools/schema.ts` (new) — Zod → JSON-schema projection.
- `src/lib/agents/tools/read.ts` (new) — the six read-only tools.
- `src/lib/agents/tools/registry.ts` (new) — closed tool set + allowlist
  resolution (hard-filters to `effect: 'read'`).
- `.env.example` (modified) — `AGENT_AI_API_KEY`, `AGENT_AI_BASE_URL`,
  `AGENT_AI_ENDPOINT_URL`, `AGENT_AI_ENDPOINT_PATH` (+ per-provider overrides).

## APIs / types
- `interface ChatProvider { id: string; complete(req): Promise<ChatCompletion> }`.
- `ResolvedAgentRuntime` = `{ provider, model, systemPrompt, enabledTools,
  endpointUrl, apiKey }`.
- `resolveRuntimeFromConfig(row, env): AgentRuntimeResolution` (pure, no I/O).
- `createChatProvider(runtime): ChatProvider` (throws `unsupported_provider`).
- `buildSystemPrompt(extraContext?)`, `PROMPT_INJECTION_GUARD`,
  `detectInjectionAttempt(text)`.
- `runAgentLoop(input): Promise<AgentLoopResult>` —
  `{ status, content, steps, toolCalls }`; status ∈ completed|max_steps|provider_error.
- `AgentTool` = `{ id, description, inputSchema: ZodType, handler, effect }`.

## Security boundaries
- **Untrusted content**: inbound text enters the loop only as a delimited `user`
  data block (`UNTRUSTED_CUSTOMER_MESSAGE`); the system prompt states, as an
  inviolable rule, that message content is data and must never be followed.
- **Tool argument validation**: every tool call is JSON-parsed and validated with
  the tool's Zod `inputSchema` (`safeParse`) before execution; invalid args are
  returned to the model as a structured error, never executed.
- **Effect gate**: the loop refuses any tool whose `effect !== 'read'`; the
  registry additionally hard-filters to read-only. P2 cannot write.
- **Allowlist**: only tool ids present in `agent_config.enabledTools` are exposed.

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — identical to baseline (0 new) |
| `npm run build` | **PRE-EXISTING ENVIRONMENTAL BASELINE FAILURE** — `DATABASE_URL is required in production` (`src/db/client.ts:8`) during "Collecting page data"; reproduced identically on the pre-change HEAD (no `.env`/reachable Neon in this worktree). The specific pre-existing `/api/attachments/...` route that trips first varies run-to-run; same message and same `db/client` chunk. **No new failure mode** — no P2 module is imported by any route. |
| DB-free behavior check (temp `tsx`, removed) | PASS (44 assertions) — prompt terms + injection guard, injection detection, config resolution (base+path / per-provider override / missing keys), registry selection + unknown provider, Zod→JSON projection, tool-spec + enabled-tools allowlist, fetch adapter (model/tools/tool-calls/invalid response), loop (tool call, draft refusal, unknown tool, invalid args, provider error, max steps, untrusted delimiter) |

## Decisions / notes
- **Provider-neutrality**: `provider` in the DB selects a *wire protocol*
  (registry key), not a vendor. The built-in `chat-completions` protocol works
  with any compatible endpoint configured via `AGENT_AI_ENDPOINT_URL` /
  `AGENT_AI_BASE_URL`; per-provider overrides use `AGENT_AI_<PROVIDER>_*`. No
  vendor, model or host literal exists in code.
- **Dynamic DB import** in `config.ts` keeps the pure resolver importable without
  a database (used by the behavioral check and future unit tests).
- **Zod → JSON dispatch by `_def.typeName`** (not `instanceof`) to stay robust
  when duplicate `zod` copies exist in a bundling graph.
- **Not wired into the live path yet**: the loop/tools are a library. The router
  still answers P1 deterministic commands; wiring the sales runtime into intake,
  persisting agent drafts and the admin config surface remain later units.

## Excluded (unchanged, as required)
Draft/write commerce tools (P3), admin inbox/settings UI (P4), background jobs and
retention (P5), WhatsApp import webhook (P6), P7 hardening. P0's documented P7
follow-ups are preserved: **fresh-DB migration bootstrap** (base tables live only
in `schema.ts`; `0010` references `contacts`) and **journal ordering**
(`meta/_journal.json` idx 8 = `0010` vs master `0009_product_image.sql`).

## Next unit
P3 — Guarded draft-only tools: `draftLead`→`contacts`, `draftQuote` wrapping
`quoteOrder` → `orders.status='borrador'`, `draftOrder` reusing
`createPublicOrder`; money via `toCents/fromCents`; multi-step writes inside
`withDbTransaction`; human confirmation required; never finalize.
