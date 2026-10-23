import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, leadIdentities, orders } from "@/db/schema";
import { decideSendAccount } from "@/lib/channels/send-account";
import { persistCanonicalMessage } from "@/lib/channels/intake";
import { normalizePhone } from "@/lib/channels/phone";
import { messenger } from "@/lib/messaging/messenger";
import type { ChannelAccount as MessagingChannelAccount } from "@/lib/messaging/types";

/**
 * Order-status notification transport — port of SocialCRM
 * `src/lib/whatsapp/order-status-notify.ts`, adapted to AH Sports:
 *
 * - the order's contact phone is resolved through the WhatsApp lead identity
 *   (`lead_identities`) and falls back to `contacts.phone`;
 * - the sending account comes from the same fail-closed decision used by every
 *   other outbound path (`decideSendAccount`): bound conversation → its
 *   account, unbound → exactly one active account, ambiguous/missing → drop;
 * - every attempted send persists a canonical outbound fact through
 *   `persistCanonicalMessage`, sent or failed — the conversation timeline and
 *   delivery state must never claim a delivery that did not happen.
 *
 * Notifications are best-effort side effects: a customer who cannot be
 * reached never blocks the status transition itself.
 */

export type OrderStatusNotifyResult =
  | {
      ok: true;
      providerMessageId?: string;
      conversationId?: string;
      channelAccountId: string | null;
      persisted: boolean;
    }
  | { ok: false; error: string; retryable: boolean };

/**
 * Customer-facing status wording (es-AR, short). Only statuses with a
 * meaningful customer message return a string; the rest are internal states.
 * Payment wording stays truthful: it describes the stored status, never
 * claims a payment was verified or credited.
 */
export function buildOrderStatusMessage(
  status: string,
  orderNumber: number,
): string | null {
  const tag = `Pedido #${orderNumber}`;
  switch (status) {
    case "presupuesto_enviado":
      return `📄 ${tag}: te enviamos el presupuesto. Cualquier duda, escribinos por acá.`;
    case "aprobado":
      return `✅ ${tag}: quedó aprobado. Coordinamos los próximos pasos con vos.`;
    case "seniado":
      return `🧵 ${tag}: quedó registrada la seña y ya entra en la fila de producción.`;
    case "en_produccion":
      return `🏭 ${tag}: ya entró a producción.`;
    case "corte":
      return `✂️ ${tag}: ya está en la etapa de corte.`;
    case "confeccion":
      return `🪡 ${tag}: ya está en confección.`;
    case "estampado":
      return `🎨 ${tag}: ya está en estampado/personalización.`;
    case "control":
      return `🔍 ${tag}: está en control de calidad, falta poco para la entrega.`;
    case "entregado":
      return `📦 ${tag}: ¡está entregado! Gracias por elegirnos.`;
    case "cancelado":
      return `❌ ${tag}: fue cancelado. Si tenés dudas, escribinos.`;
    case "bloqueado_pago":
      return `⚠️ ${tag}: quedó pendiente cubrir la seña para poder avanzar a producción.`;
    default:
      return null;
  }
}

export interface OrderStatusNotificationInput {
  phoneNumber: string;
  message: string;
  /** Order contact, persisted as the message's customer. */
  contactId?: string | null;
}

export async function sendOrderStatusNotification(
  input: OrderStatusNotificationInput,
): Promise<OrderStatusNotifyResult> {
  const digits = normalizePhone(input.phoneNumber);
  if (digits.length < 7) {
    return { ok: false, error: "invalid_phone", retryable: false };
  }

  const decision = await decideSendAccount("whatsapp", digits);
  if (decision.kind === "retry") {
    return {
      ok: false,
      error: `no se pudo resolver la cuenta del canal (${decision.reason})`,
      retryable: true,
    };
  }
  if (decision.kind === "drop") {
    return { ok: false, error: decision.reason, retryable: false };
  }

  const account = decision.account;
  // messenger only routes through messaging providers (ycloud/zernio/kapso);
  // a whatsapp-bound telegram account is a provisioning bug — drop it.
  if (account?.provider === "telegram") {
    return { ok: false, error: "account_provider_mismatch", retryable: false };
  }

  const idempotencyKey = `order-status:${randomUUID()}`;
  const result = await messenger.send(
    {
      to: digits,
      type: "text",
      text: input.message,
      idempotencyKey,
    },
    account
      ? {
          account: account as unknown as MessagingChannelAccount,
        }
      : { channel: "whatsapp" },
  );

  const platformMessageId = result.ok
    ? result.providerMessageId || idempotencyKey
    : `${idempotencyKey}:failed`;
  const persisted = await persistCanonicalMessage({
    channel: "whatsapp",
    channelAccountId: decision.channelAccountId,
    externalThreadId: digits,
    platformMessageId,
    direction: "outbound",
    senderKind: "operator",
    senderRef: "order-status-notify",
    contentType: "text",
    content: input.message,
    deliveryState: result.ok ? "sent" : "failed",
    customerId: input.contactId ?? undefined,
    rawPayload: { source: "order-status-notify" },
  });

  if (!result.ok) {
    return { ok: false, error: result.error, retryable: result.retryable };
  }
  return {
    ok: true,
    providerMessageId: result.providerMessageId || undefined,
    conversationId: persisted.ok ? persisted.conversationId : undefined,
    channelAccountId: decision.channelAccountId,
    persisted: persisted.ok,
  };
}

/**
 * Resolves the order → contact → WhatsApp phone, builds the message for the
 * given status and sends it. Returns a non-ok result (without throwing) when
 * the order, contact, phone or message does not apply — callers treat every
 * notification as best-effort.
 */
export async function notifyOrderStatusChange(
  orderId: string,
  status: string,
): Promise<OrderStatusNotifyResult> {
  const [order] = await db
    .select({
      id: orders.id,
      number: orders.number,
      contactId: orders.contactId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: "order_not_found", retryable: false };
  if (!order.contactId) {
    return { ok: false, error: "order_without_contact", retryable: false };
  }

  const message = buildOrderStatusMessage(status, order.number);
  if (!message) {
    return { ok: false, error: "no_message_for_status", retryable: false };
  }

  const [identity] = await db
    .select({ externalId: leadIdentities.externalId })
    .from(leadIdentities)
    .where(
      and(
        eq(leadIdentities.contactId, order.contactId),
        eq(leadIdentities.channel, "whatsapp"),
      ),
    )
    .limit(1);

  const [contact] = await db
    .select({ phone: contacts.phone })
    .from(contacts)
    .where(eq(contacts.id, order.contactId))
    .limit(1);

  // Prefer the WhatsApp lead identity, but only when it is actually phone
  // shaped (BSUID-only identities must not be digit-stripped), then fall back
  // to the contact's phone field.
  const identityPhone =
    identity?.externalId && normalizePhone(identity.externalId).length >= 7
      ? identity.externalId
      : null;
  const phone = identityPhone ?? contact?.phone ?? "";
  if (!phone || normalizePhone(phone).length < 7) {
    return { ok: false, error: "contact_without_phone", retryable: false };
  }

  return sendOrderStatusNotification({
    phoneNumber: phone,
    message,
    contactId: order.contactId,
  });
}
