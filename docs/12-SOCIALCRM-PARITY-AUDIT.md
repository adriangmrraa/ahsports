# 12 — Auditoría de paridad SocialCRM → AH Sports

> **Tipo**: auditoría read-only de gaps. Baseline de lo ya portado: `docs/11-SOCIALCRM-PORT-REPORT.md`.
> **Alcance**: qué features/endpoints/flujos/páginas/controles de SocialCRM NO están o están a medias en AH Sports. Sin implementación, sin cambios de código/schema/DB.
> **Fecha**: auditoría sobre working tree actual (post-olas 1–3).
> **Método**: inventario de `src/lib`, `src/app`, `src/db/schema.ts` y `package.json` de ambos repos; verificación línea-por-línea de cada claim de `docs/11` marcado como "diferido"; grafo de conocimiento (2871 nodos) como puerta de entrada.

---

## 1. Resumen ejecutivo

- **Total de gaps confirmados**: **54** (sin contar ítems NO-APLICA ni verificados-no-gap, listados en §5).
- Por área: **A Backend** 18 · **B Endpoints** 11 · **C Frontend** 8 · **D Persistencia** 2 · **E Handoff** 3 · **F Proveedores** 5 · **G Seguridad** 2 · **H Atribución** 5.
- Por severidad: **CRÍTICA 4** · **ALTA 14** · **MEDIA 24** · **BAJA 12**.

### Los 4 gaps críticos

| # | Gap | Por qué es crítico |
|---|-----|--------------------|
| B-01 | El dispatcher de ventas **no está registrado en el ingress unificado** | El agente de ventas de WhatsApp es código muerto en el camino canónico: `/api/webhooks/ingress/[provider]` no importa `lib/whatsapp/register`, cae al default dispatcher. Solo el webhook Meta dedicado lo activa. El propio código lo documenta como TODO de una línea. |
| A-01 | Pipeline de media desconectado | `lib/media/{downloader,transcription,vision,document,video}` existe pero **nadie lo invoca**: una foto de diseño por WhatsApp llega al agente como `[image]`. En el dominio textil, la imagen del cliente es input central. |
| A-02 | Buffer/queue in-memory sin retries ni DLQ | `BufferManager` + `setTimeout` en proceso: en cada restart/deploy se pierden los turnos pendientes de debounce — el mensaje queda persistido pero **el agente nunca responde**, silenciosamente. |
| D-01 | Persistencia pasiva limitada a whatsapp/telegram | `PERSISTABLE_CHANNELS` deja a instagram/facebook/sms/reddit con marker+ack en `channel_events` y **sin conversación ni mensaje**: conectar una cuenta IG/FB descarta datos silenciosamente. |

### Lo que ya está bien (no re-listar)

Contrato de messaging completo (`types.ts`: `MessagingProvider`, `NormalizedInboundEvent`, `OutboundMessage`, `SendResult`, `signatureScheme`), intake canónico transaccional con dedup por (channel, platform_message_id), ingress unificado con rate-limit + body bound + resolución por cuenta fail-closed, adapters ycloud/kapso/zernio, `sendTemplate` en messenger+zernio+kapso, bot operador Telegram completo (identidad, tools, confirmación en dos pasos, dryRun de broadcast, notifier), sales-agent con session-policy/anti-loop/temporal-context/prompt-injection-guard/re-pricing server-side/handoff→Telegram, reconcile runner+scan read-only, inbox read-only, CRUD de channel_accounts + zernio embedded connect + registro de webhook, agent_config con scopes y secretos cifrados, login throttle, logs sin PII.

---

## 2. Tabla maestra de gaps

| ID | Área · Feature | Fuente SocialCRM | Estado | Sev. | Esf. | Cierre en 1 línea |
|----|----------------|------------------|--------|------|------|-------------------|
| B-01 | B · Dispatcher de ventas en ingress unificado | `src/lib/messaging/inbound-pipeline.ts` + `src/app/api/whatsapp/webhook/route.ts` | **SEAM** | CRÍTICA | S | Agregar `import "@/lib/whatsapp/register"` (o registrar dispatcher por canal) en `src/app/api/webhooks/ingress/[provider]/route.ts` |
| A-01 | A · Media pipeline inbound | `src/lib/media/` + `src/lib/messaging/webhook-pipeline.ts` | **SEAM** | CRÍTICA | M | Invocar `downloadMedia`→`transcription`/`vision` en `inbound-pipeline.ts` y pasar texto/análisis al turn |
| A-02 | A · Queue durable + retries + DLQ | `src/lib/queue/` (Upstash), `src/lib/buffer/` | **PARCIAL** | CRÍTICA | L | Queue persistente (Postgres table o Redis) con claim/retry/DLQ; flush del buffer sobrevive restart |
| D-01 | D · Persistencia pasiva multicanal | `src/lib/messaging/ingress.ts` (persiste todo canal) | **SEAM** | CRÍTICA | M | Eliminar/ampliar `PERSISTABLE_CHANNELS` y verificar resolución de conversación por canal |
| A-03 | A · Auto-reply 24h / primer contacto | `src/lib/messaging/auto-reply.ts` + `agent_config.autoReply24h*` | **SEAM** | ALTA | M | Columnas/scope config + call-site en pipeline tras persistir inbound |
| A-04 | A · Notificación de estado de pedido al cliente | `src/lib/whatsapp/order-status-notify.ts` + `admin/orders/actions.ts` | **AUSENTE** | ALTA | M | Portar notify + llamarlo desde actions de stage/status de pedidos |
| A-05 | A · Follow-up post-entrega | `src/lib/cron/followup.ts` + `/api/cron/followup` | **AUSENTE** | MEDIA | M | Columna `followupSent` + lib + endpoint cron Bearer |
| A-06 | A · Reconcile scheduler + cron endpoint | `src/lib/reconcile/scheduler.ts` + `/api/cron/reconcile` | **PARCIAL** | ALTA | M | Endpoint `/api/cron/reconcile` Bearer que invoque runner (hoy solo manual `/api/telegram/reconcile`) |
| A-07 | A · Send-media tools del agente | `src/lib/whatsapp/tools/send-media-tools.ts`, `sticker-tools.ts` | **AUSENTE** | MEDIA | M | Tools sendImage/sendDocument sobre messenger + adjuntos de catálogo/pedido |
| A-08 | A · Web-order-redirect → presupuesto | `src/lib/whatsapp/web-order-redirect.ts` | **AUSENTE** | MEDIA | S | Config + tool/directiva que linkee `/presupuesto` cuando aplique |
| A-09 | A · Order-context (carrito conversacional TTL) | `src/lib/order-context.ts` + `order_context_items` | **AUSENTE** | BAJA | S | Tabla + tools add/remove/list items previos al draft |
| A-10 | A · Broadcast WA segmentado a clientes | `src/lib/whatsapp/broadcast.ts` | **PARCIAL** | MEDIA | M | Audiencias por leads/segmentos + opt-out (hoy `tools-broadcast` es genérico) |
| A-11 | A · Tools business-hours/availability/alias | `tools/get-business-hours.ts`, `check-availability.ts`, `extended-tools.ts` | **AUSENTE** | BAJA | S | Config de horarios/datos de pago + tools de lectura |
| A-12 | A · Order-management tools del cliente | `tools/order-management-tools.ts` | **AUSENTE** | BAJA | S | Tools update/cancel sobre borradores (hoy solo creación; decisión consciente: confirmación humana) |
| A-13 | A · Cash sessions + movements + rollover | `src/lib/cash/session.ts`, `rollover.ts`, tablas `cash_*` | **AUSENTE** | MEDIA | L | Evaluar necesidad en dominio textil; hoy `tools-cash` cierra sobre ledger + marker |
| A-14 | A · Promotions | `promotions` schema + `/api/promotions` + `/admin/promos` | **AUSENTE** | BAJA | M | Tabla + página + tool catálogo si el negocio vende promos |
| A-15 | A · Credenciales de integración vía UI | `src/lib/integrations.ts` (todo el set en `agent_config` cifrado) | **PARCIAL** | MEDIA | M | Extender campos `*Enc` por cuenta/scope o vault-ref resoluble; hoy `credentialsRef: env:*` exige redeploy |
| A-16 | A · Business info + business-hours | `src/lib/business.ts`, `src/lib/business-hours.ts` | **AUSENTE** | MEDIA | S | Keys en `settings` + getBusinessInfo + tool horarios |
| A-17 | A · Lead entity + auto-capture + ref stamp | `src/lib/whatsapp/lead-capture.ts`, `leads` schema | **PARCIAL** | ALTA | M | Tabla `leads` (o flag en contacts) + `captureLeadIfNew` en pipeline + extracción `ref:` |
| A-18 | A · Test suite de agentes | `package.json` `test`, `src/lib/**/*.test.ts` | **AUSENTE** | ALTA | M | Portar suite node:test crítica (intake dedup, dispatcher, anti-loop, tools repricing, confirmations) |
| B-02 | B · `POST /api/leads` | `src/app/api/leads/route.ts` | **AUSENTE** | ALTA | S | Endpoint público con UTM/ad fields + rate-limit |
| B-03 | B · `GET /api/business` | `src/app/api/business/route.ts` | **AUSENTE** | MEDIA | S | Endpoint público con identidad no-secreta del negocio |
| B-04 | B · `POST /api/admin/ref-code` | `src/app/api/admin/ref-code/route.ts` | **AUSENTE** | ALTA | S | Mint server-side de ref codes firmados HMAC |
| B-05 | B · `GET /api/admin/dlq` | `src/app/api/admin/dlq/route.ts` | **AUSENTE** | MEDIA | S | Depende de A-02: leer mensajes dead-lettered |
| B-06 | B · `/api/agent/test` + `/api/admin/test-agent` | rutas homónimas | **AUSENTE** | MEDIA | S | Test de config de provider AI (DB+env) sin enviar mensajes |
| B-07 | B · `GET /api/whatsapp-phone` | `src/app/api/whatsapp-phone/route.ts` | **AUSENTE** | BAJA | S | Exponer número WA público para CTA (pre-req de C-08) |
| B-08 | B · `GET /api/link-preview` | `src/app/api/link-preview/route.ts` | **AUSENTE** | BAJA | M | OG fetch con guardas SSRF (solo si el inbox lo usa) |
| B-09 | B · `/api/meta/webhook` + `callback` + `oauth-*` | rutas meta/* | **PARCIAL** | MEDIA | M | Zernio cubre IG/FB; falta Meta directo (pixel/app OAuth) — ver F-04 |
| B-10 | B · `/api/products` + `/api/promotions` públicos | rutas homónimas | **PARCIAL** | BAJA | S | APIs admin existen; falta JSON público rate-limited (la página catálogo lee DB directo) |
| B-11 | B · `/api/setup` | `src/app/api/setup/route.ts` | **AUSENTE** | BAJA | S | Setup/onboarding inicial (seed cubre hoy) |
| C-01 | C · Página leads admin | `src/app/(admin)/admin/leads/page.tsx` | **AUSENTE** | ALTA | M | Lista leads con UTM/ref/estado + acciones (depende A-17/H-01) |
| C-02 | C · Página analytics + link-generator | `src/app/(admin)/admin/analytics/` | **AUSENTE** | ALTA | M | Dashboard atribución + generador de links `ref:` (depende H-02) |
| C-03 | C · Página meta (pixel/CAPI) | `src/app/(admin)/admin/meta/page.tsx` | **AUSENTE** | MEDIA | M | Config pixel/CAPI + estado de eventos (depende H-03/H-04) |
| C-04 | C · Página promos | `src/app/(admin)/admin/promos/page.tsx` | **AUSENTE** | BAJA | M | CRUD promos (depende A-14) |
| C-05 | C · Página contactos standalone | `src/app/(admin)/admin/clients/page.tsx` | **PARCIAL** | BAJA | S | Contactos hoy viven dentro de organizaciones/[id]; falta vista plana tipo leads/clients |
| C-06 | C · Página DLQ | (viewer sobre `/api/admin/dlq`) | **AUSENTE** | MEDIA | S | UI dead-letter (depende A-02/B-05) |
| C-07 | C · CTA wa.me en flujo público | `lib/checkout/service.ts` (receipt wa.me) + CTAs storefront | **AUSENTE** | MEDIA | S | Link wa.me con mensaje prellenado en `/presupuesto/5` y `/seguimiento` (ningún `wa.me` existe en `src/`) |
| C-08 | C · Campos agent_config en UI | `src/app/(admin)/admin/agent/page.tsx` (SocialCRM) | **PARCIAL** | MEDIA | M | Agregar: enabled kill-switch, autoReply, redirect, horarios, datos de pago, meta creds, phone WA |
| E-01 | E · Reply-as-operator desde inbox (todos los canales) | `admin/conversations/actions.ts` `sendReply` + `resolveHandoffTransport` | **AUSENTE** | ALTA | M | Server action sendReply→messenger.send por cuenta del thread + composer en inbox (hoy solo vía tool Telegram) |
| E-02 | E · `toggleHumanOverride` UI/action | `admin/conversations/actions.ts` | **PARCIAL** | ALTA | S | Action + botón sobre `isHumanOverrideActive`/`agent_memories` (el flag existe; solo lo setea `transferToHuman`) |
| E-03 | E · Resolver handoff manualmente | flujo resolve en SocialCRM | **PARCIAL** | MEDIA | S | Marcar conversación resuelta antes del TTL de 24h |
| F-01 | F · YCloud `sendTemplate` | adapter ycloud | **PARCIAL** | MEDIA | S | Implementar `sendTemplate` en `providers/ycloud.ts` (kapso/zernio ya lo tienen) |
| F-02 | F · Gating ventana 24h → template | lógica en pipeline/agente SocialCRM | **AUSENTE** | MEDIA | M | Decidir text-vs-template por ventana antes de enviar (documentado como no portado en `sales-agent.ts`) |
| F-03 | F · Kapso embedded signup | flujo kapso connect | **AUSENTE** | MEDIA | M | Connect embebido tipo zernio para kapso |
| F-04 | F · Meta OAuth directo | `/api/meta/oauth-*` | **PARCIAL** | BAJA | L | Solo si se quiere Meta sin middleware; zernio ya cubre IG/FB |
| F-05 | F · Media download kapso/zernio | `lib/media/downloader.ts` | **PARCIAL** | MEDIA | S | Dominios/flujo de fetch para kapso/zernio (hoy solo ycloud two-step) |
| G-01 | G · Kill-switch `agent_config.enabled` | `agent_config.enabled` (SocialCRM schema) | **AUSENTE** | MEDIA | S | Flag booleano evaluado en dispatcher (hoy solo se "apaga" desconectando la cuenta) |
| G-02 | G · Rate-limit en GETs públicos | `checkRateLimit` en rutas públicas SocialCRM | **PARCIAL** | BAJA | S | Auditar `/catalogo`, `/seguimiento`, `/api/public/order` (wizard ya tiene límites) |
| H-01 | H · UTM/ref en leads | columnas `utm*`/`refCode`/`adId` en `leads` | **AUSENTE** | ALTA | M | Columnas en leads/contacts + captura en `/api/leads` y primer mensaje |
| H-02 | H · Links `ref:` firmados + generador | `lib/attribution/ref-code*.ts` + página link-generator | **AUSENTE** | ALTA | M | Lib sign/verify + endpoint mint + UI (wa.me con `ref:` prellenado) |
| H-03 | H · Meta Pixel | snippet + config en SocialCRM | **AUSENTE** | MEDIA | M | Pixel id en settings/config + snippet en layout público |
| H-04 | H · Conversions API | `lib/meta/conversions.ts` (CAPI) | **AUSENTE** | MEDIA | L | Envío server-side de eventos lead/purchase con dedup |
| H-05 | H · Lib analytics de atribución | `src/lib/analytics/` | **AUSENTE** | ALTA | L | Queries de funnel lead→pedido por campaña/canal/alimenta C-02 |

*(54 filas: 18 A + 11 B + 8 C + 2 D + 3 E + 5 F + 2 G + 5 H)*

---

## 3. Detalle por área

### A. Backend / capas de dominio

**A-01 · Media pipeline desconectado — CRÍTICA.**
AH tiene el stack completo portado (`downloader.ts` con allowlist de dominios, límite de bytes, magic-bytes, storage privado, two-step YCloud; `transcription.ts`, `vision.ts`, `video.ts`, `document.ts`) pero **ningún call-site**: `inbound-pipeline.ts` normaliza `mediaRefs` y reduce el contenido a placeholders (`[image]`, `[audio]`). El agente de ventas recibe `text` puro. En SocialCRM el pipeline descarga, transcribe audios, corre visión sobre imágenes y alimenta el turn. En una fábrica de indumentaria personalizada, "el cliente manda la foto del diseño" es *el* input principal — hoy es invisible.

**A-02 · Queue/Buffer no durable — CRÍTICA.**
SocialCRM: `src/lib/queue/` (Upstash Redis) con worker, retries y DLQ + `src/lib/buffer/` persistente. AH: `BufferManager` en memoria + `scheduleBufferProcessing` vía timer en proceso (`inbound-pipeline.ts`). Sin dependencia Redis en `package.json`. Consecuencias: (1) restart/deploy con debounce pendiente → turno nunca despachado (mensaje persistido, cliente ignorado, sin señal); (2) un fallo de dispatch/send no reintenta; (3) sin DLQ no hay visibilidad de fallos permanentes. En serverless el timer in-process además puede no sobrevivir al response.

**A-03 · Auto-reply 24h / primer contacto — SEAM.**
`src/lib/messaging/auto-reply.ts` existe con claim durable en `idempotency_keys`, pero: no hay columnas `autoReply24h*`/`autoReply24hMessage` en `agent_config` (el propio archivo lo documenta), no hay decisión enable/mensaje y no hay call-site en el pipeline. SocialCRM respondía automáticamente el primer contacto fuera de ventana.

**A-04 · Notificación de estado de pedido — AUSENTE.**
SocialCRM `order-status-notify.ts` es invocado desde `admin/orders/actions.ts` (2 call-sites) y desde `telegram/order-lifecycle.ts`: al cambiar estado el cliente recibe WhatsApp. En AH **ningún action/route importa messenger ni envía al cliente** (grep en `src/app/actions` y `api/orders/[id]/stage` = cero envíos). El cliente nunca se entera de que su pedido avanzó salvo consulta manual.

**A-05 · Follow-up post-entrega — AUSENTE.**
SocialCRM: `orders.followupSent` + `lib/cron/followup` + `/api/cron/followup` (Bearer CRON_SECRET, 15min) → mensaje de seguimiento tras `delivered`. AH: sin columna, sin lib, sin endpoint. User story de re-engagement perdida.

**A-06 · Reconcile scheduler — PARCIAL.**
Runner+scan+tools+prompt portados y read-only (agua firmas en `agent_memories`, lock en `idempotency_keys`). Falta: `scheduler.ts` (instrumentation/`INTERNAL_CRON`), endpoint `/api/cron/reconcile` Bearer, y tablas `reconcile_runs`/`reconcile_candidates` (SocialCRM persiste cada candidato + corrida para tracking; AH usa `agent_memories` como store genérico — funcional pero sin historial estructurado). Hoy reconcile solo corre manual vía `/api/telegram/reconcile` + `/api/agent/reconcile`.

**A-07 · Send-media tools — AUSENTE.**
El agente de SocialCRM puede enviar imágenes/documentos/stickers (`send-media-tools.ts`, `sticker-tools.ts` — ej. mandar foto del producto o el menú). AH: 10 tools, todas texto. No puede mandar catálogo visual ni ficha técnica por WA.

**A-08 · Web-order-redirect — AUSENTE.**
SocialCRM detectaba intención compleja y redirigía a la carta web con mensaje configurable. AH tiene `/presupuesto` (equivalente del flow web) pero el agente no conoce su URL ni la ofrece; `web-order-redirect.ts` no se portó.

**A-09 · Order-context items — AUSENTE.**
`order_context_items` (TTL 30min): carrito en-conversación que el agente suma antes de formalizar. AH: el agente crea `draftOrder` directo; sin carrito intermedio. Menor — el flujo de draft cubre lo esencial.

**A-10 · Broadcast WA a clientes — PARCIAL.**
`tools-broadcast.ts` está completo (dryRun→confirm, dedup 24h, MAX 200, persistencia canónica, fail-closed por cuenta) pero audiencias = `all|with_orders|search` sobre contacts. SocialCRM `whatsapp/broadcast.ts` segmentaba por leads con atribución y manejaba opt-out. Sin `leads`, la segmentación de marketing es limitada.

**A-11 · Tools horarios/disponibilidad/alias — AUSENTE.**
`get-business-hours`, `check-availability`, `payment-alias` (datos de pago/seña). Sin equivalente; tampoco existe dónde configurarlos (ver A-16).

**A-12 · Order-management tools cliente — AUSENTE (por diseño parcial).**
SocialCRM: update/cancel/add-item sobre pedidos confirmados con confirmaciones. AH: el agente solo crea **borradores** reversibles — decisión deliberada y más segura para textil; el gap real es que el cliente no puede *modificar* su borrador conversacionalmente (debe re-emitir). Menor.

**A-13 · Cash sessions — AUSENTE (mapeo parcial válido).**
SocialCRM: cadena continua de sesiones de caja física + `cash_movements` + rollover 2am + notify. AH: `tools-cash` implementa "cierre" como marker `caja:last_close` en `agent_memories` sobre el ledger de pagos — cubre consulta/cierre lógico; no hay registro de efectivo físico ni arqueo esperado-vs-real. Si AH no maneja caja física diaria → degradar a NO-APLICA; si cobra señas en efectivo → MEDIA.

**A-14 · Promotions — AUSENTE.** Tabla `promotions`, `/api/promotions`, `/admin/promos`, ofertas en checkout. Sin equivalente.

**A-15 · Credenciales por UI — PARCIAL.**
`integrations.ts` guarda TODA credencial en `agent_config` cifrada (ycloud key/secret, cloudinary, meta app, telegram notify, cron, escalation) editable desde `/admin/agent` con invalidación de cache. AH: `botTokenEnc/providerKeyEnc/webhookSecretEnc` por scope + `credentialsRef: "env:PREFIX"` para el resto → agregar una cuenta YCloud/Kapso/Zernio exige env var + redeploy. Diseño válido (secrets fuera de DB) pero pierde la meta self-hosted "configurar sin tocar infra".

**A-16 · Business info/hours — AUSENTE.**
`getBusinessInfo()` (nombre, dirección, WA público, IG, horarios) desde `agent_config` + formatter de horarios. AH tiene `settings` key-value sin usar para esto; los CTAs y el prompt no conocen identidad configurable del negocio.

**A-17 · Leads + auto-capture — PARCIAL.**
`ensureLeadIdentity`/`leadIdentities` vinculan canal↔contacto ✓, pero no existe la entidad `leads` (teléfono + UTM + ref + estado + `channel_account_id` de primera atribución) ni `captureLeadIfNew` en el pipeline ni extracción `ref:CODE`. Contactos se crean por otro camino (organizaciones/presupuesto). Sin esto H-01..H-05 no tienen dónde aterrizar.

**A-18 · Test suite — AUSENTE.**
SocialCRM: `npm test` (`--test` sobre suite `test:agents`: agent, signature, broadcast, delivery-notify, order-status-notify, temporal-order-guard, web-order-redirect, order-tools-hardening, security-round4). AH: **cero `*.test.ts`**, solo `check:agent-tools` (contrato estático de tools). El port más riesgoso (money/PII/agente) no tiene red de regresión.

**NO-APLICA en A**: `actor.ts` seller/delivery (operadores AH = Telegram), `seller-prompt.ts`/`internalSellerTools` (cubierto y superado por el bot TG), `escalation-email` (notify→Telegram binding), `delivery-notify` (sin actor repartidor), `lib/cart/` + `lib/checkout/` (dominio menú→wizard presupuesto, ver C-07 para el handoff WA faltante), `addresses.ts` (delivery a domicilio no aplica), `idempotency.ts` map in-memory (AH usa tabla — mejor), `order-utils.ts` (helpers de formato de menú), `rolloverCashDay` (con A-13).

**Verificado — NO es gap**: "circuit breaker" — el README de SocialCRM lo menciona pero **no existe en su código** (cero matches en `src/`); no portarlo no es deuda. `webhook-pipeline.ts` → portado como `inbound-pipeline.ts`. `conversation-metadata.ts` → `session-metadata.ts`. `signature.ts` → `channels/signature.ts`.

### B. Endpoints / rutas API

**B-01 — el más importante** (ver tabla): `src/lib/whatsapp/register.ts` se auto-registra `whatsappSalesDispatcher` al importarse; `src/app/api/whatsapp/webhook/[token]/route.ts` lo importa, `src/app/api/webhooks/ingress/[provider]/route.ts` **no**. Resultado: el camino canónico corre `defaultInboundTurnDispatcher` (ack/echo/operator-check + `routeInboundMessage` genérico), nunca la máquina de ventas.

Implementados o mapeados OK: `/api/telegram/webhook/[token]` ✓, `/api/whatsapp/webhook/[token]` ✓ (per-account token, mejor que el global), `/api/webhooks/ingress/[provider]` ✓, `/api/media/[...path]` ✓ (sirve storage de adjuntos), `/api/agent/reconcile` + `/api/telegram/reconcile` ✓ (manuales), `/api/products`/`/api/contacts`/`/api/orders`/`/api/payments` (admin), `/api/public/order/[token]` (seguimiento), `/api/products/[id]/image` (upload de imagen de producto — cubre `/api/media/upload` de catálogo).

Ausentes: `/api/leads` (B-02), `/api/business` (B-03), `/api/admin/ref-code` (B-04), `/api/admin/dlq` (B-05), `/api/agent/test` + `/api/admin/test-agent` (B-06), `/api/whatsapp-phone` (B-07), `/api/link-preview` (B-08 — con guardas SSRF, solo necesario si el inbox previewea links), `/api/meta/*` (B-09 — ver F-04), `/api/products` + `/api/promotions` **públicos** rate-limited (B-10 — los existentes son admin), `/api/setup` (B-11), `/api/cron/followup` + `/api/cron/reconcile` (A-05/A-06). `/api/checkout` → mapeado a `createPublicOrder` server action (mejor: transaccional, valida upload-session), salvo el handoff WA (C-07).

### C. Frontend / páginas

AH tiene páginas que SocialCRM no tiene (pedidos/kanban, ficha técnica, arte, insumos, moldes, proveedores, recetas, técnicas, configuración) — dominio más rico. Faltantes del lado agentes/marketing:

- **C-01 leads** — sin `/admin/leads` (contacts ≠ leads con atribución).
- **C-02 analytics + link-generator** — sin `/admin/analytics` ni generador de links `ref:`.
- **C-03 meta** — sin `/admin/meta` (pixel/CAPI).
- **C-04 promos** — sin `/admin/promos`.
- **C-05 contactos standalone** — vista plana tipo `/admin/clients`; hoy solo dentro de `organizaciones/[id]`.
- **C-06 DLQ** — sin viewer.
- **C-07 CTA wa.me** — `grep wa.me` en todo `src/` = **0 matches**: `/presupuesto/5` y `/seguimiento` no ofrecen continuar por WhatsApp. SocialCRM cerraba el loop checkout→`wa.me?text=...`→conversación con `Referencia WEB:` que el agente retomaba (`findReferencedWebOrder`). AH termina el wizard en una página de tracking — handoff al canal de ventas ausente.
- **C-08 campos agent_config** — el form AH edita provider/model/systemPrompt/enabledTools + 3 secretos; faltan los campos operativos de SocialCRM (enabled, autoReply, redirect, horarios, teléfono WA, escalation, meta/ycloud creds).

Sin gap: badge de canal/cuenta en inbox ✓ (provenance visible), selector de scope en agent config ✓, secrets write-only status ✓, `/admin/canales` con endpoints copiables + connect ✓, `/admin/agent/telegram` ✓.

### D. Persistencia pasiva

- **D-01** (crítico): `PERSISTABLE_CHANNELS` = whatsapp/telegram en `src/lib/messaging/ingress.ts`. El enum `channel` ya admite instagram/facebook/sms/reddit y las tablas son canal-agnósticas → es un seam de código, no de schema. Sin agente activo, WA/TG igual persisten conversación+mensaje vía `intake.ts` ✓; IG/FB/SMS quedan como `channel_events` marker + delivery-marker.
- **D-02**: `conversations.externalThreadId` existe pero **no** `providerThreadId` — SocialCRM separaba el thread nativo del provider (zernio) para enviar DMs/comentarios al thread correcto.
- Outbound: `intake.ts` persiste outbound con delivery state (`queued`→`sent`/`failed`) ✓; broadcast/bot/human-reply pasan por el mismo intake ✓. `notifyHandoffOperators`/notifier pushean a Telegram sin persistir (interno, aceptable — igual que SocialCRM).
- `channel_events`: markers + passive non-persistable ✓.
- Dedup: `unique(channel, platform_message_id)` + delivery-marker claim/release ✓ por cuenta (la resolución es account-scoped y fail-closed).

### E. Handoff humano / takeover

El handoff *iniciado por el agente* está completo: `transferToHuman` tool → `human-handoff.ts` → claim idempotente en `idempotency_keys` → `humanOverride` en `agent_memories` (TTL 24h, chequeado por `isHumanOverrideActive` en el dispatcher) → notify a operadores TG (sin mentir sobre entregas fallidas). Lo que falta es la **dirección operador→conversación**:

- **E-01**: no existe `sendReply`/`send-as-operator` desde UI para *ningún* canal (SocialCRM lo tenía para WA vía `resolveHandoffTransport`; el backend AH lo permite — `messenger.send` por account — es solo falta de action+UI). Workaround actual: tool de broadcast/Telegram, que sí persiste outbound.
- **E-02**: `toggleHumanOverride` no existe en ningún lado — ni action ni botón. El flag solo lo escribe `transferToHuman`; un operador no puede tomar una conversación manualmente.
- **E-03**: no hay "resolver/cerrar handoff"; expira por TTL de 24h (auto-resolución implícita).

### F. Proveedores

- **YCloud**: send ✓, inbound via ingress/webhook ✓, firma HMAC `t,s` fail-closed ✓, media two-step ✓. Falta `sendTemplate` (F-01) y gating de ventana 24h (F-02) — kapso/zernio ya implementan `sendTemplate`; messenger prefiere ese path cuando existe.
- **Kapso**: adapter completo con `sendTemplate` ✓ + credenciales account-scoped fail-closed ✓. Falta embedded signup (F-03).
- **Zernio**: adapter IG/FB ✓, embedded connect OAuth/WA-ES con CSRF nonce ✓, registro de webhook one-click ✓, `sendTemplate` ✓ + TEMPLATE_REQUIRED en open freeform ✓.
- **Telegram**: bot token cifrado + secret-token verify + webhook `[token]` ✓.
- **Meta directo**: OAuth/pixel/CAPI ausentes (B-09/F-04/H-03/H-04).
- **channel_accounts**: CRUD completo ✓ (identidad inmutable post-create, único por provider+accountId) + connect flows (zernio).
- **Media download** solo conoce dominios YCloud (F-05) — kapso/zernio necesitarían allowlist al activar A-01.
- SMS/Reddit: en enum, sin adapter → NO-APLICA (futuro).

### G. Seguridad

**Verificado implementado** (con evidencia): login throttle (per-IP/email + dummy hash) en `lib/auth`, webhook body-bound + event caps + per-account secret + constant-time + fail-closed en ingress, resolución de credenciales account-scoped fail-closed (YCloud/Kapso no caen a globals), `idempotency_keys` dedup, anti-loop en sales-agent, `PROMPT_INJECTION_GUARD` + sanitize de campos persistidos + untrusted-content wrapping en TG, re-pricing server-side (`quoteOrder`) con drafts reversibles, confirmación en dos pasos con claim atómico single-use, reconcile read-only, secretos cifrados AES-GCM (`*Enc`), logs sin PII (grep: solo 2 console con metadata no-PII en todo `src/`).

**Gaps**: `agent_config.enabled` kill-switch (G-01 — hoy apagar = desconectar cuenta o limpiar config) y rate-limit en GETs públicos no críticos (G-02 — el wizard sí tiene buckets `public:wizard`).

### H. Atribución / marketing / analytics

Área completa ausente como sistema: sin tabla `leads` con `refCode/utm*/adId/campaignId/adsetId/platform` (H-01), sin lib `attribution/` (sign/verify `ref:` + cookie capture UTM) (H-02), sin `/api/leads` público (B-02), sin `/api/admin/ref-code` (B-04), sin link-generator + página analytics (C-01/C-02), sin Pixel (H-03), sin CAPI (H-04), sin `lib/analytics` de funnel (H-05). El pipeline AH menciona "attribution" solo en el contexto de resolución de cuenta. Todo el bloque depende de A-17 (dónde vive el lead) → implementar como paquete.

---

## 4. Ítems NO-APLICA / verificados sin gap

**NO-APLICA** (mapeo de dominio legítimo): seller/delivery actors en WA, `seller-prompt`+internal tools, `escalation-email`, `delivery-notify`, cart/checkout libs (→ wizard presupuesto), `addresses`, `idempotency.ts` map (→ tabla), `order-utils` (formato menú), cash rollover (→ A-13 decidir), Meta webhook directo si zernio cubre, `/api/media/upload` (→ `/api/products/[id]/image` + attachments), SMS/Reddit adapters.

**Verificado como NO-gap**: circuit breaker (no existe en SocialCRM src aunque su README lo mencione), PII en logs (limpio), contract messaging completo, `sendTemplate` en kapso/zernio/messenger, broadcast operador con dryRun+confirm+dedup, confirmations atómicas, zernio connect + webhook registration, login throttle, webhook hardening completo.

---

## 5. Top 10 — orden de implementación recomendado

| # | Gap | Esf. | Justificación |
|---|-----|------|---------------|
| 1 | **B-01** dispatcher en ingress unificado | S | Una línea; sin esto el agente de ventas — el feature central de las 3 olas — nunca corre en el camino canónico. Verificar después qué path usa el webhook de producción. |
| 2 | **A-18** test suite de agentes | M | Antes de tocar el pipeline (A-01/D-01/A-02): sin red de regresión, cada fix del punto 1 es a ciegas. Portar node:test de intake/dedup/dispatcher/anti-loop/tools. |
| 3 | **A-01** media pipeline | M | El input más valioso del dominio textil (foto del diseño) hoy es invisible. Encadena: downloader→transcription/vision→turn text→opcionalmente attachments vinculados al contacto. |
| 4 | **D-01** persistencia pasiva multicanal | M | Pre-requisito de conectar IG/FB reales (zernio ya está listo): hoy conectar una cuenta descarta mensajes silenciosamente. |
| 5 | **E-01+E-02** reply-as-operator + override UI | M | El humano no puede intervenir la conversación desde el inbox ni tomar control manualmente — solo vía Telegram. Es la mitad del modelo "agente con supervisión humana". |
| 6 | **A-02** queue durable + retries + DLQ | L | Elimina la pérdida silenciosa de turnos en cada deploy; base para DLQ UI (C-06/B-05). Puede resolverse con tabla Postgres + worker ligero sin meter Redis. |
| 7 | **A-04** order-status notify al cliente | M | User story directa: "me avisan cuando mi pedido cambia de etapa". Reusa messenger+intake; acoplado a actions de stage ya existentes. |
| 8 | **A-03** auto-reply 24h + **F-02** ventana/template | M | Respuesta de primer contacto y cumplimiento de la ventana de Meta para replies tardíos — necesario antes de escalar tráfico WA. |
| 9 | **A-06** reconcile cron endpoint + scheduler | M | Hoy la reconciliación depende de que alguien dispare la ruta a mano; externalizar a cron Bearer cierra el loop de "ventas en chat que no quedaron cargadas". |
| 10 | **A-17+H-01/02** leads + atribución base | M | Paquete mínimo (tabla leads + capture + ref sign/verify + `/api/leads` + link-generator) que habilita todo el bloque H; sin él nada de marketing es medible. |

**Honorable mentions**: C-07 (wa.me CTA — S, alto ROI de UX), G-01 (kill-switch — S), F-01 (ycloud sendTemplate — S, desbloquea F-02), A-15 (creds por UI — solo si se multi-tenantiza), B-06 (test-agent endpoint — S).

---

## 6. Notas de método y límites

- Todo verificado contra código (no se confió en estados declarados en `docs/11`; cada "diferido" se confirmó con su archivo/línea).
- No se ejecutó `lint` (roto conocido), ni migraciones, ni seeds; cero escrituras en DB; cero lecturas de valores de secretos (solo nombres de env).
- `check:agent-tools` existe como gate estático; no se corrió (read-only).
- Incertidumbres residuales: (a) si el webhook WA de producción apunta a `/api/whatsapp/webhook/[token]` (entonces B-01 afecta solo al path nuevo, no al activo) — verificar config en consola del proveedor; (b) si AH maneja caja física diaria (decide A-13 entre MEDIA y NO-APLICA); (c) cobertura real del dominio kapso/zernio en downloader (F-05) — verificar contra cuentas reales al activar A-01.
