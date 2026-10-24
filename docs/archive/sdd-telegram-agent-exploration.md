## Exploration: ai-telegram-sales-agent

> **Type**: SDD exploration (autonomous, adversarial synthesis). **No product code, DB, env, dependency or destructive command was changed.**
> **Change name**: `ai-telegram-sales-agent`
> **Target repo**: AH Sports OS (`adriangmrraa/ahsports`), worktree `sdd-explore-ai-telegram-sales-agent`, base commit **`675e6e1`** (`feat(ux): tablas responsive a tarjetas en mobile y mejoras visuales`).
> **Reference (capability source, read-only)**: Muzapp / Mrs Muzzarella (`C:/Users/Asus/Documents/estabilizacion/Mrs Muzzarella/muzapp`).
> **Inputs synthesized**: `ah-agent-readiness-inventory` (77b75f4), `cross-repo-agent-parity` (775b7b2), `muzapp/ai-runtime-inventory` (8535028), `muzapp/ai-backoffice-ux-inventory` (b46d7b2).
> **Method**: read all four reports; indexed/queried both existing `codebase-memory` graphs (Muzapp 6092/9226, AH paridad 4467/6204); **cross-checked every load-bearing claim against the current working tree** with direct reads. `node_modules/` is absent in this worktree, so `typecheck`/`build` were NOT re-run here (documented state used).

### Class legend

| Mark | Meaning |
|------|---------|
| ♻ **PORT** | Generic infra; port near-verbatim, path-level changes only. |
| 🔧 **ADAPT** | Reuse the pattern; rewire to AH schema, auth, roles, domain. |
| 🆕 **REBUILD** | Does not exist in AH Sports; design + build from scratch. |
| ⛔ **REJECT** | Do not port (framework/domain dead-weight or policy conflict). |

---

## 1. Verification log (adversarial cross-check of the four reports)

Each claim was re-checked against the current tree at `675e6e1`. Result and evidence:

| # | Claim from input reports | Verdict | Evidence (current tree) |
|---|---|---|---|
| V1 | AH `requireRole` defined but never called (authz blocker) | **CONFIRMED** | `grep -rn requireRole src` → only `src/lib/auth.ts:82` (definition). Zero callers. |
| V2 | AH `SESSION_SECRET` has insecure dev fallback | **CONFIRMED** | `src/lib/auth.ts:26` → `process.env.SESSION_SECRET \|\| "dev-secret-please-change-in-production"`. |
| V3 | No `chat_messages` / conversational persistence | **CONFIRMED** | `grep chat_messages\|chatMessages src` → empty. |
| V4 | `orders.snapshot` JSONB exists and is the quote-traceability column | **CONFIRMED** | `src/db/schema.ts:289-290`; `PricingSnapshot` type at `:359` (`schema.ts`), `quoteOrder` produces it. |
| V5 | No background infra (cron/queue/worker/middleware/instrumentation) | **CONFIRMED** | `src/middleware.ts`/`src/instrumentation.ts` absent; no `.github`; scripts only `dev/build/start/lint/typecheck/db:*`. |
| V6 | No test runner / no tests | **CONFIRMED** | `find src -name '*.test.*' -o -name '*.spec.*'` → empty; `package.json` has no `test` script. |
| V7 | `render.yaml` build runs `db:push` (schema-drift hazard) | **CONFIRMED** | `render.yaml:6` → `npm install && npm run db:push && npm run build`. Migrations `0001..0009` are the mandated path (`npm run db:migrate`). |
| V8 | No messaging/LLM/agent code anywhere | **CONFIRMED** | `grep -iE 'telegram\|whatsapp\|ycloud\|openai\|generateText\|ai-sdk\|nodemailer\|webhook' src` → only UI labels ("Teléfono / WhatsApp") and a config placeholder. |
| V9 | `createPublicOrder` is validated, transactional, server-authoritative | **CONFIRMED** | `src/app/actions/public-orders.ts:65-172`, `withDbTransaction` at `:73`, `createPublicOrderSchema` at `src/lib/validators.ts:356-385`. **Also: it does NOT call `requireUser()`** — it is public — so it is callable off-request without a browser session (it is a `"use server"` action but has no cookie dependency). |
| V10 | `quoteOrder()` throws domain errors (no recipe / no rule / size mismatch) | **CONFIRMED** | `src/lib/pricing.ts:106,120,135,142,151,162` — `throw new Error(...)`. Callers must `try/catch` (`actions/orders.ts:162`). |
| V11 | Dual drivers: `db` (neon-http, no tx) vs `withDbTransaction` (Pool) | **CONFIRMED** | `src/lib/db-transaction.ts:3,14,20` (`Pool` from `@neondatabase/serverless` + `drizzle(new Pool(...))`). |
| V12 | Money is numeric; integer-cents path is mandated | **CONFIRMED** | `src/lib/payments.ts:16` `toCents`, `:30` `fromCents`, `:79` `recalculateBlockStatus`. |
| V13 | `registerPaymentTx(tx, input)` is the reusable actor-aware pattern | **CONFIRMED** | `src/lib/payments.ts:157` with `createdById` at `:107,171,180`. |
| V14 | Leads are `contacts` (no `leads` table); 4 roles; 26 tables | **CONFIRMED** | `schema.ts:61` `lead_status`; `:96` `contacts`; roles enum at `:17`. |
| V15 | R9 of the parity report ("public tokens already misuse `Math.random()`") | **PARTIALLY WRONG — CORRECTED** | `Math.random()` occurs only at `src/lib/utils.ts:49` (a generic 16-char id helper). Order tokens use `crypto.randomBytes` (`actions/public-orders.ts:137`; `orders.publicToken`). The policy risk is real but the cited instance is inaccurate. |
| V16 | Muzapp runtime files named in reports exist | **CONFIRMED** | All 14 probed paths present (`session-policy.ts`, `session-store.ts`, `human-handoff.ts`, `agent.ts`, `webhook-pipeline.ts`, `buffer/manager.ts`, `ai/config.ts`, `encryption.ts`, `idempotency.ts`, `infra/rate-limit.ts`, `whatsapp/signature.ts`, `channels/router.ts`, `api/telegram/webhook/[token]/route.ts`, `telegram/tools.ts`). |
| V17 | Muzapp tables named in reports exist | **CONFIRMED** | `schema.ts` `pgTable` at lines 70,80,103,196,220,242,258,270,291,316,347,375,391,407,429,445,464,479,493. |
| V18 | Muzapp stack is Next 16 / NextAuth v5 / AI SDK v6 / Zod 4 | **CONFIRMED** | `package.json`: `next 16.2.4`, `react 19.2.4`, `ai ^6.0.175`, `next-auth ^5.0.0-beta.31`, `zod ^4.4.3`, `drizzle-orm ^0.45.2`, `@upstash/redis ^1.38`. |
| V19 | Muzapp has a `node:test`-based test suite (11 files) | **CONFIRMED** | 11 `*.test.ts` under `src/lib` + `src/components`. |
| V20 | AH stack versions | **CONFIRMED (one nuance)** | `package.json`: `next ^15.1.0`, `react ^19.0.0`, `zod ^3.24.1`, `drizzle-orm ^0.45.2`. **Zod is v3 on AH vs v4 on Muzapp** — schemas are not copy-paste (see R12). Muzapp's `db:push` is guarded (`\|\| echo skipped`) while AH's is not — worse on AH. |

**Net**: the four reports are accurate at the architectural level. Two refinements matter for planning: (a) `createPublicOrder` is not cookie-bound (a better seam than a generic "extract services" framing suggests), and (b) the parity report's `Math.random` example is wrong even though the underlying policy is valid.

---

## 2. Current State

AH Sports OS is a garment-workshop ERP: public landing + catalog + 5-step quote wizard + token tracking, and a full admin panel (orders, products, BOM recipes, materials, suppliers, techniques, molds, art/attachments, cash/payments, config). Verified inventory:

| Aspect | Verified fact | Source |
|---|---|---|
| Framework | Next.js `^15.1.0`, React `^19.0.0`, TS strict | `package.json:22-25`, `tsconfig.json` |
| ORM / driver | Drizzle `^0.45.2` on `@neondatabase/serverless` `^1.0.2` (HTTP) + Pool for tx | `package.json`, `src/lib/db-transaction.ts` |
| Validation | Zod `^3.24.1`, central `src/lib/validators.ts` (407 lines) | `package.json:27` |
| Auth | Custom scrypt + HMAC cookie `ah_session` + `sessions` table; roles `admin\|gerencia\|disenador\|operario`; **only `requireUser()` is enforced** | `src/lib/auth.ts:11-90` |
| UI | Tailwind v4 `@theme`, Lucide; no shadcn | `src/app/globals.css`, `src/components/ui/*` |
| Admin surface | 38 `page.tsx`; nav data-driven at `src/components/layout/adminNavigation.ts`; badge injection | tree |
| API | 38 `route.ts`; mutating routes use `requireUser()` → `safeParse` → `{error,issues}` | `src/app/api/**` |
| Server actions | `src/app/actions/{orders,public-orders,attachments,payments,organizations,settings}.ts` | `src/app/actions/` |
| Tests | **None** — no runner, no CI | `package.json` |
| Lint | **Broken at toolchain level** (KI-13) — gate is `typecheck` + `build` | `KNOWN-ISSUES.md` |
| Env | Only `DATABASE_URL` + `SESSION_SECRET` documented; no env validation | `.env.example` |
| Deploy | Render + Dockerfile; build runs **`db:push`** | `render.yaml:6` |

**Agent-relevant emptiness is total**: no conversations, no messages, no LLM client, no transport, no scheduler, no secrets store, no idempotency, no notifier. The domain services that an agent must wrap (`quoteOrder`, `createPublicOrder`, `registerPaymentTx`, `recalculateBlockStatus`) are, by contrast, strong and server-authoritative.

---

## 3. Target capability inventory (verified)

Three delivery layers, mapped to verified AH seams.

### 3.1 Telegram internal agent (management bot for staff)
| Capability | Muzapp source | AH current | Class |
|---|---|---|---|
| Inbound webhook route | `src/app/api/telegram/webhook/[token]/route.ts` | none | 🆕 REBUILD (route + AH conventions) |
| Bot plumbing (send/download/setWebhook/getMe/config) | `src/lib/telegram/bot.ts` | none | ♻ PORT (token compare to `timingSafeEqual`) |
| Internal tool suite (~60 tools) | `src/lib/telegram/tools*.ts` | 38 REST routes + server actions cover the domain | 🔧 ADAPT (wrap AH services as tools) |
| Internal system prompt/persona | `src/lib/telegram/system-prompt.ts`, `prompt-builder.ts` | none | 🆕 REBUILD (garment/quote/BOM semantics) |
| Allowlist + fail-closed auth | `isChatAuthorized`, URL token | roles exist but unenforced | 🔧 ADAPT |
| Admin config screen | `/admin/telegram/*` | none | 🆕 REBUILD (AH `Card/Input` kit) |
| Ops notifier (`notifyAdmins`, `notifyNewOrder`) | `src/lib/telegram/notifier.ts` | none | 🆕 REBUILD (thin) |

### 3.2 AI sales agent (customer-facing)
| Capability | Muzapp source | AH current | Class |
|---|---|---|---|
| Channel adapter + router (`findOrCreateConversation`, dedup insert) | `src/lib/channels/router.ts` | none | 🆕 REBUILD (schema-bound) / ♻ pattern |
| Webhook signature + anti-replay | `src/lib/whatsapp/signature.ts`, `lib/meta/webhook` HMAC | none | ♻ PORT |
| Sales agent loop (`toolChoice:"required"`, hallucination guards, pending-media, phase-2) | `src/lib/whatsapp/agent.ts` | none | 🔧 ADAPT (generic loop) |
| Customer tool suite (~30) | `src/lib/whatsapp/tools/*` | `quoteOrder`, catalog query, `createPublicOrder` | 🔧 ADAPT (map menu→catalog, kitchen→production) |
| Session boundary machine (+3 tables) | `session-policy.ts`, `session-store.ts`, `human-handoff.ts` | none | 🆕 REBUILD (reduced v1 acceptable) |
| Anti-loop / injection guard | `anti-loop.ts`, `tools/prompt-security.ts` | none | ♻ PORT / 🔧 ADAPT |
| Sales persona + prompt layers | `prompt-builder.ts` ("Karen") | none | 🆕 REBUILD (`getCorePrompt`/`getStyleProfile` layers are ADAPT) |
| Quote preview / order intake / payment tools | `tools/create-order.ts`, `cash/session.ts` | `quoteOrder`, `createPublicOrder`, `registerPaymentTx` | 🔧 ADAPT (wrap AH; never trust LLM prices) |
| Debounce buffer + bubble sender | `src/lib/buffer/*` | none | ♻ PORT |
| Media pipeline (Whisper/vision/doc/video) | `src/lib/media/*` | none | ♻ PORT (optional per channel) |
| Reconcile (missed sales) | `src/lib/reconcile/*` | none | 🆕 REBUILD (optional) |
| Web-order redirect / 24h auto-reply | `web-order-redirect.ts`, config gate | wizard exists | 🔧 ADAPT (optional) |

### 3.3 Platform / cross-cutting
| Capability | Muzapp source | AH current | Class |
|---|---|---|---|
| Agent/business/credential config store | `agent_config` row + `lib/integrations.ts` (30s cache) | `settings` key/value (`taller_*`) | 🔧 ADAPT (new `agent_config` table preferred over JSONB bag) |
| Secret encryption at rest (AES-256-GCM) | `src/lib/encryption.ts` | none — env plaintext | ♻ PORT (key from `SESSION_SECRET`) |
| Write-only secret UX (`…Set` flags, `CLEAR`) | `agent-config-form.tsx` + actions | none | 🔧 ADAPT |
| Durable rate limiting | `src/lib/infra/rate-limit.ts` (Redis + memory fallback) | in-memory login `Map` only | ♻ PORT (needs Redis or DB fallback) |
| Idempotency store | `src/lib/idempotency.ts` + unique `platform_message_id` | none | ♻ PORT + DB unique |
| Structured logger (pino) | `src/lib/logger.ts` | console | ♻ PORT |
| Provider/model resolver (DB→env, OpenAI-compatible, DeepSeek) | `src/lib/ai/config.ts`, `models.ts` | none | ♻ PORT / 🔧 ADAPT |
| Attribution/ref links | `lib/attribution/*` | none | 🆕 optional |
| Test harness (`node:test` source-invariant pattern) | 11 test files | none | ♻ PORT |
| CI | none in Muzapp either (repo-local scripts) | none | 🆕 REBUILD (add typecheck+build+test) |
| Background scheduler | `instrumentation.ts` + `lib/reconcile/scheduler.ts` | none | 🆕 REBUILD (or avoid via webhook-only) |
| Queue + DLQ, circuit breaker | `src/lib/queue/*`, `src/lib/infra/circuit-breaker.ts` | none | ⛔ REJECT (documented dead code in Muzapp) |
| NextAuth v5, `proxy.ts`, shadcn, `cash_sessions` chain invariant, food-domain prompts/tools | Muzapp | AH has custom auth/UI | ⛔ REJECT (policy/stack mismatch) |

**Counts**: ~14 PORT, ~30 ADAPT, ~22 REBUILD, ~5 REJECT.

---

## 4. Port vs Adapt vs Rebuild (decision rationale)

**PORT directly** — infra that is channel/domain-agnostic and policy-clean: `encryption.ts` (AES-256-GCM), `buffer/{manager,response-sender}`, `infra/rate-limit.ts` (+ mandatory in-memory fallback), `idempotency.ts`, `whatsapp/signature.ts`, `media/*` download/transcode, `logger.ts`, `ai/{config,models}.ts` resolver, `telegram/bot.ts` plumbing, provider adapters, `node:test` harness pattern.

**ADAPT** — reuse the shape, rewire the edges:
- Agent loop (`agent.ts`) → AH tools; keep the `toolChoice:"required"` + hallucination-retry + pending-media contract, drop food copy.
- Session boundary machine → keep mode/version/event-dedup/effect-claim semantics; AH "handoff" = notify workshop staff, not a kitchen.
- Order/pricing/payment tools → call **`quoteOrder` / `createPublicOrder` / `registerPaymentTx`**; never accept LLM totals (AH rule #1 + snapshot immutability).
- Admin screens/nav → rebuild on AH `Card/Input/Table` + `adminNavigation.ts`; port logic, not shadcn.
- Config store → `agent_config` table (DB-first, env fallback) rather than polluting the generic `settings` bag (`updateSetting` does not validate value shape — verified `actions/settings.ts:37`).
- Identity/business resolver → `settings` (`taller_*`).

**REBUILD** — anything bound to AH's missing substrate: `conversations`/`chat_messages`/session tables/`agent_memories`/idempotency tables + idempotent SQL migration; Telegram + WhatsApp webhook routes; conversations inbox; cron endpoints; ops notifier; domain prompts; CI.

**REJECT** — NextAuth v5 (AH auth is deliberate), `proxy.ts` (Next 16 API), shadcn/`@base-ui` (AH UI kit is custom), Muzapp `cash_sessions` chain invariant (AH uses cents + `recalculateBlockStatus`), dead code (`queue/worker` Telegram no-op, `circuit-breaker` unwired, `agent/buffer.ts`, `smart-split.ts`), and all food-domain strings/tool names.

---

## 5. Contracts (data / JSONB / API / tool) — freeze before parallel work

### 5.1 Data model (idempotent migration `0010_agent_platform.sql`; never `db:push`)
```
agent_config            (singleton id=1; enabled, prompts, model ids, encrypted secrets, hours,
                         role allowlist, feature flags)          — 🔧 ADAPT of Muzapp agent_config
conversations           (channel, externalUserId, phone, name, status, lastMessageAt,
                         humanOverrideUntil)                     — 🆕
chat_messages           (conversationId, role user|assistant|system|human, content,
                         attrs jsonb, platformMessageId UNIQUE, createdAt) — 🆕 foundation
idempotency_keys        (key PK, createdAt)                       — 🆕
agent_memories          ({key,type rule|fact|preference,source,content,active}) — 🆕 optional
-- optional v2: conversation_session_states/_events/_effect_claims (reduced v1: mode+version+dedup)
```
Keep AH conventions: typed `.$type<T>()` + SQL default literal for JSONB (`schema.ts:289-290,181,153,209`). Order data stays relational (`orders`/`order_lines`/`order_items`) — the agent writes through services, **not** raw JSONB.

### 5.2 JSONB contracts (reuse existing, do not invent)
- `orders.snapshot` = `PricingSnapshot | null` (`schema.ts:289,359`) — immutable quote trace.
- `orders.snapshotHistory` = `SnapshotHistoryEntry[]` default `'[]'` (`schema.ts:290`).
- `chat_messages.attrs` (new) mirrors Muzapp `contentAttributes`: `{type,url,fileName?,mimeType?,caption?,transcription?,description?}[]`.
- `settings.value` remains the generic bag but must NOT hold agent secrets (unvalidated).

### 5.3 Channel contracts (channel-agnostic seam)
```ts
type Channel = "whatsapp" | "telegram";
interface InboundMessage { channel: Channel; externalUserId: string; phone?: string; text?: string;
  media?: {type:"image"|"audio"|"document"|"video"; url:string; mime?:string}[];
  platformMessageId: string; raw: unknown; }
interface ChannelAdapter { verify(req: Request, rawBody: string): Promise<boolean>;
  normalize(req: Request, payload: unknown): InboundMessage;
  sender: { sendText(to:string,text:string):Promise<{platformMessageId?:string}>;
            sendImage(to:string,url:string,caption?:string):Promise<void>; }; }
interface ConversationStore {
  findOrCreate(channel:Channel, externalUserId:string, name?:string):Promise<{id:string}>;
  insertMessage(conversationId:string, role:"user"|"assistant"|"system"|"human",
    content:string, attrs?:unknown, platformMessageId?:string):Promise<{wasDuplicate:boolean}>;
  getMessages(conversationId:string, limit:number):Promise<Array<{role:string;content:string}>>; }
```

### 5.4 Agent runtime contract
```ts
interface AgentRuntime { run(ctx:{ channel:Channel; conversationId:string; phone?:string;
  messages:Array<{role:"user"|"assistant"|"system";content:string}>;
  routingKind?:"allow_agent"|"fixed_ack"|"fixed_clarification"|"handoff"|"blocked"|"duplicate";
  sessionContext?:Record<string,unknown>; }): Promise<{text:string; pendingMedia:PendingMedia[]}>; }
type AgentTool = ReturnType<typeof import("ai").tool>;
```

### 5.5 Domain adapter contract (the crown jewels — wrap, never reimplement)
```ts
interface OrderIntakeService {
  quote(input:{ lines:QuoteLineInput[]; urgent?:boolean }): Promise<PricingSnapshot>;   // wraps quoteOrder (throws)
  createDraft(input:{ contactId?:string; lines:QuoteLineInput[]; idempotencyKey:string;
    source:"whatsapp"|"telegram"|"web"|"admin"; conversationId?:string;
  }): Promise<{ orderId:string; number:number; publicToken:string }>;                    // wraps createPublicOrder
  registerPayment(input:{ orderId:string; kind:"sena"|"pago"|"saldo"; method:PaymentMethod;
    amount:number; idempotencyKey:string }): Promise<void>;                              // wraps registerPaymentTx
}
interface IdempotencyStore { check(key:string):Promise<boolean>; set(key:string):Promise<void>; }
interface RateLimiter { check(bucket:string):Promise<{ok:boolean; headers?:Record<string,string>}>; }
interface SecretCipher { encrypt(p:string):string; decrypt(c:string):string; decryptIfEncrypted(v:string):string; }
interface AgentConfigStore { get():Promise<AgentConfig>; getSecret(name:SecretName):Promise<string|null>; }
```

### 5.6 Tool surface (Zod `inputSchema` on every tool; server-only modules import `server-only`)
- **Read tools** (P2): `getCatalog`, `getProductDetails`, `getSizes`, `getQuotePreview` (→ `quoteOrder`, returns `snapshot.rule` + totals), `getOrderStatus` (by `publicToken`/phone), `getClientHistory`, `getWorkshopHours`, `getOrderStage`.
- **Write tools** (P3): `createOrderDraft`/`confirmQuote` (→ `createPublicOrder`/`confirmQuote`), `registerSena` (→ `registerPaymentTx`), `advanceStage` (order-items stage), `addNote`, `requestHumanHandoff`.
- **Internal Telegram tools** (ADAPT): wrap the 38 existing REST routes / server actions; expose a `queryData`-style meta-tool only with an explicit allow-list.

### 5.7 Invariants every worktree must honor
1. **DB is the single source of truth** — tools never trust LLM-supplied prices; call `quoteOrder`.
2. Public/agent intake is **idempotent** (key = transport `platformMessageId`).
3. Agent identity is **bound to the transport sender**, never the LLM payload.
4. Secrets **encrypted at rest**, never returned to the client (write-only UI).
5. Multi-step writes go through **`withDbTransaction`** (neon-http cannot transact).
6. Money math via `toCents`/`fromCents`; never float.
7. `quoteOrder` throws — all callers `try/catch` and surface domain errors.
8. Migrations are idempotent `000N_*.sql` + journal; **never `db:push`**; never `db:seed` without explicit approval.

---

## 6. Phased dependency graph

Ordering rule: **P0 owns all schema/migration files and all shared infra.** Everything branches from P0. Two worktrees must never edit the same migration or the same shared file concurrently.

```
P0 platform-foundations (BLOCKING, single owner — serialization point)
 └─ P1 channels + persistence (no AI)
     └─ P2 agent core, READ-ONLY
         ├─ P3 agent WRITES + domain adapter
         │   ├─ P4 admin surfaces + config    ── overlaps P5
         │   └─ P5 background + notifications ── overlaps P4
         └─ P6 attribution/storefront (optional)
                 └─ P7 hardening + tests/CI   [merges everything]
```

- **P0 — platform foundations (blocking)**: `0010_agent_platform.sql` (+ journal) with `agent_config`, `conversations`, `chat_messages`, `idempotency_keys`, `agent_memories`; port `encryption.ts` (key from `SESSION_SECRET`), `rate-limit.ts` (+ fallback), `idempotency.ts`, `logger.ts`; **wire `requireRole`** and define an agent service-principal + role matrix; add validated `src/lib/env.ts` and remove the `SESSION_SECRET` dev fallback; add AI/Telegram/WhatsApp placeholders to `.env.example`. Exit: `typecheck` + `build` EXIT 0; migration idempotent; smoke script proves encrypt/decrypt round-trip **and** a role-denied mutation.
- **P1 — channels + persistence (no AI)**: adapt `channels/router` (find-or-create, dedup insert, outbound dispatch); Telegram adapter + webhook; WhatsApp (YCloud) adapter + webhook; conversations inbox (read + human reply); Telegram config page. Exit: inbound persists exactly once; duplicate webhook is a no-op; fixed reply round-trips.
- **P2 — agent core, read-only**: port `ai/config` + `models`, `buffer/*`, `prompt-security.ts`; build AH read tools; wire `AgentRuntime` on both channels. Exit: agent answers catalog/quote/status from real data; **no write tool exists**; injection test passes.
- **P3 — agent writes + domain adapter**: `OrderIntakeService` wrapping `quoteOrder`/`createPublicOrder`/`registerPaymentTx`/`confirmQuote` with idempotency; sender-bound identity; duplicate-order guard window. Exit: "ask quote → draft order" happy path; replay creates no duplicate; blocked-payment order yields a payable answer.
- **P4 — admin surfaces + config** (overlaps P5): `/admin/agent` config screen (write-only secrets `…Set`/`CLEAR`), nav items, business identity from `settings`, role-gated mutations.
- **P5 — background + notifications** (overlaps P4): Telegram ops notifier; cron `followup` (+ optional `reconcile`) secret-gated with at-most-once claims; optional `instrumentation.ts` scheduler flag.
- **P6 — attribution/media** (optional): Meta pixel/CAPI + signed ref links + public lead capture + UTM.
- **P7 — hardening + parity tests + CI**: port `node:test` harness (behavioral: session policy, idempotency, signature, role; source-invariant tests); CI = typecheck + build + tests; audit log for sensitive mutations.

---

## 7. Worktree ownership plan (Orca)

One Orca worktree per phase; branch names below; each child is created from its parent to keep one clean PR when collapsed. Migrations are owned exclusively by P0.

| Phase | Worktree | Branch (from) | Owns exclusively |
|---|---|---|---|
| P0 | `agent-parity-base` | `adriangmrraa/agent-parity-base` (main @675e6e1) | `src/db/migrations/*`, `src/db/schema.ts`, `src/lib/{env,encryption,idempotency,logger}.ts`, `src/lib/infra/*`, `src/lib/auth.ts`, `render.yaml`, `.env.example` |
| P1 | `agent-parity-channels` | from P0 | `src/lib/channels/*`, `src/app/api/{telegram,whatsapp,webhook}/**`, conversations inbox UI, telegram config UI |
| P2 | `agent-parity-runtime` | from P1 | `src/lib/ai/*`, `src/lib/buffer/*`, `src/lib/agent/*`, read tools, prompt-security |
| P3 | `agent-parity-writes` | from P2 | `OrderIntakeService`, write tools, session boundary machine |
| P4 | `agent-parity-admin` | from P3 | `/admin/agent`, `agent-config-form`, `adminNavigation.ts` |
| P5 | `agent-parity-background` | from P3 | cron routes, notifier, scheduler |
| P6 | `agent-parity-attribution` | from P1/P3 (optional) | attribution + storefront |
| P7 | `agent-parity-hardening` | merge target of all | test harness, CI, audit log |

Collision rules: only P0 touches migrations/schema/shared-infra; only P4 touches `adminNavigation.ts`; PRs collapse P3→P2→P1→P0 into one chain before merge. Delegation must go through the `orca-delegate` skill (worktree id + terminal handle + `accepted:true` + visual confirmation).

---

## 8. Integration order

1. **P0 first and alone** — security substrate (RBAC enforcement + encryption + env validation) must land before any write tool exists (R3, R4).
2. **Telegram-first** for the customer bot too: no BSP/Meta template approval, validates the entire runtime (session → tools → config → notifications) fastest, and is exactly the "internal agent" the brief names. Enable WhatsApp on the validated core second (R8).
3. **Read tools before write tools** — no mutation until P0 authz + P3 idempotency both exist.
4. **Admin config before broad rollout** — prompt/model edits must be operable without redeploy (DB-first config).
5. **Background last** among core phases** — crons depend on stable write services and notifications.
6. **P7 merges last** — it is the parity/CI backstop for everything.

---

## 9. Security & reliability concerns (explicit)

| # | Concern | Evidence | Mitigation |
|---|---|---|---|
| S1 | **No effective RBAC** — an agent/service account = full admin | `requireRole` in-degree 0 (`auth.ts:82`) | Wire real role checks + a service principal in P0; gate every agent mutation |
| S2 | **Forgeable sessions on misconfig** — insecure secret fallback | `auth.ts:26` | Validated `src/lib/env.ts`; fail-fast in prod; remove fallback |
| S3 | **No encryption for agent secrets** | no `encryption.ts` in AH | Port AES-256-GCM (P0) before storing any key; write-only UI |
| S4 | **Webhook retries duplicate orders/writes** — no idempotency | `createPublicOrder`/`createOrderLine` insert on replay | `idempotency_keys` + unique `platformMessageId`; key from transport msg id |
| S5 | **Neon HTTP has no transactions → partial writes** | `db-transaction.ts` exists for this reason | Route multi-step agent writes through `withDbTransaction` |
| S6 | **Hostile inbound payloads / prompt injection** | public webhooks; LLM tools | HMAC signature verify, `timingSafeEqual`, anti-replay, allowlists that fail closed, `prompt-security.ts`, Zod on every payload |
| S7 | **Public token as bearer** | `orders.publicToken` grants tracking | Agent must not echo tokens out of context; rate-limit + allow-list |
| S8 | **Render build runs `db:push`** (silent schema drift) | `render.yaml:6` | Replace with `db:migrate`; ship idempotent `000N_*.sql`; never `db:seed` without approval |
| S9 | **In-memory rate limiting** (per-instance, non-durable) | `api/auth/login/route.ts` Map | Durable limiter (Redis or DB) with mandatory in-memory fallback |
| S10 | **No audit trail for agent writes** | only `paymentEvents`/`productionEvents` | `createdById`-style attribution + generic `audit_events` (P7) |
| S11 | **Money correctness** | numeric strings | `toCents`/`fromCents` only; never floats |
| S12 | **`quoteOrder` throws** | `pricing.ts:106+` | All agent callers `try/catch`; surface domain error to user |
| S13 | **Zod v3 (AH) vs v4 (Muzapp)** | `package.json` | Re-author schemas; do not copy-paste v4 schema code |
| R1 | Concurrent worktrees corrupt shared migrations | — | P0 single-owner serialization; one migration file per phase |
| R2 | Framework drift (Next 15 vs 16, custom auth) | `package.json` | Port logic, not frameworks; keep AH `auth.ts` and UI kit |

---

## 10. Recommendation

**Proceed. Do NOT start with code — start with P0 (platform foundations) as a single, blocking worktree, and run Telegram-first.**

Rationale, grounded in the verified state:
- The **domain is ready**: `quoteOrder`, `createPublicOrder`, `registerPaymentTx`, `recalculateBlockStatus` already exist and are server-authoritative; every one is a clean ADAPT/wrap seam. This is the cheapest half of the work.
- The **platform is empty and unsafe**: RBAC is unenforced, secrets have no store, no idempotency, no persistence, no encryption. Building tools before fixing these is unsafe and would have to be redone. Hence P0 first.
- **Muzapp infra transfers well** (~14 near-verbatim ports) while **prompts/tools/domain must be re-authored** — mis-scoping this as a "copy the repo" job is the main risk.
- **Telegram-first** avoids the WhatsApp BSP/Meta approval cycle and fastest validates the runtime; WhatsApp rides the proven core afterward.

**Immediate open questions for the user (block sdd-propose/sdd-spec):**
1. Channel priority — Telegram-first (recommended) or WhatsApp-first?
2. Customer-agent autonomy — may it create quotes/orders autonomously, or only capture leads + notify staff? (scopes P3)
3. Start now (P0) or stop at exploration?
4. AI provider default (OpenAI / DeepSeek / self-hosted) — affects resolver + cost.

### Approaches to P0 authz/identity (the real fork)

| Approach | Pros | Cons | Effort |
|---|---|---|---|
| **A. Enforce existing `requireRole` + add a `service_principal` role/scope table** | Minimal schema; uses the already-declared `requireRole`; least new concepts | Needs a role matrix + per-route wiring; must audit all 38 routes | Medium |
| **B. Full token/API-key auth layer for the bot** (new `api_tokens` table + scopes) | Clean off-request machine identity; auditable | Larger surface; duplicates session concepts; more to secure | High |
| **C. Shared single bot account as a normal user** | Fastest to wire | Inherits full admin (S1) — **unacceptable** | Low (rejected) |

Recommend **A** now (immediate safety) with the service-principal concept designed so B can be added in P7 without rework.

### Ready for Proposal

**Yes** — the target capability inventory, port/adapt/rebuild classification, contracts, phased graph, worktree ownership and integration order are verified. Blocked only on the four user decisions above (channel priority, autonomy, start-now, provider). The orchestrator should surface those questions before launching `sdd-propose`.

### Risks (top-level)
- R1: RBAC + encryption must precede any write tool (S1/S3).
- R2: Domain mismatch (food→garment) makes prompts/tools non-drop-in — budget explicit authoring.
- R3: WhatssApp BSP/Meta approvals are slow/external — Telegram-first.
- R4: `db:push` in the Render build can silently alter schema — switch to `db:migrate` in P0.
- R5: Zod v3 vs v4 and Next 15 vs 16 — port logic, not code.
