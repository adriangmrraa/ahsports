# AGENT_REPORT — Muzapp → AH Sports agent parity

> **Type**: exploration-only cross-repository parity analysis (no product code, DB, env or dependency was modified).
> **Reference (source of capabilities)**: `C:/Users/Asus/Documents/estabilizacion/Mrs Muzzarella/muzapp` — read-only.
> **Target (where capabilities must land)**: `C:/Users/Asus/orca/workspaces/App de gestion/cross-repo-agent-parity` (AH Sports OS).
> **Base commit at analysis time**: `675e6e1` (`adriangmrraa/cross-repo-agent-parity`).
> **Objective**: capability-by-capability parity matrix for the **AI sales agent** and the **Telegram internal agent**, with a gap classification and a dependency-ordered phase plan suitable for independent Orca worktrees.

**Class legend**

| Mark | Meaning |
|------|---------|
| ♻ **REUSE** | Generic infrastructure. Port near-verbatim (paths, logging, crypto, buffering). |
| 🔧 **ADAPT** | Reuse the pattern but rewire to AH Sports' schema, auth, roles and domain. |
| 🆕 **NEW** | Does not exist in AH Sports; must be designed and built. |

---

## 1. Method & evidence

- Both repositories were indexed with `codebase-memory` before discovery:
  - Muzapp: 6 092 nodes / 9 226 edges (`C-Users-Asus-Documents-estabilizacion-Mrs-Muzzarella-muzapp`).
  - AH Sports current worktree: 4 467 nodes / 6 204 edges (`C-Users-Asus-...cross-repo-agent-parity`).
- Architecture, cluster and hotspot data were pulled via `get_architecture` on both projects.
- Four concurrent read-only sweeps covered: (a) Muzapp Telegram agent, (b) Muzapp WhatsApp runtime + webhooks + background infra, (c) Muzapp admin/auth/config/deploy, (d) the full AH Sports inventory.
- Key claims were spot-checked directly (e.g. `requireRole` unused in AH — `src/lib/auth.ts:82` is the only occurrence; the "Próximamente: WhatsApp Business" placeholder in `src/app/(admin)/admin/configuracion/page.tsx:48-53`; no test files in AH; Muzapp `handleTelegramUpdate` is dead code — only its own definition matches).
- AH Sports' own docs (`docs/03-API-ROUTES.md`, `docs/04-BUSINESS-RULES.md`, `docs/05-GAP-ANALYSIS.md`, `docs/08-ROADMAP.md`, `PENDIENTES.md`, `KNOWN-ISSUES.md`) were read and are cited where they disagree with code.

---

## 2. Systems at a glance

| Dimension | Muzapp (reference) | AH Sports OS (target) |
|---|---|---|
| Domain | Food / commerce (rotisería + pan mayorista) | Garment workshop (taller textil) — quotes, BOM, production, cash |
| Framework | Next.js **16** App Router (`proxy.ts`) | Next.js **15** App Router |
| Auth | **NextAuth v5** (JWT), roles `admin`/`viewer` | **Custom** scrypt + HMAC cookie + `sessions` table, roles `admin`/`gerencia`/`disenador`/`operario` |
| DB access | Neon HTTP (+ Pool for rare tx) | Neon HTTP (+ Pool via `db-transaction.ts` for payments/public order) |
| AI | Vercel AI SDK `generateText` + OpenAI-compatible provider | **None** |
| Messaging | WhatsApp (YCloud) + Telegram internal bot + Meta | **None** |
| UI kit | shadcn / `@base-ui/react` | Custom `components/ui/*` (no shadcn) |
| Config | Single `agent_config` row (DB wins over env), AES-256-GCM secrets | `settings` key/value table (`taller_*`) + `pricing_rules`; plaintext env |
| Background | Debounce buffer, rate-limit, cron (followup/reconcile), in-process scheduler, notifications | **None** |
| Tests | `node:test` (10-file `test:agents` + large `agent-consistency.test.ts`) | **None**, no CI |

**Bottom line**: the two agent subsystems (WhatsApp sales agent, Telegram internal agent) are a *mature, generic* layer wrapped around a *different* domain. The infrastructure (crypto, buffering, rate-limiting, idempotency, signatures, media pipeline, AI provider resolution, tool-loop patterns) transfers well; the **domain adapters, prompts, tools and message/data model must be re-authored for AH Sports**.

---

## 3. Parity matrix (capability by capability)

### 3.1 Data model / JSONB

| Capability | Muzapp source | AH Sports today | Class | Notes |
|---|---|---|---|---|
| Single-row agent/business/credential config | `agent_config` (`src/db/schema.ts:103-194`), ~90 columns (prompts, YCloud key, AI provider, integration secrets, hours, zones, stock flags) | `settings` key/value (`schema.ts:526-530`) + `pricing_rules`; no agent config | 🔧 ADAPT | Add an `agent_config`-style table (or `settings` namespacing) — DB-first, env fallback |
| Conversations + message history | `conversations` (`:196-217`), `chat_messages` (`:270-289`, unique `platform_message_id`) | None | 🆕 NEW | Foundation for any channel + inbox |
| Boundary session machine (durable, versioned, audited) | `conversation_session_states` / `_events` / `_effect_claims` (`:220-268`) | None | 🆕 NEW | Can be shipped in a reduced v1 (mode + version + dedup events) |
| Leads with UTM / signed ref code / phone-unique | `leads` (`:291-314`) | `contacts` (`:96-106`) + `organizations`; `lead_status` enum; **no** phone uniqueness, UTM or ref | 🔧 ADAPT | Add attribution columns + phone normalization for conversation→contact linking |
| Order line items | `orders.items jsonb` (`:347-369`) | `orders` + `order_lines` + `order_items` **relational** + `orders.snapshot jsonb` (`:276-395`) | 🔧 ADAPT | Keep AH relational model; agent writes through existing actions, not raw jsonb |
| Agent scratch cart | `order_context_items` (`:375-387`, TTL 30 min) | None | 🆕 NEW | Could be modelled as `orders.status='borrador'` instead of a new table |
| Saved customer addresses | `addresses` (`:391-401`) | None (pickup-centric) | 🆕 optional | Only if agent must handle delivery/pickup addresses |
| Agent memory (learned rules/facts) | `agent_memories` (`:407-418`) | None | 🆕 NEW | Powers "remember this as a rule" |
| Reconcile (missed sales) | `reconcile_candidates` / `_runs` (`:429-454`) | None | 🆕 NEW | Domain-specific to chats that became orders |
| Cash sessions / movements | `cash_sessions` / `cash_movements` (`:464-489`) | `payments` (`:467-487`) + `paymentEvents` + caja views | 🔧 ADAPT | **Do not port the chain invariant** — AH uses cents + `recalculateBlockStatus` (`src/lib/payments.ts:79`) |
| Message media | `attachments` (`:316-330`) | `attachments` (`:416-446`) richer + `applications` + `upload_sessions` | ♻ REUSE / 🔧 ADAPT | AH attachments are already more capable |
| Catalog + promos | `products` (`:80-101`), `promotions` (`:493-503`) | `products` + `sizes` + `bom_recipes` + `pricing_rules` + taxonomy | 🔧 ADAPT | AH has no `promotions` table (discounts are new) |
| Users/roles | `users` (`:70-78`), `admin`/`viewer` | `users` (`:70-78`), 4 roles | 🔧 ADAPT | AH roles exist but are **not enforced** (see §3.6) |

### 3.2 APIs / webhooks

| Capability | Muzapp source | AH Sports today | Class | Notes |
|---|---|---|---|---|
| WhatsApp inbound webhook (HMAC sig, anti-replay, idempotent dedup, protocol-artifact gate) | `src/app/api/whatsapp/webhook/route.ts`; `src/lib/whatsapp/signature.ts`; `webhook-pipeline.ts` | None | 🆕 NEW (+♻ for `signature.ts`) | Largest single new surface |
| Telegram inbound webhook (URL token, allowlist, rate-limit, idempotency, Whisper/vision ingest) | `src/app/api/telegram/webhook/[token]/route.ts` | None | 🆕 NEW | Lower-friction than WhatsApp — no BSP/Meta template approval |
| Meta webhook + OAuth callback | `src/app/api/meta/webhook/route.ts`, `meta/callback/route.ts`, `src/lib/meta/oauth.ts` | None | 🆕 optional | Only if paid acquisition is required |
| Checkout API | `src/app/api/checkout/route.ts` + `src/lib/checkout/*` | Public wizard via **server actions** (`src/app/actions/public-orders.ts`) | 🔧 ADAPT optional | AH already has strict Zod intake (`createPublicOrderSchema`, `validators.ts:356`) |
| Cron endpoints | `src/app/api/cron/followup/route.ts`, `.../reconcile/route.ts` | None | 🆕 NEW | Secret-gated, at-most-once claims |
| Public lead capture + signed ref links | `src/app/api/leads/route.ts`, `admin/ref-code/route.ts`, `lib/attribution/*` | None | 🆕 optional | Attribution feature |
| Admin/ops APIs for tools | `admin/dlq`, `admin/test-agent`, `agent/test` | **37 REST route files** + server actions already cover the full domain | ♻ REUSE (as tool backend) | The gap is *wrapping*, not new endpoints |
| Health check | `src/app/api/health/route.ts` | None | 🆕 minor | Useful for Render |

### 3.3 Agent runtime / tools

| Capability | Muzapp source | AH Sports today | Class | Notes |
|---|---|---|---|---|
| AI provider resolution (DB → env; OpenAI-compatible; DeepSeek non-thinking fetch) | `src/lib/ai/config.ts`, `src/lib/ai/models.ts`, `src/lib/integrations.ts` | None | 🆕/♻ | Port the resolver; keys live in agent config |
| Customer sales agent loop (`toolChoice:"required"`, hallucination retry, pending-media extraction, phase-2 text generation) | `src/lib/whatsapp/agent.ts` (628 lines) | None | 🔧 ADAPT | The loop is generic; tools/prompts are domain |
| Customer tool suite (~30 tools, groups A–I) | `src/lib/whatsapp/tools/*` | None | 🔧 ADAPT | Map menu→catalog, kitchen→production, delivery→pickup |
| Telegram internal agent (68 tools: query/order/client/product/management/analytics/whatsApp/memory/cash) | `src/lib/telegram/tools{,Query,Order,Client,Product,Management,Analytics,Memory,WhatsApp,Cash}.ts` | None | 🔧 ADAPT | Trim to AH needs; `queryData` meta-tool needs allow-listing |
| Seller agent over WhatsApp (reuses Telegram read tools) | `src/lib/whatsapp/seller-prompt.ts` | None | 🔧 ADAPT | For staff operating via WhatsApp |
| System prompts | `whatsapp/prompt-builder.ts`, `seller-prompt.ts`, `telegram/system-prompt.ts` | None | 🆕 NEW content | Must be authored for garments/quotes/BOM |
| Session policy / anti-loop / non-commercial detection / injection guard | `session-policy.ts`, `session-store.ts`, `anti-loop.ts`, `human-handoff.ts`, `tools/prompt-security.ts` | None | 🔧 ADAPT | High-value safety layer; port then tune |
| Debounce buffer (Redis + in-memory fallback, lock, re-queue) | `src/lib/buffer/*` | None | ♻ REUSE | Direct port |
| Media pipeline (download allowlist, Whisper, vision classification, PDF, video) | `src/lib/media/*` | None | ♻ REUSE | Needs an AI key + storage |
| Reconcile agent (detect missed sales, backfill) | `src/lib/reconcile/*` | None | 🆕 NEW | Domain-specific |

### 3.4 Admin UI / screens / forms / modals

| Screen | Muzapp | AH Sports today | Class |
|---|---|---|---|
| Agent configuration (`/admin/agent`) | `src/app/(admin)/admin/agent/{page,actions,agent-config-form}.tsx` | — | 🆕 NEW |
| Telegram config (`/admin/telegram`) | `.../telegram/{page,actions,telegram-config}.tsx` | — | 🆕 NEW |
| Conversations inbox (`/admin/conversations`) | 3-pane inbox + React Query polling | — | 🆕 NEW |
| Dashboard | `admin/page.tsx` action-cards | `admin/page.tsx` (stat cards + funnel) | ♻ exists / 🔧 extend |
| Orders / kitchen board | `admin/orders/*` | `admin/pedidos/*` + kanban (drag-drop) | ♻ REUSE |
| Products | `admin/products/*` | `admin/productos/*` + talles + recetas | ♻ REUSE |
| Promos | `admin/promos/*` | — (discounts new) | 🆕 optional |
| Clients | `admin/clients/*` | `admin/organizaciones/*` + adjuntos library | 🔧 ADAPT |
| Leads | `admin/leads/*` | `contacts` + `lead_status` (no dedicated screen) | 🔧 ADAPT |
| Caja | `admin/caja/*` | `admin/caja/*` + `admin/pagos/*` | ♻ REUSE |
| Analytics | `admin/analytics/*` + link generator | dashboard aggregates only | 🆕 optional |
| Meta Ads | `admin/meta/*` | — | 🆕 optional |
| Forms/modals | shadcn + `@base-ui/react` | custom `components/ui/*` | 🔧 ADAPT | **Port logic, not the component library** |

### 3.5 Navigation

| Capability | Muzapp | AH Sports today | Class |
|---|---|---|---|
| Flat nav array | `src/components/admin/nav-items.ts` (no role filter) | `src/components/layout/adminNavigation.ts` (icons + badges) | 🔧 ADAPT — add *Agente*, *Conversaciones*, *Telegram*; keep AH icon/badge style |
| Mobile drawer | `topbar.tsx` + `Sheet` | `AdminMobileNav.tsx` (accessible `<dialog>`) | ♻ REUSE |
| Role-aware items | none (only mutations gated) | none | 🆕 — enforce role visibility |

### 3.6 Auth / security

| Capability | Muzapp source | AH Sports today | Class | Notes |
|---|---|---|---|---|
| Session/auth mechanism | NextAuth v5 JWT (`src/auth/index.ts`) | Custom scrypt + HMAC cookie + `sessions` table (`src/lib/auth.ts`) | 🔧 ADAPT | **Do NOT port NextAuth**; keep AH auth |
| Role-based mutation gate | `requireAdmin()` (38 call sites) | `requireRole()` **defined but never called** (`auth.ts:82`) | 🔧 ADAPT | Blocking: agent/tool mutations need a real gate |
| Setup bootstrap | `/setup` advisory-locked first admin | `src/db/seed.ts` (`ADMIN_PASSWORD`) | ♻ exists | No change needed |
| Secret encryption at rest (AES-256-GCM, key from `AUTH_SECRET`) | `src/lib/encryption.ts` | None — env plaintext | 🔧 ADAPT | Port; key from `SESSION_SECRET` |
| Write-only secret UX (`…Set` flags, `CLEAR`) | `agent-config-form.tsx` + `agent/actions.ts` | None | 🔧 ADAPT | Pattern for the agent config screen |
| Rate limiting (Redis sliding window + in-memory fallback) | `src/lib/infra/rate-limit.ts` | only in-memory login Map (`api/auth/login/route.ts:7-27`) | ♻ REUSE | Direct port |
| Idempotency | `src/lib/idempotency.ts` (+ DB unique on `platform_message_id`) | None | ♻ REUSE | Critical for agent writes |
| Webhook signature verification | `lib/whatsapp/signature.ts`; `lib/meta/webhook` HMAC | None | ♻ REUSE | Anti-replay + timing-safe |
| Signed attribution ref links | `lib/attribution/ref-code-sign.ts` | None | ♻ REUSE optional | |
| Prompt-injection guard | `lib/whatsapp/tools/prompt-security.ts` | None | ♻ REUSE | |

### 3.7 Business-domain adapters

| Capability | Muzapp | AH Sports today | Class | Notes |
|---|---|---|---|---|
| Business identity resolver (DB → env → fallback) | `src/lib/business.ts` | `settings` table (`taller_*`) + `actions/settings.ts` | 🔧 ADAPT | |
| Quote/pricing engine | `lib/order-utils.ts` (resolve DB prices, ignore LLM prices) | **`lib/pricing.ts` `quoteOrder()`** (`:101-329`), snapshot + history | 🔧 ADAPT (wrap) | Agent tool must call `quoteOrder` and surface `snapshot.rule`/totals |
| BOM consumption | inline | `lib/consumption.ts` `calculateBomConsumption()` | ♻ via pricing | Reachable through `quoteOrder` |
| Order intake service | `tools/create-order.ts` | `actions/orders.ts` `createOrder`/`createOrderLine`; `confirmQuote`/`reQuoteOrder` | 🔧 ADAPT (wrap) | Add idempotency key + conversation binding; price never from LLM |
| Customer lookup by phone | `phone-utils.ts` + `leads` | `contacts.phone` (no unique index) | 🔧 ADAPT | Normalize + dedupe |
| Payments / seña | `cash/session.ts` | `lib/payments.ts` `registerPaymentTx`/`cancelPaymentTx` + block recalc | 🔧 ADAPT (wrap) | Cent-safe, transactional |
| The deposit-block state machine | — | `lib/payments.ts` `recalculateBlockStatus` (`:79-96`) | ♻ REUSE | Expose to agent as "is this order payable?" |
| Catalog projection for prompt/media | `getMenu`/`sendMenuImage` | `products` + taxonomy + `catalog-images.ts`? (image catalog) | 🔧 ADAPT | New projection for garment sizes/techniques |
| Production status semantics | kitchen status (`isCooking`, stock flags) | `orderStatus` + `productionStage` + kanban | 🔧 ADAPT | Map "kitchen status" → stage |
| Delivery zones / hours | `agent_config.business_hours`, `whatsapp_zonas_delivery` | none (pickup workshop) | 🆕 optional | Only if pickup windows are needed |
| Bundle/recipes | n/a | `lib/garments.ts`, `lib/product-domain.ts`, taxonomy | ♻ REUSE | Agent must understand bundles when quoting |

### 3.8 Configuration / env / secrets

| Capability | Muzapp | AH Sports today | Class |
|---|---|---|---|
| Single config row w/ DB-wins precedence | `agent_config` + `lib/integrations.ts` (30s cache) | `settings` key/value | 🆕/🔧 |
| AI provider keys/config | `lib/ai/config.ts` | none | 🆕 |
| Integration secrets (YCloud/Telegram/Meta/Cloudinary/cron/escalation) | `agent_config` + env | `.env.example` only `DATABASE_URL` + `SESSION_SECRET` | 🆕 (optional per integration) |
| Env catalog | documented in `README.md` §2/§5 | minimal; `STORAGE_PROVIDER`/`NEXT_PUBLIC_APP_URL` referenced but undocumented | 🔧 ADAPT |

### 3.9 Background work

| Capability | Muzapp source | AH Sports today | Class |
|---|---|---|---|
| Debounce buffer | `lib/buffer/*` | None | ♻ REUSE |
| Queue + DLQ | `lib/queue/*` (**dead code** in Muzapp) | None | ♻ REUSE (optional) |
| Circuit breaker | `lib/infra/circuit-breaker.ts` (**dead code**) | None | ♻ REUSE (optional) |
| Cron followup | `api/cron/followup/route.ts` | None | 🆕 NEW |
| Reconcile scan/sweep + internal scheduler | `api/cron/reconcile`, `lib/reconcile/*`, `instrumentation.ts` | None | 🆕 NEW |
| Ops notifications (new order, cash close ping) | `lib/telegram/notifier.ts` | None | 🆕 NEW |
| Escalation to humans | `lib/whatsapp/tools/escalation-email.ts` (Telegram-only, misnamed) | None | 🆕 NEW |

> **Verified**: AH Sports has **zero** background infrastructure — grep for `cron|queue|worker|setInterval|notify|webhook|telegram|whatsapp|nodemailer` across `src` returns only comments and the UI placeholder.

### 3.10 Testing & deployment

| Capability | Muzapp | AH Sports today | Class |
|---|---|---|---|
| Test harness | `node:test`; `test:agents` (10 files) + `agent-consistency.test.ts` (~100 cases, incl. source-invariant assertions) | **none** | 🔧 ADAPT (port pattern; zero new runtime deps) |
| CI | (repo-local scripts) | **no `.github`** | 🆕 NEW |
| Deploy | Render + standalone + security headers + `docs` | `render.yaml` + `Dockerfile` + security headers already present | ♻ REUSE |
| Deployment docs / webhooks doc | `README.md` §4/§6 | `docs/07-DEPLOYMENT.md` | 🔧 ADAPT |

---

## 4. Gap classification summary

| Class | Count (approx.) | Nature |
|---|---|---|
| ♻ **REUSE** (port near-verbatim) | ~14 capabilities | crypto, rate-limit, idempotency, signatures, buffer, media, response bubbles, attribution signing, circuit-breaker/DLQ (optional), test harness pattern |
| 🔧 **ADAPT** (rewire to AH) | ~30 capabilities | agent loop, tool suites, session policy, order/pricing/payment adapters, admin screens/nav, config store, identity resolver |
| 🆕 **NEW** (design from scratch) | ~22 capabilities | conversations/messages/session/cart/memory/reconcile tables, WhatsApp+Telegram webhooks, agent config table + screen, conversations inbox, cron endpoints, ops notifications, domain prompts |

**Most valuable reusable assets** (highest leverage, lowest risk):
1. `src/lib/encryption.ts` (AES-256-GCM) — required before storing any key.
2. `src/lib/buffer/*` debounce manager — the difference between a chatty webhook and coherent replies.
3. `src/lib/infra/rate-limit.ts` + `src/lib/idempotency.ts` — safety for public webhooks.
4. `src/lib/whatsapp/signature.ts` — webhook authenticity.
5. The `generateText` tool-loop pattern + `prompt-security.ts` — the agent's control plane.
6. The `node:test` source-invariant pattern — how Muzapp keeps the agent honest under refactors.

**Most dangerous "copy" temptations**: NextAuth v5, `proxy.ts` (Next 16), shadcn components, the food-domain tool names/prompts, `cash_sessions` chain invariant, and Muzapp's dead code (`queue/worker`, `circuit-breaker`, `agent/buffer.ts`, `smart-split.ts`).

---

## 5. Integration contracts (freeze these before parallel work)

These TypeScript contracts are the seams that let independent worktrees build without colliding. They are proposals, not final API.

```ts
// ── channels ────────────────────────────────────────────────────────────────
type Channel = "whatsapp" | "telegram";

interface InboundMessage {
  channel: Channel;
  externalUserId: string;      // transport identity (chat id / phone)
  phone?: string;              // normalized, when available
  text?: string;               // agent-facing text (incl. "[Audio]: …")
  media?: { type: "image"|"audio"|"document"|"video"; url: string; mime?: string }[];
  platformMessageId: string;   // dedup key
  raw: unknown;
}

interface OutboundSender {
  sendText(to: string, text: string): Promise<{ platformMessageId?: string }>;
  sendImage(to: string, url: string, caption?: string): Promise<void>;
}

interface ChannelAdapter {
  verify(req: Request, rawBody: string): Promise<boolean>;   // signature/token
  normalize(req: Request, payload: unknown): InboundMessage;
  sender: OutboundSender;
}

// ── persistence ─────────────────────────────────────────────────────────────
interface ConversationStore {
  findOrCreate(channel: Channel, externalUserId: string, name?: string): Promise<{ id: string }>;
  insertMessage(
    conversationId: string,
    role: "user"|"assistant"|"system"|"human",
    content: string,
    attrs?: unknown,
    platformMessageId?: string,
  ): Promise<{ wasDuplicate: boolean }>;
  getMessages(conversationId: string, limit: number): Promise<Array<{ role: string; content: string }>>;
}

// ── agent runtime ───────────────────────────────────────────────────────────
interface AgentRuntime {
  run(ctx: {
    channel: Channel;
    conversationId: string;
    phone?: string;
    messages: Array<{ role: "user"|"assistant"|"system"; content: string }>;
    routingKind?: "allow_agent"|"fixed_ack"|"fixed_clarification"|"handoff"|"blocked"|"duplicate";
    sessionContext?: Record<string, unknown>; // allow-listed facts only
  }): Promise<{ text: string; pendingMedia: PendingMedia[] }>;
}
type AgentTool = ReturnType<typeof import("ai").tool>; // { description, inputSchema, execute }

// ── business context / config ───────────────────────────────────────────────
interface BusinessContextProvider {
  buildFacts(who: { phone?: string; contactId?: string }): Promise<{
    name?: string; history?: unknown[]; cart?: unknown[]; hours?: string;
  }>;
}
interface AgentConfigStore {
  get(): Promise<AgentConfig>;                 // DB → env → fallback
  getSecret(name: SecretName): Promise<string | null>; // decrypted, server-only
}

// ── domain adapter (the crown jewels) ───────────────────────────────────────
interface OrderIntakeService {
  quote(input: { lines: QuoteLineInput[]; urgent?: boolean }): Promise<PricingSnapshot>;
  createDraft(input: {
    contactId?: string;
    lines: QuoteLineInput[];
    idempotencyKey: string;                    // REQUIRED
    source: "whatsapp"|"telegram"|"web"|"admin";
    conversationId?: string;
  }): Promise<{ orderId: string; number: number; publicToken: string }>;
  registerPayment(input: { orderId: string; kind: "sena"|"pago"|"saldo"; method: PaymentMethod; amount: number; idempotencyKey: string }): Promise<void>;
}

// ── infra ───────────────────────────────────────────────────────────────────
interface IdempotencyStore { check(key: string): Promise<boolean>; set(key: string): Promise<void>; }
interface RateLimiter { check(bucket: string): Promise<{ ok: boolean; headers?: Record<string,string> }>; }
interface SecretCipher { encrypt(plain: string): string; decrypt(cipher: string): string; decryptIfEncrypted(v: string): string; }
```

**Invariants every worktree must honor**
- AH rule #1: **DB is the single source of truth** — tools never trust LLM-supplied prices; call `quoteOrder`/`resolveItems`.
- Public/agent intake is **idempotent** (key from transport message id).
- Agent identity is **bound to the transport sender**, never the LLM payload (mirror `create-create-order.ts:79-82`).
- Secrets are encrypted at rest and never returned to the client.
- Multi-step agent writes go through `withDbTransaction` (Neon HTTP cannot transact).

---

## 6. Dependency-ordered phase proposal (Orca worktrees)

Ordering rule: **P0 owns all schema/migration files**. Everything after P0 branches from it. Do not run two worktrees that edit the same migration or the same shared file concurrently.

```
P0 (foundations)
 └─ P1 (channels + persistence, no AI)
     └─ P2 (agent core, read-only)
         ├─ P3 (agent writes + domain adapters)
         │   ├─ P4 (admin surfaces + config)      ── can overlap P5
         │   └─ P5 (background + notifications)
         └─ P6 (attribution/storefront, optional)
                 └─ P7 (hardening + tests/CI)  [depends on all]
```

### P0 — Platform foundations (blocking, single owner)
- **Schema**: `agent_config` (or `settings` namespace), `conversations`, `chat_messages`, `agent_memories` (minimal), idempotency storage; idempotent SQL migration (`000X_agent_platform.sql`).
- **Infra ports**: `lib/encryption.ts` (key from `SESSION_SECRET`), `lib/infra/rate-limit.ts`, `lib/idempotency.ts`, `lib/logger.ts`.
- **Security**: wire `requireRole` into agent-facing routes; define an "agent service principal" and role matrix; role-gate mutations.
- **Env**: add AI/Telegram/WhatsApp placeholders to `.env.example` (no values).
- **Exit gates**: `npm run typecheck` + `npm run build` EXIT 0; migration idempotent; smoke script proves encrypt/decrypt round-trip + a role-denied mutation.
- **Worktree**: `agent-parity-base`.

### P1 — Channels & persistence (no AI)
- Adapt `lib/channels/router.ts` (find-or-create conversation, insert/dedup message, outbound dispatch).
- **WhatsApp adapter**: YCloud client + `/api/whatsapp/webhook` (signature verify, anti-replay, idempotency, protocol-artifact gate).
- **Telegram adapter**: bot client + `/api/telegram/webhook/[token]` (URL token, allowlist, rate-limit, media ingest, outbound bubbles).
- Admin: Conversations inbox (read + human reply) + Telegram config page.
- **Exit gates**: inbound persists exactly once; fixed reply round-trips; duplicate webhook is a no-op; secret-gated webhook test.
- **Worktree**: `agent-parity-channels` (from P0).

### P2 — Agent core, read-only
- Port `lib/ai/config.ts` (DB→env, OpenAI-compatible, DeepSeek non-thinking), `lib/buffer/*`, `lib/agent/{index}`, `lib/whatsapp/{prompt-builder,session-policy,anti-loop}` + `tools/prompt-security.ts`.
- Build AH **read tools**: `getCatalog`, `getProductDetails`, `getSizes`, `getQuotePreview` (calls `quoteOrder`), `getOrderStatus` (by `publicToken`/phone), `getClientHistory`, `getBusinessHours` (workshop).
- Wire `AgentRuntime` on both channels with the tool loop (`toolChoice:"required"` + hallucination guard) and pending-media.
- **Exit gates**: agent answers catalog/quote/status from real data on both channels; no write tool exists; injection guard tested.
- **Worktree**: `agent-parity-runtime` (from P1).

### P3 — Agent writes + domain adapters
- `OrderIntakeService` wrapping `createOrder`/`createOrderLine` + `quoteOrder` + idempotency.
- Tools: `createOrderDraft`/`confirmQuote`, `registerSena` (wraps `registerPaymentTx`), `advanceStage` (order-items stage), `addNote`, `requestHumanHandoff`.
- Sender-bound identity enforcement; duplicate-order guard window.
- **Exit gates**: "ask quote → agent creates draft order" happy path; replaying the same transport message creates no duplicate; blocked-payment order surfaces a payable/not-payable answer.
- **Worktree**: `agent-parity-writes` (from P2).

### P4 — Admin surfaces + config (overlaps P5)
- `/admin/agent` config screen (prompts, enabled flag, model ids, write-only secrets with `…Set`/`CLEAR`).
- Business identity pulled from `settings`; nav items for Agente/Conversaciones/Telegram; role-gated mutations.
- **Exit gates**: editing prompt/model changes behavior; secrets never appear in the client bundle; role matrix enforced.
- **Worktree**: `agent-parity-admin` (from P3).

### P5 — Background & notifications (overlaps P4)
- Notifications adapter (Telegram ops chat first) for: new order, quote confirmed, deposit received, ready-for-pickup.
- Cron: `followup` (status nudges with at-most-once claim) + optional `reconcile`; secret-gated; optional in-process scheduler flag.
- **Exit gates**: cron secret enforced; at-most-once claim proven under concurrency; notification idempotent.
- **Worktree**: `agent-parity-background` (from P3).

### P6 — Attribution / storefront (optional)
- Meta pixel + Conversions API + signed ref links + public lead capture + UTM; storefront CTA.
- **Worktree**: `agent-parity-attribution` (from P1/P3).

### P7 — Hardening & parity tests
- Port `node:test` harness; add behavioral (session policy, idempotency, signature, role) + source-invariant tests; add CI (typecheck + build + tests); audit log for sensitive mutations.
- **Worktree**: `agent-parity-hardening` (merge target for all).

**Recommended first cut**: run **Telegram-first**. It needs no BSP/Meta template approval, validates the whole runtime (session, tools, config, notifications) faster, and is exactly the "internal agent" the brief names. Then enable the WhatsApp customer agent on the validated core.

---

## 7. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Concurrent worktrees editing the same migration corrupt Neon DDL | P0 is a single-owner serialization point; one migration file per phase; migrations stay idempotent |
| R2 | Neon HTTP driver has no transactions → partial agent writes | Route multi-step writes through `withDbTransaction` (existing Pool) or make them single-statement idempotent |
| R3 | `requireRole` is unused → any user (incl. `operario`) can invoke agent mutations | Land role enforcement + agent principal in P0 before any write tool |
| R4 | No encryption today → storing API keys plaintext | Port `encryption.ts` (AES-256-GCM keyed by `SESSION_SECRET`) in P0; write-only UI |
| R5 | Domain mismatch (food vs garment) makes prompts/tools non-drop-in | Budget explicit prompt authoring; build tools on AH adapters (`quoteOrder`, BOM, stages) |
| R6 | Muzapp is Next 16 + NextAuth v5 + shadcn; AH is Next 15 + custom auth/UI | Port *logic*, not frameworks; keep AH's `auth.ts` and UI kit |
| R7 | Muzapp dead code (queue/worker, circuit-breaker, `agent/buffer.ts`, `smart-split.ts`) | Port only live paths (`buffer/manager`, `response-sender`, `ycloud` retry, `rate-limit`) |
| R8 | WhatsApp requires BSP/Meta template approvals → slow, external | Telegram-first; WhatsApp second |
| R9 | AH rule "no `Math.random()` for critical data" (public tokens already misuse it) | New idempotency/keys use `crypto` / `gen_random_uuid()` |
| R10 | No test infra or CI → regressions invisible | P7 introduces `node:test` + minimal CI; source-invariant tests mirror Muzapp |
| R11 | `orders.snapshot` immutability + re-quote semantics must hold when agent writes | All agent quoting goes through `quoteOrder`/`confirmQuote`; never write totals directly |
| R12 | Doc/code drift (AH docs list endpoints that don't exist) | Treat code as truth; update `docs/03` and `docs/05` as phases land |

---

## 8. Open questions (need a human decision)

1. **Channel priority** — Telegram-first (recommended) or WhatsApp-first?
2. **Autonomy level of the customer agent** — may it create quotes/orders autonomously, or only capture leads + notify staff? (Scopes P3.)
3. **Ops notification channel** — Telegram allowed for staff alerts, or email only?
4. **AI provider** — OpenAI, DeepSeek, or self-hosted? (affects resolver defaults + cost)
5. **Format the deliverable as a report only, or also start P0?** (Brief says: do not implement.)
6. **Is `whatsapp-business-base` (already indexed) a cleaner generic base than `muzapp`?** — a short spike could reduce domain-coupling.

---

## 9. Verification log

- AH `requireRole` unused: `grep -rn requireRole src` → single definition at `src/lib/auth.ts:82`.
- AH messaging/agent absent: grep for `telegram|whatsapp|ycloud|openai|generateText|ai-sdk|conversation|chat_message|agent` in `src/**/*.{ts,tsx}` returned only the config placeholder and unrelated forms.
- AH tests absent: `find src -name "*.test.*" -o -name "*.spec.*"` → empty; no `.github`.
- AH notifications placeholder: `src/app/(admin)/admin/configuracion/page.tsx:48-53`.
- Muzapp dead Telegram handler: `grep -rn handleTelegramUpdate src` → only its own definition.
- Muzapp `createOrder` tool: read in full (`src/lib/whatsapp/tools/create-order.ts`) — sender binding + active-order guard + DB price resolution confirmed.
- Muzapp schemas/agent/telegram/admin/public runtime: read via four exhaustive subagent sweeps with file:line evidence.
- Both graphs indexed before discovery (see §1).

---

## 10. Appendix — parity scorecard

| Area | Muzapp maturity | AH Sports readiness | Transfer cost |
|---|---|---|---|
| Infra (crypto, rate-limit, idempotency, buffer, media, signatures) | High | None | **Low** (port) |
| AI runtime & tool loop | High | None | **Medium** (rewire) |
| Messaging channels + webhooks | High | None | **High** (new) |
| Conversation/session data model | High | None | **Medium–High** (new tables) |
| Business adapters (pricing/orders/payments) | Domain-specific | **Strong existing** | **Low–Medium** (wrap AH) |
| Admin UI | High | Strong existing | **Medium** (new agent screens) |
| Auth & roles | High | Auth yes, roles unenforced | **Medium** (enforce) |
| Background & notifications | Medium (some dead) | None | **Medium** |
| Testing & CI | High | None | **Medium** |
| Attribution / Meta | High | None | **High** (optional) |
