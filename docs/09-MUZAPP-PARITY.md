# Muzapp → AH Sports OS — Parity Explore (Telegram + WhatsApp)

> Explore READ-ONLY (sin cambios de código, sin migraciones, sin deploy).
> Fuente de Muzapp: `C:/Users/Asus/Documents/estabilizacion/Mrs Muzzarella/muzapp`.
> Target AH Sports: `C:/Users/Asus/Documents/estabilizacion/ah sports/App de gestion` (master `700994a`).

## Verdict

**NO está replicado exactamente.** Se replicó la *arquitectura base* (canales + persistencia + runtime IA
provider-neutral + tools + admin + jobs) pero NO el *funcionamiento real* de comunicación de Muzapp. Faltan
piezas críticas de integración, sobre todo en WhatsApp (es solo import/observe) y el cableado del loop IA.

## Qué se incorporó en App de gestión (P0–P7, ya mergeado)

| Área | Qué hay |
|---|---|
| Fundación (P0) | migración 0010 (8 tablas de agente), secret-box AES-256-GCM, RBAC admin/gerencia, env Zod |
| Canales (P1) | `intake` transaccional + idempotencia (unique channel+platform_message_id), webhook Telegram con verify constante, persistencia inbound/outbound/operator |
| Runtime IA (P2) | `ai/provider·config·registry` (provider-neutral, no hardcodea vendor/modelo), `agents/loop` (bounded, untrusted), system-prompt AH (prendas/BOM/talles/seña), 6 tools lectura |
| Tools draft (P3) | draftLead/draftQuote/draftOrder (solo borrador, confirmación humana), guard `read|draft` |
| Admin (P4) | `/admin/agent` (config write-only), `/admin/agent/inbox` + `[conversationId]`, nav, bind operator |
| Jobs (P5) | `/api/agent/reconcile` (cron: purge idempotency, retry failed, retention, inbound-without-reply) |
| WhatsApp (P6) | import observe-only (firma X-Hub-Signature-256, normalizador, webhook config-gated) |
| Hardening (P7) | sentinel prompt-injection, fuga error.message, auditsWritten, ADR + API routes |

## Comparación de variables de entorno

| Concepto | Muzapp | AH Sports (actual) |
|---|---|---|
| Token Telegram | `TELEGRAM_BOT_TOKEN` (BotFather) | **DB** `agent_config.botTokenEnc` (encriptado), NO env |
| Secreto webhook Telegram | `TELEGRAM_WEBHOOK_TOKEN` (en URL) | **DB** `agent_config.webhookSecretEnc` |
| Allowlist Telegram | `TELEGRAM_ALLOWED_CHAT_IDS` (env, empty=nadie) | `agent_memories` scope `operator` (bind por admin), rol admin/gerencia |
| Notif Telegram | `TELEGRAM_LICHAS_CHAT_ID` | (no existe) |
| WhatsApp | `YCLOUD_API_KEY` + `YCLOUD_WEBHOOK_SECRET` + `WHATSAPP_PHONE_NUMBER` (YCloud, 2 vías) | `WHATSAPP_APP_SECRET` + `WHATSAPP_VERIFY_TOKEN` (env, solo import) |
| AI | `OPENAI_API_KEY` + `OPENAI_BASE_URL` + `AI_MODEL` / `AI_MODEL_FAST` / `AI_MODEL_VISION` | `AGENT_AI_API_KEY/BASE_URL/ENDPOINT_URL` + DB `agent_config.provider/model` |
| Cron | `CRON_SECRET` | `CRON_SECRET`/`AGENT_CRON_SECRET` |

## Comparación funcional (canales)

| | Muzapp | AH Sports |
|---|---|---|
| Telegram | bot interno full (AI `AI_MODEL_FAST`), webhook, allowlist por chat id | bot webhook OK, pero responde **comandos determinísticos** (`/start /help /whoami /status`), **sin IA** |
| WhatsApp | 2 vías vía YCloud (recibe + envía, agente de ventas `AI_MODEL`) | **import/observe only**: persiste ecos de operador, NO envía, NO importa inbound de cliente |
| AI | cableada a ambos canales (ventas en WA, interno en TG) | loop IA es **librería NO cableada** (P5.4 diferido) |

## Modelo de datos de mensajes

| | Muzapp | AH Sports |
|---|---|---|
| Almacén | `conversations.messages` = **JSONB array** (todos los mensajes en una fila) | tabla `chat_messages` (1 fila por mensaje, `unique(channel,platform_message_id)`) |
| Lectura detalle | carga TODO el array de una | `.orderBy(asc createdAt).limit(500)` — carga los 500 más viejos, **sin paginación** |

> Nota clave: Muzapp NO hace scroll infinito (carga todo en JSONB). El requerimiento del usuario ("no cargar
> todos, mostrar lo último, cargar más al deslizar") es MÁS avanzado que Muzapp. El modelo de AH Sports
> (tabla separada) es el que SÍ lo permite (cursor/offset).

## UI de conversaciones

| | Muzapp | AH Sports |
|---|---|---|
| Lista | `/admin/conversations` (+ tabla con filtros) | `/admin/agent/inbox` (limit 200 + filtro JS) |
| Detalle | `/admin/conversations/[id]` (back-link, header, mensajes) | `/admin/agent/inbox/[conversationId]` (timeline con provenance) |
| Scroll infinito | NO (carga JSONB entero) | NO (limit 500 asc) |

## Qué falta para replicar el funcionamiento real de Muzapp

1. **Cablear el loop IA** al router de canales (`runAgentLoop` + `resolveAgentRuntime` + `enabledTools` en
   `src/lib/channels/router.ts`) — hoy responde solo comandos.
2. **WhatsApp 2 vías**: agregar send path + importar inbound de cliente (hoy observe-only).
3. **Allowlist Telegram** equivalente a `TELEGRAM_ALLOWED_CHAT_IDS` (hoy es bind operator por admin).
4. **Scroll infinito en el historial**: mostrar lo último primero, cargar más al deslizar (cursor/offset sobre
   `chat_messages`), reemplazar `limit(500)` y el filtro JS del inbox.
5. **Cron followup** (Muzapp tiene `/api/cron/followup`; AH Sports solo `reconcile`).
6. **Mensajes correctos en DB + UI** (provenance ya está; falta orden desc + paginación).
