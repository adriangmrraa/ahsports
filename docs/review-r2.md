# Review R2 — Outbound: notificaciones, ventana 24h, handoff, cron

> **Tipo**: revisión read-only (sin cambios de código, sin escrituras a DB, sin lectura de `.env`).
> **Baseline**: `master` @ `4d01e5e` (merge de los 9 packs de paridad).
> **Referencia**: `C:/Users/Asus/Documents/FORMOSA.DEV/SocialCRM` (solo lectura).
> **Fecha**: 2026-10-23.
> **Método**: lectura del working tree + `git diff 2a665c7..8398ba0` para aislar lo que aportó W5. Cites `archivo:línea` en cada hallazgo.

---

## 1. Hallazgos

| # | SEV | Área | Archivo:línea | Problema | Por qué rompe | Fix sugerido |
|---|-----|------|---------------|----------|---------------|--------------|
| F1 | **ALTA** | Order-status → gate del agente | `src/lib/whatsapp/order-status-notify.ts:137` + `src/lib/messaging/inbound-pipeline.ts:165-183`, `:756`, `:917` | La notificación automática de estado se persiste con `senderKind: "operator"`. | `hasRecentOperatorMessage` considera "humano tomó el hilo" a **cualquier** outbound `operator` de las últimas 2h (`:111`) y corta el turno antes del dispatcher. Resultado: **después de cada aviso de estado el agente de ventas queda mudo hasta 2h** para ese cliente, aunque el aviso lo mandó el sistema. El test `inbound-pipeline.test.ts:223` prueba que el gate está vivo. | Persistir el aviso como `senderKind: "agent"` (el enum solo tiene `customer`, `agent`, `operator`, `schema.ts:83`) con `senderRef: "order-status-notify"`; o excluir por `senderRef` en el gate. |
| F2 | **ALTA** | Ventana 24h | `src/lib/whatsapp/sales-agent.ts:192` + `src/lib/whatsapp/outbound-window.ts:38-54,108-121` + `src/lib/channels/operator-send.ts:123-141` + `src/lib/whatsapp/order-status-notify.ts:114-126` | El gate de 24h está cableado **solo donde no puede dispararse**, y falta donde sí importa (respuesta del operador y avisos de estado). | El único caller es `deliverAgentReply`, que corre segundos después de persistir el inbound que disparó el turno (`inbound-pipeline.ts:658`) → el último inbound del cliente es reciente y `isCustomerWindowOpen` da `true` siempre en el camino vivo (solo un job replayed >24h por el drain podría caer en template). Además, cuando sí cayera, **se envía solo el template pelado y se descarta el texto real del agente** (`sales-agent.ts:196-235`: el `content` se persiste pero no se manda). En cambio, la respuesta del operador y el aviso de estado mandan texto libre sin consultar la ventana; fuera de 24h Meta/YCloud los rechaza con 4xx y `retryable: false` (`ycloud.ts:536-542`) → el operador ve un error genérico y el cliente no recibe nada. | Gatear ambos caminos nuevos con `decideCustomerWindowSend` (por `conversationId` en el operador; resolviendo la conversación en notify) y usar `messenger.sendTemplate` con `components` cuando esté cerrada. Como mínimo, mapear el 4xx de ventana a un error explícito `window_closed` para que la UI indique "usá plantilla". |
| F3 | **ALTA** | Cron reconcile — lock | `src/lib/reconcile/runner.ts:26-29,93-103,126,217` | El lock de corrida **nunca expira** aunque declare TTL. | `claimRunLock` inserta `expiresAt = now+15min` y usa `onConflictDoNothing`; nadie borra el lock vencido en este runner. Si el proceso muere a mitad de corrida (deploy/restart/timeout), el `finally` de `:217` no corre y **todas** las corridas siguientes responden `already_running` para siempre (HTTP 200 `ok:true`). El único purge (`src/lib/agents/reconcile.ts:109-121`) pertenece a `/api/agent/reconcile`, otro endpoint no agendado. | Tratar un lock vencido como reclamable: `delete ... where key=? and expires_at < now()` y luego insertar, o `onConflictDoUpdate` condicional sobre `expiresAt < now`. |
| F4 | MEDIA | Order-status en zernio | `src/lib/whatsapp/order-status-notify.ts:114-126` vs `src/lib/channels/operator-send.ts:120-121,129` + `src/lib/messaging/providers/zernio.ts:622-642` | El aviso de estado no pasa `providerConversationId`; el reply del operador sí. | zernio documenta "sin `providerConversationId` → abre una conversación nueva con `participantId = to`" (`zernio.ts:42-44,635-642`). En una cuenta WhatsApp sobre zernio el aviso **abre un hilo nuevo** en el proveedor en vez de responder al hilo vinculado; si la identidad es BSUID-only, además se parte la conversación en AH (el teléfono de respaldo key-ea `external_thread_id` distinto del BSUID). | Resolver la conversación vinculada por contacto/identidad, reutilizar `loadProviderThreadId` y pasar `providerConversationId` en `OutboundMessage`. |
| F5 | MEDIA | Handoff resolve | `src/app/actions/inbox.ts:153-199` + `src/lib/messaging/inbound-pipeline.ts:756` | "Devolver al agente" / "Marcar resuelto" borran el marker de 24h, pero **no** el mute de 2h por mensaje de operador. | `deactivateHumanOverride` (`inbox.ts:168,195`) solo borra la memoria `whatsapp-handoff:<conv>`; el gate que realmente corta el turno es `hasRecentOperatorMessage` (independiente del marker) y se alimenta del reply del propio operador (`operator-send.ts:176-186`). La UI promete "el agente reanuda en el próximo inbound" (`HandoffControls.tsx:18-20`), pero tras responder, el agente sigue callado hasta 2h. | Al resolver/devolver, registrar un boundary (`handoff.resolvedAt`) y que el gate solo cuente filas `operator` posteriores a ese boundary; o unificar el gate con el mismo marker/sesión. |
| F6 | BAJA | Stage route | `src/app/api/orders/[id]/stage/route.ts:41-58` + `src/lib/whatsapp/order-status-notify.ts:113` | Se notifica **siempre**, incluso si la etapa no cambió, y la idempotency key es `randomUUID()`. | Un POST repetido (retry de red, doble submit, o llamada a la API con la etapa actual) manda un mensaje duplicado al cliente y duplica la fila en el timeline. El Kanban filtra el mismo estado solo del lado cliente (`KanbanBoard.tsx:41`), no en el endpoint. | Guardar `if (order.status !== parsed.data.stage)` antes de notificar y derivar la key de `orderId+status+updatedAt` (o de un `lastNotifiedStatus` persistido). |
| F7 | BAJA | YCloud error mapping | `src/lib/messaging/providers/ycloud.ts:536-542` | YCloud clasifica **429 como no retryable**; kapso y zernio lo tratan como retryable. | `retryable: status >= 500` → un throttle transitorio del proveedor se trata como permanente; el aviso de estado solo queda en `console.warn` y el operador ve "no se pudo enviar por este canal". Inconsistente con `kapso.ts:508-514` y `zernio.ts:417-424`. | `retryable: status === 429 || status >= 500` (y mismo criterio en `legacySend`). |
| F8 | BAJA | Resolución de identidad | `src/lib/whatsapp/order-status-notify.ts:187-196` | `lead_identities ... limit(1)` sin `ORDER BY`. | Un contacto con más de una identidad WhatsApp (teléfono + BSUID, o dos números) resuelve una fila arbitraria: el aviso puede ir al número equivocado. | `ORDER BY created_at DESC` y preferir la identidad phone-shaped (o la que matchee la conversación vinculada). |
| F9 | BAJA | Reconcile métricas | `src/lib/reconcile/runner.ts:152-155` vs `:187` | El `continue` de "sin mensajes nuevos" saltea `base.scanned += 1`. | El resumen del cron (única observabilidad) subcuenta conversaciones y el mensaje a operadores dice "revisadas" de menos. | Incrementar `scanned` antes del `continue`. |
| F10 | BAJA | Reconcile error status | `src/lib/reconcile/runner.ts:199-215` + `src/app/api/cron/reconcile/route.ts:45-66` | Un fallo total (DB caída después del claim, scan que lanza) se devuelve como `status: "completed"` y HTTP 200 `ok:true`. | El scheduler/alerta no puede distinguir éxito de fallo; solo queda `errors: N`. | En el catch devolver `status: "failed"` (y/o 500 desde la ruta) cuando no se escaneó nada. |
| F11 | BAJA | Deploy del cron | `render.yaml` (sin `cron`), `docs/07-DEPLOYMENT.md:53-57` | No hay scheduler configurado para `/api/cron/reconcile`. | A-06 pedía "scheduler + endpoint"; W5 entregó solo el endpoint. Hasta que alguien cree el job en Render, el cron nunca corre (y F3 lo deja muerto si una corrida se corta). | Documentar/crear el Render Cron Job (POST + `Authorization: Bearer $CRON_SECRET`) o el `vercel.json` equivalente. |

---

## 2. Cadenas de evidencia (los tres altos)

**F1 — el aviso automático silencia al agente**

1. `sendOrderStatusNotification` persiste con `direction: "outbound"`, `senderKind: "operator"` (`order-status-notify.ts:136-138`).
2. `hasRecentOperatorMessage` matchea `direction=outbound AND sender_kind=operator AND created_at > now-2h` (`inbound-pipeline.ts:165-183`; TTL en `:111`).
3. El gate corre antes de encolar el turno (`:756`) y también en el drain durable (`:917`).
4. El test existente demuestra el comportamiento (`inbound-pipeline.test.ts:223-244`). Con un aviso de estado reciente, el cliente escribe y **el turno se descarta**.

**F2 — la ventana 24h no protege ningún envío real**

1. Único caller: `deliverAgentReply` (`sales-agent.ts:192`), invocado después de persistir el inbound del turno.
2. `lastCustomerInboundAt` lee el último `inbound/customer` (`outbound-window.ts:38-54`) → reciente → ventana abierta.
3. La respuesta del operador (`operator-send.ts:123-141`) y el aviso de estado (`order-status-notify.ts:114-126`) no consultan la ventana.
4. Fuera de 24h el proveedor rechaza el texto libre (regla Meta; `zernio.ts:44-47` lo documenta como `TEMPLATE_REQUIRED`) y YCloud lo devuelve como 4xx no retryable (`ycloud.ts:536-542`).

**F3 — el cron de reconcile se auto-bloquea**

1. `claimRunLock` inserta `key = "reconcile:candidates:lock"` con `expiresAt = +15min` (`runner.ts:26-29,93-98`).
2. `onConflictDoNothing` no evalúa `expiresAt`: una fila vencida sigue bloqueando.
3. El `finally` que borra (`:217`) no corre si el proceso es matado (deploy/OOM/timeout).
4. Resultado permanente: `{ ok: true, status: "already_running" }` en cada corrida.

---

## 3. Verificado OK

- **Los 4 call-sites de estado realmente envían**: `orders.ts:224-234` (solo si `nextStatus !== order.status`), `payments.ts:37-39` y `:80-82` (solo si `statusChanged`), `tools-orders.ts:450` (transición validada por `planOrderTransition`, `:420-421`), `stage/route.ts:53-58` (sin guard, ver F6). Todos best-effort: un fallo de envío no revierte la escritura.
- **Resolución order → contacto → teléfono** correcta, con guarda para identidades BSUID-only (`order-status-notify.ts:204-214`) y fallback a `contacts.phone`.
- **Persistencia canónica honesta**: el aviso se persiste `sent`/`failed` según el resultado real (`order-status-notify.ts:128-144`); no hay "delivery fantasma".
- **`decideSendAccount` fail-closed** (bound → su cuenta; unbound → exactamente una activa; ambiguo → drop; error transitorio → retry) en notify y en operator-send.
- **Ventana calculada desde el último inbound del cliente** (`direction=inbound AND sender_kind=customer`, `outbound-window.ts:38-53`) — el criterio es el correcto; el problema es dónde se usa (F2).
- **`ycloud.sendTemplate`**: payload Meta-shaped (`template.name` + `language.code/policy` + `components` opcional) sobre `sendDirectly`, con `externalId` para reconciliación (`ycloud.ts:671-694,811-823`); valida nombre/lenguaje antes de llamar y falla cerrado si la cuenta real no tiene apiKey. Sin secretos en logs.
- **Operator reply**: persiste **antes** de enviar (`queued` → `sent`/`failed`), resuelve zernio por `providerConversationId` (`operator-send.ts:58-67,120-129`), rutea telegram por el bot interno, dropea `account_provider_mismatch`, y falla limpio en `channel_unsupported` (`:148-155`).
- **Cross-check pedido**: el reply del operador **sí** satisface `hasRecentOperatorMessage` (fila `outbound` + `senderKind "operator"`, `operator-send.ts:176-186` ↔ `inbound-pipeline.ts:165-183`). Es el mismo gate que genera F1/F5.
- **Override = mismo flag**: `toggleHumanOverride` usa `activateHumanOverride`/`deactivateHumanOverride` (misma memoria `scope="customer"`, key `whatsapp-handoff:<conv>`, TTL 24h) que `transferToHuman` (`human-handoff.ts:229-256`, `sales-tools.ts:1168`, `inbox.ts:166`). `resolveHandoff` borra exactamente ese marker (`inbox.ts:195`).
- **RBAC + Zod** en todas las entradas del inbox (`inbox.ts:13,16-96`); auditoría de cada acción de handoff (`:112-127`).
- **Cron auth**: `Authorization: Bearer`, comparación `timingSafeEqual` con chequeo de longitud, secreto vacío falla cerrado, `?key=` solo con `CRON_ALLOW_QUERY_KEY=1`, rate-limit por IP **antes** del compare (`cron/auth.ts:28-79`).
- **Cron solo reporta agregados**: la ruta devuelve `status/scanned/candidatesCreated/errors/ranAt/correlationId`, nunca ids ni contenido (`route.ts:58-67`); el runner es candidates-only y las tools son solo lectores + `reportReconcileCandidate` (`reconcile/tools.ts:75-88`).
- **W5 en `runner.ts` fue solo plumbing** de `minNewMessages` (`git diff 2a665c7..8398ba0 -- src/lib/reconcile/runner.ts`): no tocó lock, scan ni escrituras.
- **A-05 (follow-up post-entrega) NO existe**: grep de `followup`, `follow-up`, `follow_up` en `src/` solo devuelve comentarios ajenos; no hay ruta `/api/cron/followup` ni lib.
- **Reconcile no escribe estado de dominio**: candidatos van a `agent_memories` (`key: reconcile:candidate:*`), watermark y auditoría. Nada de pedidos/pagos/contactos.

---

## 4. Límites de esta revisión

- No se corrieron `typecheck`/`build`/tests: `node_modules` no está instalado en este checkout (`npx tsc` falla con "This is not the tsc command"). No es parte del gate de esta review, pero conviene correrlos antes de aplicar fixes.
- No se inspeccionó el payload real de la API de YCloud contra su doc en vivo; el shape se validó contra el contrato congelado y el evidence doc del repo de referencia. Queda como punto a confirmar con una plantilla aprobada real.

---

## 5. Estado para Engram (`parity/review-r2`)

```
review-r2 outbound: 11 hallazgos (3 ALTA: F1 aviso order-status persiste como operator y mutea al agente 2h; F2 ventana 24h cableada solo en el agente y ausente en operator/notify; F3 lock de reconcile nunca expira y deja el cron en already_running para siempre).
Sin cambios de código (read-only). Baseline 4d01e5e. Detalle en docs/review-r2.md.
Siguiente: aplicar fix de F1/F2/F3 primero; F4-F5 después; F6-F11 son endurecimiento.
```
