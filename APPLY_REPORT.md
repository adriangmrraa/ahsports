# APPLY REPORT — `ai-telegram-sales-agent` · P6 WhatsApp Import (observe-only)

## Summary
Implemented Work Unit 7 / phase **P6 only**: the **WhatsApp Business import**
path, strictly **observe-only**. We now verify Meta's webhook signature, answer
the Meta verification handshake, and record WhatsApp Business operator outbound
messages as canonical facts. **There is no send path.**

1. **P6.1 — `src/lib/channels/signature.ts`**: constant-time verification of the
   Meta header `X-Hub-Signature-256` (`sha256=<hex HMAC-SHA256 of the RAW body
   with the app secret>`). Malformed/absent/mis-prefixed headers and wrong-length
   digests are rejected; the comparison is `timingSafeEqual` over the decoded
   bytes. Secret and raw body are never logged or returned.
2. **P6.2 — `src/lib/channels/whatsapp/import.ts`**: Zod schema for the Cloud
   API envelope + a pure `normalizeWhatsAppWebhook` that maps the operator's
   self-sent **`smb_message_echoes`** into canonical messages, and
   `importWhatsAppWebhook` which persists each via `importOperatorOutbound`
   (`channel: 'whatsapp'`, `direction: 'outbound'`, `senderKind: 'operator'`,
   `deliveryState: 'imported'`). **Import-only — no WhatsApp client, no send.**
3. **P6.3 — `src/app/api/whatsapp/webhook/[token]/route.ts`**: config-gated.
   `GET` handles the Meta handshake (`hub.mode=subscribe`, `hub.verify_token`,
   `hub.challenge`) and echoes the challenge only on a constant-time token match
   plus a derived path-token match. `POST` verifies `X-Hub-Signature-256` over the
   RAW body, Zod-validates, then imports operator outbound echoes.

No migration was required: the secrets are **env vars** (`WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`), wired through `src/lib/env.ts` (optional, min 16 chars
when set) and documented in `.env.example`.

## Tasks completed (mark in tasks artifact)
- [x] **P6.1** `src/lib/channels/signature.ts` — `X-Hub-Signature-256`
  constant-time verify (`verifyWhatsAppSignature`, `computeWhatsAppSignature`,
  `whatsappSignatureHeader`).
- [x] **P6.2** `src/lib/channels/whatsapp/import.ts` — normalizer →
  operator-outbound/imported, persisted via `importOperatorOutbound`.
- [x] **P6.3** `src/app/api/whatsapp/webhook/[token]/route.ts` — config-gated GET
  handshake + POST signature-verified import; **no send path**.

## Files
- `src/lib/channels/signature.ts` (new) — pure (no `server-only`, no DB) so it is
  exercisable by a DB-free check. `WHATSAPP_SIGNATURE_HEADER`/`_PREFIX` exported.
- `src/lib/channels/whatsapp/import.ts` (new) — pure schema + normalizer; the
  persistence path lazily imports `@/lib/channels/intake` (so the normalizer stays
  importable without the `server-only` DB graph — same discipline as P5's
  `retention.ts`). Exports `whatsAppWebhookSchema`, `normalizeWhatsAppWebhook`,
  `importWhatsAppWebhook`, `NormalizedWhatsAppOperatorMessage`.
- `src/app/api/whatsapp/webhook/[token]/route.ts` (new) — `runtime="nodejs"`,
  `dynamic="force-dynamic"`. Reuses `deriveWebhookPathToken` /
  `timingSafeEqualString` from the Telegram adapter (generic helpers).
- `src/lib/env.ts` (modified) — optional `WHATSAPP_APP_SECRET` +
  `WHATSAPP_VERIFY_TOKEN` (validated when present; no prod requirement so
  deployments that do not use WhatsApp are unaffected).
- `.env.example` (modified) — documents both secrets.

## Security boundaries
- **Never open**: missing config → `503`; bad signature / verify token / path
  token → `403`; bad JSON / payload → `400`; handled/duplicate/ignored → `2xx`.
  All secret comparisons are constant-time (`timingSafeEqual` / `timingSafeEqualString`).
- **Signature over raw bytes**: the route reads `request.text()` and verifies
  before `JSON.parse`, so the HMAC is computed over the exact received body.
- **No send path**: `import.ts` and the route contain no `fetch`/WhatsApp send
  endpoint (asserted by the DB-free check). The WhatsApp Business app is the
  sender; we only record the fact.
- **Zod on all input**; secrets and raw bodies are never logged or returned.

## Gates
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (EXIT 0) |
| `npm run lint` | 0 errors / 12 warnings — **identical to baseline** (0 new) |
| `npm run build` | `✓ Compiled successfully` (new route compiled + lint/types valid). Then **PRE-EXISTING ENVIRONMENTAL BASELINE** — `DATABASE_URL is required in production` (`src/db/client.ts:7`) at "Collecting page data" for `/api/applications/[id]` (a pre-existing route that statically imports `@/db/client`); same message/stage as the documented P5 baseline. No new failure mode. |
| DB-free behavior check (temp `tsx`, deleted) | PASS — **34 assertions**: signature accept/reject (tampered body, wrong secret, short hex, missing prefix, empty secret, uppercase hex), normalizer → whatsapp/outbound/operator/imported with thread = customer `to` and senderRef = business `from`, customer inbound ignored, GET challenge echo + 403s (bad verify token / path token / mode) + 503 unconfigured, POST 200/403/400/503 paths, and the static no-send assertions. |

## Decisions / notes
- **Secrets via env, no migration**: WhatsApp is opt-in/config-gated; the route
  answers `503` until both vars are set. `env.ts` keeps them optional so the rest
  of the deployment is unaffected.
- **Path token reused**: the `[token]` segment is validated against
  `deriveWebhookPathToken(verifyToken)` on both GET and POST — defense in depth,
  consistent with the Telegram webhook route.
- **Inbound `messages` and `statuses` are not imported**: P6 is operator-outbound
  observe-only (Telegram is the inbound channel). Template-status callbacks carry
  no content and are ignored.
- **Lazy `intake` import** in `import.ts` keeps the pure normalizer DB-free-testable
  without `server-only`; the route/real path always run server-side.

## Excluded (unchanged, as required)
- Any outbound/WhatsApp send, autonomous finalize/payment/production (none exist).
- **P5.4** wiring the AI loop + `enabledTools` into the live webhook router (still
  deferred).
- P7 hardening/docs: graph sync, ADR (`docs/02-ARCHITECTURE.md`), routes
  (`docs/03-API-ROUTES.md`), fresh-DB migration bootstrap, `CLEAR` sentinel,
  inbox pagination, reconcile carry-forward items.
- No `db:push`, no `db:seed`, no merge/push/deploy.

## Next unit
P7 — hardening & docs: graph sync, ADR + API routes docs, fresh-DB bootstrap,
and the accumulated P5 carry-forward items.
