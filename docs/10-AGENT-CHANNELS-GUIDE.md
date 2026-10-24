# 10 · GUÍA DE CANALES DEL AGENTE — Telegram interno + WhatsApp/YCloud ventas

> Guía de operación para poner en marcha, probar y hacer rollback de los dos canales
> del agente IA de AH Sports OS: **Telegram** (canal interno para operadores) y
> **WhatsApp Business vía YCloud** (canal de ventas de cara al cliente).

## 0. Estado real: implementado vs. validado en vivo (leer primero)

Esta sección es la más importante de la guía. No la saltees.

- **Código de producto y schema de base de datos: IMPLEMENTADOS y verificados
  estáticamente.** La plataforma de agentes (runtime IA provider-neutral, webhook de
  Telegram, webhook de WhatsApp, envío por YCloud, persistencia canónica de mensajes,
  reconciliación/cron, RBAC y UI admin) está mergeada en `master`.
- **La verificación fue SOLO estática:** `typecheck` (`tsc --noEmit`), `lint` (0
  problemas nuevos sobre la línea base), `npm run check:agent-tools` (contrato de
  herramientas) y un `npm run build` de producción con `EXIT 0` (siempre que
  `DATABASE_URL` esté presente).
- **NO se ejecutó ninguna prueba end-to-end real contra Telegram ni YCloud.** No hay
  evidencia de que un mensaje real haya entrado por el webhook ni que una respuesta
  real haya salido por el Bot API o por YCloud.
- **La validación en vivo requiere, y todavía NO está autorizada ni hecha:**
  - cuenta de negocio real (bot de Telegram + cuenta de WhatsApp Business),
  - credenciales reales (bot token, app secret, verify token, API key de YCloud),
  - webhooks registrados en cada proveedor,
  - una URL **HTTPS pública** desplegada que el proveedor pueda alcanzar.

> Mientras falten esos cuatro puntos, todo lo que sigue es un **procedimiento**, no un
> resultado. Tratá la puesta en marcha como pendiente hasta correr el checklist de la
> sección 10 con evidencia real.

Relación con otros documentos:

- Arquitectura y decisiones → [`02-ARCHITECTURE.md`](./02-ARCHITECTURE.md) (ADR-19).
- Deploy + variables de entorno → [`07-DEPLOYMENT.md`](./07-DEPLOYMENT.md).
- Catálogo de rutas HTTP → [`03-API-ROUTES.md`](./03-API-ROUTES.md).

---

## 1. Prerrequisitos

Antes de tocar cualquier canal, el entorno debe estar en pie:

1. **App desplegada con HTTPS público.** Sin una URL pública los proveedores no pueden
   entregar webhooks. En esta guía, `<tu-dominio-publico>` representa esa URL base
   (por ejemplo la que expone Render). No inventes ni hardcodees un dominio: usá el
   que te devuelva el deploy real.
2. **Base de datos Neon migrada.** `npm run db:migrate` (idempotente). Las migraciones
   ya incluyen `agent_config`, `conversations`, `chat_messages`, `agent_memories`,
   `idempotency_keys` y `audit_events`.
3. **Usuario con rol `admin` o `gerencia`.** Toda la superficie del agente
   (`/admin/agent*`) está restringida a esos dos roles.
4. **Variables de entorno base presentes** (ver sección 2): `DATABASE_URL`,
   `SESSION_SECRET`, `SECRET_ENCRYPTION_KEY`.
5. **Bot de Telegram propio** creado con **@BotFather** (te da el bot token).
6. **Canal de WhatsApp Business con YCloud** contratado, más el número emisor
   (`WHATSAPP_PHONE_NUMBER`) y la API key de YCloud.
7. **Un scheduler externo** para el cron de reconciliación (Render Cron Job, cron del
   sistema, o cualquier disparador HTTP periódico). El repo **no** incluye scheduler.

---

## 2. Variables de entorno y secretos (SOLO POR NOMBRE)

> **Nunca escribas valores en documentación, tickets, commits ni logs.** Acá solo se
> listan los **nombres**. Los valores reales viven en el panel de entorno del deploy
> (Render) y jamás en el repo. En este repo el contrato base está en `.env.example`
> (sin valores) y en `src/lib/env.ts` (validación por Zod).

### 2.1 Base (obligatorias)

| Nombre | Para qué | Restricción |
|--------|----------|-------------|
| `DATABASE_URL` | Conexión a Neon Postgres. | Requerida por el build/runtime. |
| `SESSION_SECRET` | Firma de la cookie de sesión. | Mínimo 16 caracteres. Fijo entre deploys. |
| `SECRET_ENCRYPTION_KEY` | Clave maestra **AES-256-GCM** que cifra en reposo los secretos del agente. | Mínimo 16 caracteres. Si la cambiás, los secretos cifrados existentes dejan de descifrarse. |

### 2.2 Channel runtime del agente (runtime IA — provider-neutral)

El **proveedor, el modelo, el system prompt y las herramientas (enabledTools)** NO van
por env: viven en la fila singleton de `agent_config` (id = 1). Por env solo se resuelve
**credencial y endpoint**.

| Nombre | Para qué | Restricción |
|--------|----------|-------------|
| `AGENT_AI_API_KEY` | API key genérica del runtime IA. | Si el proveedor no tiene override específico. |
| `AGENT_AI_BASE_URL` | Base URL genérica; se le concatena el path. | Opcional si usás endpoint explícito. |
| `AGENT_AI_ENDPOINT_URL` | Endpoint explícito (tiene prioridad sobre base+path). | Opcional. |
| `AGENT_AI_ENDPOINT_PATH` | Path del protocolo. | Default `/chat/completions`. |
| `AGENT_AI_<PROVIDER>_API_KEY` | Override por proveedor. | `<PROVIDER>` en MAYÚSCULAS, no alfanuméricos → `_`. |
| `AGENT_AI_<PROVIDER>_BASE_URL` | Override por proveedor. | Idem normalización. |
| `AGENT_AI_<PROVIDER>_ENDPOINT_URL` | Override por proveedor. | Idem normalización. |

Ejemplo de normalización (solo nombres): un `provider` guardado como `open-router`
resuelve `AGENT_AI_OPEN_ROUTER_API_KEY`, `AGENT_AI_OPEN_ROUTER_BASE_URL`, etc.

### 2.3 WhatsApp (webhook de entrada — config-gated)

Ambas son **opcionales**; mientras falte alguna, el webhook de WhatsApp responde `503`
(`not_configured`) y no procesa nada.

| Nombre | Para qué | Restricción |
|--------|----------|-------------|
| `WHATSAPP_APP_SECRET` | Verifica la firma `X-Hub-Signature-256` del body del webhook. | Mínimo 16 caracteres. |
| `WHATSAPP_VERIFY_TOKEN` | Token del handshake de verificación de Meta. | Mínimo 16 caracteres. |

### 2.4 WhatsApp (envío de salida — YCloud, config-gated)

La ruta de envío está **separada y config-gated** por la API key + el número emisor.
Si falta cualquiera de las dos, **no se hace ninguna llamada HTTP** y el envío queda como
`not_configured` (el mensaje entrante igual se persiste y se responde en la DB, pero la
entrega se registra como `failed`, nunca como enviada).

| Nombre | Para qué | Restricción |
|--------|----------|-------------|
| `YCLOUD_API_KEY` | Autentica el envío en YCloud (header `X-API-Key`). | Mínimo 16 caracteres. |
| `WHATSAPP_PHONE_NUMBER` | Número emisor en YCloud. | Requerida junto con la API key. |
| `YCLOUD_BASE_URL` | Base URL de YCloud. | Opcional; default `https://api.ycloud.com`. |

### 2.5 Cron de reconciliación

| Nombre | Para qué | Restricción |
|--------|----------|-------------|
| `CRON_SECRET` | Autentica al disparador externo del cron. | Fallback: `AGENT_CRON_SECRET`. |

> ⚠️ **Gap conocido (documentado, no corregido acá):** `CRON_SECRET` /
> `AGENT_CRON_SECRET` se leen **directamente con `process.env`** en la ruta de
> reconciliación. **No** están en `src/lib/env.ts` ni en `.env.example`. Si querés el
> cron, agregá la variable en el deploy **y** conviene sumarla a `.env.example` en un
> cambio de código aparte.

---

## 3. Configuración en la UI admin

Todas las rutas de esta sección requieren rol `admin` o `gerencia`. Un usuario sin esos
roles es redirigido por `requireAgentAdmin()`.

### 3.1 `/admin/agent` — Configuración del agente

Es la pantalla central. Tiene dos bloques:

**Configuración del modelo**

| Campo | Qué es | Notas |
|-------|--------|-------|
| `provider` | Id de proveedor del catálogo (openai, deepseek, …) o id libre/"custom" (p. ej. `chat-completions`). | El registry mapea id de catálogo → protocolo → adapter. |
| `providerEndpointUrl` | Base/endpoint del proveedor de IA (se auto-completa desde el catálogo). | No es secreto; el runtime le concatena el path del protocolo. |
| `model` | Nombre del modelo que se pasa tal cual al proveedor. | No se mapea. |
| `systemPrompt` | System prompt del agente. | Si se deja vacío se usa el prompt por defecto del código. |
| `enabledTools` | Subconjunto de ids de herramientas habilitadas. | Solo se aceptan ids del registry cerrado. |

**Secretos (write-only)** — los valores **nunca** se muestran ni se devuelven. La UI solo
informa si el secreto está configurado (booleano). Reglas de envío:

- **Vacío** → conserva el valor almacenado.
- **Literal `CLEAR`** → borra el secreto guardado.
- **Cualquier otro valor** → se cifra (AES-256-GCM, formato `salt:iv:authTag:ciphertext`)
  y se guarda.

| Campo | Qué guarda |
|-------|------------|
| `botToken` | Bot token de Telegram (BotFather). |
| `providerKey` | API key del proveedor de IA. |
| `webhookSecret` | Secreto del webhook (de Telegram; de él se deriva el path token). |

**Operadores vinculados** — lista los vínculos de identidad (ver sección 4) y permite
crear uno nuevo con un formulario.

### 3.2 `/admin/agent/telegram` — Estado del canal Telegram

Pantalla de solo lectura. Muestra:

- Si el **bot token** y el **webhook secret** están configurados (badges).
- El **nombre del header de verificación**: `x-telegram-bot-api-secret-token`.
- El **path del webhook** (fingerprint no secreto): `/api/telegram/webhook/<token>`,
  donde `<token>` son los **primeros 32 hex** de `sha256(webhookSecret)`. Solo aparece
  cuando el webhook secret ya está guardado.

### 3.3 `/admin/agent/inbox` — Conversaciones

Listado **read-only** de todas las conversaciones (fact de DB). Permite **buscar** (por
hilo/cliente/canal) y **filtrar por canal** (`telegram`, `whatsapp`). Usa scroll
infinito (paginación por cursor, actividad más reciente primero).

### 3.4 `/admin/agent/inbox/[conversationId]` — Timeline

Timeline **read-only** de mensajes de una conversación, también paginado.

---

## 4. Usuarios autorizados de Telegram (canal interno)

El canal de Telegram es **interno**: solo operadores vinculados pueden usarlo.

1. El operador escribe al bot desde su cuenta de Telegram. Su id de transporte queda
   registrado.
2. Un `admin`/`gerencia` entra a `/admin/agent` → **Operadores vinculados** y crea el
   vínculo: **canal** (`telegram`) + **transport id** (el id de Telegram del operador) +
   **usuario** destino.
3. El vínculo se guarda en `agent_memories`, scope `operator`, clave
   `{channel}:{transportId}` (por ejemplo `telegram:123456789`).
4. Para que el operador quede autorizado, el usuario destino debe estar **activo** y
   tener rol **`admin`** o **`gerencia`**.

**Comportamiento cuando no está autorizado:** el bot responde un mensaje de denegación
(distinto según `unbound` / `inactive` / `unauthorized`) y **no** ejecuta el agente IA.

**Fallback determinístico:** si el runtime IA no está configurado (faltan
provider/model/endpoint/api key), el canal interno responde un set de comandos fijo en
vez de llamar al modelo:

| Comando | Respuesta |
|---------|-----------|
| `/start` | Verifica identidad y muestra la ayuda. |
| `/help` | Muestra los comandos disponibles. |
| `/whoami` | Muestra la identidad autorizada. |
| `/status` | Estado del agente operativo. |

Cualquier otro texto se trata como **dato no confiable** y se le pasa al agente IA
(cuando el runtime está configurado).

---

## 5. Webhook de Telegram: URL pública y configuración

### 5.1 Forma del endpoint

```
POST /api/telegram/webhook/<token>
```

- `<token>` = **primeros 32 caracteres hex** de `sha256(webhookSecret)`.
- Header obligatorio: `x-telegram-bot-api-secret-token` = el `webhookSecret` guardado en
  `agent_config`.
- El token del bot y el webhook secret se leen **descifrados** desde `agent_config`
  (id 1). La verificación es **constant-time** y ocurre **antes** de cualquier efecto
  secundario.

### 5.2 Registro del webhook

Con el bot token de BotFather (no lo pegues en logs), registrá el webhook apuntando a la
URL pública:

```
https://<tu-dominio-publico>/api/telegram/webhook/<token>
```

Usá el método `setWebhook` del Bot API pasando el `secret_token` = `webhookSecret`. El
valor exacto de la URL lo muestra `/admin/agent/telegram` una vez guardado el secreto.

### 5.3 Códigos de respuesta

| Código | Cuándo |
|--------|--------|
| `503` | El canal no está configurado (falta bot token o webhook secret). |
| `403` | Firma/secret no coincide. |
| `400` | Update inválido (no pasa el schema Zod). |
| `2xx` | Update procesado, duplicado o ignorado. |

> El endpoint responde `2xx` incluso para duplicados e ignorados, para que Telegram deje
> de reintentar. Un `update` de un bot (incluido el nuestro) o no-mensaje se ignora.

---

## 6. Webhook de WhatsApp: validación + configuración de envío

### 6.1 GET — handshake de verificación de Meta

```
GET /api/whatsapp/webhook/<token>?hub.mode=subscribe&hub.verify_token=<...>&hub.challenge=<...>
```

- `<token>` (path) = **primeros 32 hex** de `sha256(WHATSAPP_VERIFY_TOKEN)`.
- Condiciones simultáneas: `hub.mode=subscribe`, `hub.verify_token` **constant-time**
  contra `WHATSAPP_VERIFY_TOKEN`, y path token correcto.
- Si todo coincide, responde **ecoando `hub.challenge`** (text/plain). Si no, `403`.

### 6.2 POST — entrada real

```
POST /api/whatsapp/webhook/<token>
```

1. Si falta `WHATSAPP_APP_SECRET` o `WHATSAPP_VERIFY_TOKEN` → `503` (`not_configured`).
2. Verifica path token; si no coincide → `403`.
3. Verifica `X-Hub-Signature-256` (formato `sha256=<hex>`) calculado **HMAC-SHA256 sobre
   el body RAW** con `WHATSAPP_APP_SECRET`, en tiempo constante. Si falla → `403`.
4. Valida el payload con Zod. Si falla → `400`.
5. Importa:
   - **Ecos de operador** (`smb_message_echoes`) → `direction=outbound`,
     `sender_kind=operator`, `delivery_state=imported`. Son **observe-only**: se registran
     y **nunca** se re-enrutan por el agente IA.
   - **Inbound de cliente** → `sender_kind=customer`. Se persiste canónicamente.
6. Para cada inbound de cliente **nuevo** (no duplicado), corre el **loop IA** y envía la
   respuesta por YCloud.

### 6.3 Configuración del envío por YCloud

- La ruta de envío usa `YCLOUD_API_KEY` (header `X-API-Key`), `WHATSAPP_PHONE_NUMBER`
  (emisor) y `YCLOUD_BASE_URL` (default `https://api.ycloud.com`).
- Si falta API key o número → **`not_configured`**, sin llamada HTTP. El inbound se
  persiste y se responde internamente, pero la transición de entrega queda **`failed`**
  (no se finge `sent`).
- Al enviar con éxito, el estado de entrega del mensaje saliente pasa a `sent`.

---

## 7. Propiedad y persistencia de los mensajes

El modelo canónico evita ambigüedad sobre "quién dijo qué".

**`conversations`**

- Un hilo por `(channel, external_thread_id)` — `external_thread_id` es único por canal.
- `status` ∈ `open` / `closed`.

**`chat_messages`**

| Campo | Valores |
|-------|---------|
| `channel` | `telegram` \| `whatsapp` |
| `direction` | `inbound` \| `outbound` |
| `sender_kind` | `customer` \| `agent` \| `operator` |
| `content_type` | `text` \| `image` \| `document` \| `system` |
| `delivery_state` | `received` \| `queued` \| `sent` \| `failed` \| `imported` |
| `platform_message_id` | Ancla de idempotencia, único por canal. |

**Quién es quién por canal**

| Origen | `channel` | `direction` | `sender_kind` | `delivery_state` típico |
|--------|-----------|-------------|---------------|--------------------------|
| Operador por Telegram (interno) | `telegram` | `inbound` | `operator` | `received` |
| Cliente por WhatsApp (ventas) | `whatsapp` | `inbound` | `customer` | `received` |
| Respuesta del agente IA | ambos | `outbound` | `agent` | `queued` → `sent`/`failed` |
| Eco de operador en WhatsApp | `whatsapp` | `outbound` | `operator` | `imported` |

**Idempotencia:** cada mensaje se persiste una sola vez, anclado a
`(channel, platform_message_id)` — en Telegram el id se compone `${chatId}:${messageId}`
(el `message_id` solo es único por chat). Un reenvío duplicado del proveedor resuelve a
`2xx` **sin** generar un nuevo mensaje ni una segunda respuesta.

**Orden de operaciones:** la respuesta del agente se **persiste antes de enviarse**. Si
el envío falla, el hecho outbound queda igual registrado (con `failed`) y un reintento es
seguro.

---

## 8. Job de reconciliación / cron

No hay scheduler incluido. El operador debe conectar un scheduler externo.

### 8.1 Endpoint

```
GET|POST /api/agent/reconcile?batchSize=<1..500>
```

- `batchSize` opcional, entero 1–500, default **100**.
- **Autenticación (constant-time):**
  - header `x-cron-secret` (o `Authorization: Bearer <secreto>`) contra
    `CRON_SECRET` (fallback `AGENT_CRON_SECRET`), **o**
  - una sesión autenticada de `admin`/`gerencia`.
- La ruta **nunca** queda abierta: sin auth responde `401`/`403` antes de trabajar.

### 8.2 Qué hace cada corrida (todas idempotentes)

1. Purga `idempotency_keys` expiradas.
2. Borra `agent_memories` expiradas.
3. Limpia `raw_payload` (PII) de mensajes con más de **90 días**.
4. Re-entrega outbound de **Telegram** en estado `failed` (claim condicional
   `failed → queued`, así corridas solapadas no envían dos veces).
5. Marca inbound **sin respuesta** (ventana de **7 días**, dedupe de 1 día por
   conversación) con un evento de auditoría.

Cada paso escribe filas **insert-only** en `audit_events`. Una corrida con error audita
`agent.reconcile.failed` y responde con error; nunca pretende éxito.

> Ningún paso finaliza un pedido, cobra un pago ni avanza producción.

---

## 9. Permisos y seguridad

- **RBAC del agente:** roles `admin` / `gerencia`. `requireAgentAdmin()` redirige a los
  no autorizados (componentes/acciones de servidor); `authorizeAgentApi()` devuelve
  `401`/`403` (route handlers).
- **Secretos cifrados en reposo:** AES-256-GCM con `SECRET_ENCRYPTION_KEY`. Son
  **write-only**: nunca se devuelven a la UI ni se loguean. La UI solo muestra
  "configurado / sin configurar".
- **Verificación antes de efectos:** los webhooks verifican firma/secreto en tiempo
  constante **antes** de cualquier efecto secundario.
- **Cron nunca abierto:** siempre exige secreto o sesión admin.
- **Herramientas draft-only:** las únicas effects ejecutables son `read` y `draft`
  (`AGENT_TOOL_EFFECTS = ['read','draft']`). Las herramientas `draft` solo escriben
  `orders.status = 'borrador'` (con `requiresHumanConfirmation`). El agente **nunca**
  aprueba, cobra ni avanza producción.

### Herramientas disponibles (9 en total)

**Lectura (6):** `getConversation`, `findMissingInfo`, `salesPerformance`, `lookupOrder`,
`lookupCustomer`, `quotePreview`.

**Borrador (3):** `draftLead`, `draftQuote`, `draftOrder`.

---

## 10. Checklist de pruebas (mensajes reales)

> Requiere el entorno en vivo de la sección 0. Marcá cada ítem con **evidencia real**
> (captura, id de mensaje en `chat_messages`, respuesta HTTP).

### 10.1 Pre-vuelo (sin proveedor)

- [ ] `npm run typecheck` → EXIT 0.
- [ ] `npm run build` (con `DATABASE_URL`) → EXIT 0.
- [ ] `npm run check:agent-tools` → contrato de herramientas OK.
- [ ] `/admin/agent` carga y guarda provider/model/prompt/tools.
- [ ] Guardar un secreto y verificar que **no** se muestra; `CLEAR` lo borra.
- [ ] Con rol no autorizado, `/admin/agent` redirige; `/api/agent/reconcile` sin secreto
      devuelve `401`/`403`.

### 10.2 Telegram (canal interno)

- [ ] Con el canal **no** configurado: `POST /api/telegram/webhook/<cualquier>` → `503`.
- [ ] Con secreto incorrecto o header ausente → `403`.
- [ ] Body inválido → `400`.
- [ ] Guardar bot token + webhook secret y registrar el webhook en BotFather
      (`setWebhook` con `secret_token`).
- [ ] **Sin** vínculo: el operador manda `hola` → recibe denegación ("no vinculada").
- [ ] Vincular el transport id del operador a un usuario activo `admin`/`gerencia`.
- [ ] Enviar `/start` → responde la identidad autorizada + ayuda.
- [ ] Enviar `/whoami` → muestra identidad y rol autorizados.
- [ ] Enviar `/status` → responde estado del agente operativo.
- [ ] Enviar `/help` → lista de comandos.
- [ ] (Runtime IA configurado) Enviar una consulta real, p. ej.
      `¿Qué pedidos están bloqueados?` → respuesta del agente y una fila `agent`
      outbound en `chat_messages`.
- [ ] (Runtime IA configurado) Pedir un borrador, p. ej.
      `Generá un borrador de cotización para 20 remeras` → el agente puede crear un
      `orders.status='borrador'` y aclara que **requiere confirmación humana**.
- [ ] Reenviar el mismo `update` (mismo `update_id`/mensaje) → `2xx`, **sin** segundo
      mensaje ni segunda respuesta.

### 10.3 WhatsApp (canal de ventas)

- [ ] Con `WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN` ausentes: `GET` y `POST` → `503`.
- [ ] `GET` handshake con `hub.mode=subscribe` + `hub.verify_token` correcto + path
      correcto → eco de `hub.challenge`.
- [ ] `GET` con verify token incorrecto → `403`.
- [ ] `POST` con firma `X-Hub-Signature-256` inválida → `403`.
- [ ] `POST` con payload inválido → `400`.
- [ ] Registrar el webhook en Meta/YCloud con el **verify token** y el
      **app secret**.
- [ ] Enviar un mensaje real de cliente, p. ej.
      `Hola, quiero cotizar 20 camisetas para un club` → se persiste
      `channel=whatsapp, sender_kind=customer` y el loop IA responde.
- [ ] (Con `YCLOUD_API_KEY` + `WHATSAPP_PHONE_NUMBER`) la respuesta sale por YCloud y el
      mensaje pasa a `delivery_state=sent`.
- [ ] (Sin YCloud configurado) la respuesta se persiste pero la entrega queda `failed`
      (no se finge `sent`).
- [ ] Enviar un mensaje desde la app de WhatsApp Business del número → se importa como
      `sender_kind=operator, direction=outbound, delivery_state=imported` y **no** se
      re-enruta.
- [ ] Duplicar el mismo `platform_message_id` → no se responde dos veces.

### 10.4 Reconciliación

- [ ] `GET /api/agent/reconcile` con `x-cron-secret` correcto → `200` con `summary`.
- [ ] `Authorization: Bearer <secreto>` también autoriza.
- [ ] Sin secreto y sin sesión → `401`/`403`.
- [ ] `?batchSize=0` o `501` → `400`.
- [ ] Con una sesión `admin`/`gerencia` también corre.

---

## 11. Troubleshooting

| Síntoma | Causa probable | Qué revisar |
|---------|----------------|-------------|
| Telegram `503 not_configured` | Falta bot token o webhook secret en `agent_config`. | `/admin/agent` → guardar ambos; ver `/admin/agent/telegram`. |
| Telegram `403 forbidden` | Header `x-telegram-bot-api-secret-token` o path token no coinciden. | Reconfirmar `webhookSecret` y re-registrar el webhook con el `secret_token` correcto. |
| El operador recibe denegación | No está vinculado, está inactivo o su rol no es `admin`/`gerencia`. | Vincular en `/admin/agent` → Operadores vinculados; verificar usuario activo y rol. |
| WhatsApp `503 not_configured` | Falta `WHATSAPP_APP_SECRET` o `WHATSAPP_VERIFY_TOKEN`. | Setear ambas en el entorno del deploy. |
| WhatsApp `403` en `POST` | Firma `X-Hub-Signature-256` no coincide. | Verificar que el `WHATSAPP_APP_SECRET` sea el de esa app y que el body no se modifique antes de firmar. |
| El cliente no recibe respuesta | Falta `YCLOUD_API_KEY` o `WHATSAPP_PHONE_NUMBER`. | Configurar YCloud; mientras falte, la entrega queda `failed` (esperado). |
| El agente responde el set de comandos fijo | Runtime IA no configurado (falta provider/model/endpoint/api key). | Completar `agent_config` + env de IA. |
| `npm run build` falla | `DATABASE_URL` ausente (limitación ambiental pre-existente). | Proveer `DATABASE_URL` real. |
| El cron devuelve `401` | `CRON_SECRET` sin setear o header mal. | Setear `CRON_SECRET` (o `AGENT_CRON_SECRET`) y enviar `x-cron-secret`. |

---

## 12. Rollback

Para desactivar un canal sin tocar código:

1. **Telegram:** en `/admin/agent` enviá `CLEAR` en `webhookSecret` (y/o `botToken`).
   El webhook pasa a `503` y el canal queda inerte. Opcionalmente, borrá el webhook en
   BotFather (`deleteWebhook`).
2. **WhatsApp entrante:** quitá `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` del
   entorno. El webhook pasa a `503`. Opcionalmente, desregistrá el webhook en Meta.
3. **WhatsApp saliente:** quitá `YCLOUD_API_KEY` (y/o `WHATSAPP_PHONE_NUMBER`). Todo envío
   queda `not_configured` (sin llamada HTTP).
4. **Cron:** apagá el scheduler externo y/o rotá `CRON_SECRET` para invalidar al caller.

> El rollback **no borra** los datos: las conversaciones y mensajes ya persisten en la
> DB. Si necesitás purga de datos, es una operación aparte y destructiva.

---

## 13. Datos y privacidad

- **Secretos:** cifrados en reposo (AES-256-GCM), write-only, nunca logueados ni
  devueltos. Rotar `SECRET_ENCRYPTION_KEY` invalida los secretos cifrados existentes
  (hay que re-guardarlos).
- **PII en payloads:** los `raw_payload` de los proveedores pueden contener datos
  personales. La reconciliación los limpia pasados **90 días**.
- **Retención de memorias:** `agent_memories` expiradas se borran en la reconciliación.
- **Auditoría:** `audit_events` es insert-only; registra cada acción relevante del
  intake y de la reconciliación sin exponer secretos.
- **Contenido no confiable:** el texto entrante del cliente/operador se trata como dato,
  nunca se interpola en SQL ni shell.
- **Draft-only:** el agente no aprueba pedidos, no cobra ni avanza producción; solo deja
  borradores reversibles con confirmación humana obligatoria.
