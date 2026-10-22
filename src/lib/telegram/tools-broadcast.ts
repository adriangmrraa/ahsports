import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentMemories, contacts, leadIdentities, orders } from "@/db/schema";
import { decideSendAccount } from "@/lib/channels/send-account";
import { persistCanonicalMessage } from "@/lib/channels/intake";
import { messenger } from "@/lib/messaging/messenger";
import type { ChannelKind, ProviderId as MessagingProviderId } from "@/lib/messaging/types";
import type { AgentTool, AgentToolContext } from "@/lib/agents/tools/types";
import { withOperatorConfirmation } from "@/lib/telegram/confirmations";
import { maskTail } from "@/lib/telegram/format";

/**
 * Operator broadcast / send-as-operator tools — port of SocialCRM
 * `toolsWhatsApp.ts` onto the wave-1 send-account decision + messenger facade.
 *
 * Safety contract (unchanged):
 *  - a broadcast ALWAYS runs `dryRun=true` first: the real send refuses when no
 *    matching fresh dry-run marker exists;
 *  - the real send is gated by `CONFIRM <token>` (`withOperatorConfirmation`);
 *  - an identical (audience+message+recipients) send within 24h is refused;
 *  - account resolution fails closed (ambiguous/unresolvable → dropped, never
 *    re-routed to another sender);
 *  - every send persists a canonical outbound fact, sent or failed.
 */

const BROADCAST_DRYRUN_TTL_MS = 1000 * 60 * 30;
const BROADCAST_DEDUPE_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_RECIPIENTS = 200;

const audienceSchema = z.enum(["all", "with_orders", "search"]);

type BroadcastInput = z.infer<typeof broadcastInput>;

type Recipient = { contactId: string; phone: string };

function broadcastHash(input: BroadcastInput, phones: string[]): string {
  const digest = createHash("sha256")
    .update([input.audience, input.query ?? "", input.message, [...phones].sort().join(",")].join("|"))
    .digest("hex");
  return digest.slice(0, 16);
}

async function resolveRecipients(input: BroadcastInput): Promise<Recipient[]> {
  const identityRows = await db
    .select({ contactId: leadIdentities.contactId, externalId: leadIdentities.externalId })
    .from(leadIdentities)
    .where(eq(leadIdentities.channel, "whatsapp"));

  const byContact = new Map<string, string>();
  for (const row of identityRows) {
    const digits = row.externalId.replace(/\D/g, "");
    if (digits.length >= 7) byContact.set(row.contactId, digits);
  }
  let contactIds = [...byContact.keys()];

  if (input.audience === "with_orders") {
    const rows = await db
      .select({ contactId: orders.contactId })
      .from(orders)
      .where(and(ne(orders.status, "cancelado"), isNotNull(orders.contactId)));
    const withOrders = new Set(rows.map((row) => row.contactId).filter((id): id is string => Boolean(id)));
    contactIds = contactIds.filter((id) => withOrders.has(id));
  } else if (input.audience === "search") {
    const query = (input.query ?? "").trim();
    if (!query) return [];
    const digits = query.replace(/\D/g, "");
    const safe = query.replace(/[%_\\]/g, "");
    const matched = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        or(
          sql`${contacts.name} ilike ${"%" + safe + "%"}`,
          digits.length >= 3 ? sql`${contacts.phone} ilike ${"%" + digits + "%"}` : sql`false`,
        ),
      )
      .limit(500);
    const ids = new Set(matched.map((row) => row.id));
    contactIds = contactIds.filter((id) => ids.has(id));
  }

  return contactIds.slice(0, MAX_RECIPIENTS).map((contactId) => ({ contactId, phone: byContact.get(contactId)! }));
}

type SendOutcome = { phone: string; contactId: string; ok: boolean; error?: string };

async function sendWhatsAppTo(phone: string, message: string, context: AgentToolContext, keyPrefix: string): Promise<SendOutcome & { platformMessageId?: string }> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return { phone, contactId: "", ok: false, error: "invalid_phone" };

  const decision = await decideSendAccount("whatsapp", digits);
  if (decision.kind === "retry") return { phone, contactId: "", ok: false, error: "retryable_account_error" };
  if (decision.kind === "drop") return { phone, contactId: "", ok: false, error: `dropped:${decision.reason.slice(0, 80)}` };

  const account = decision.account;
  // messenger routes only through messaging providers (ycloud/zernio/kapso);
  // a whatsapp-bound telegram account is a provisioning bug — drop, never send.
  if (account?.provider === "telegram") {
    return { phone, contactId: "", ok: false, error: "dropped:account_provider_mismatch" };
  }

  const result = await messenger.send(
    { to: digits, type: "text", text: message, idempotencyKey: `${keyPrefix}:${digits}` },
    account ? { account: { ...account, provider: account.provider as MessagingProviderId, channel: account.channel as ChannelKind } } : {},
  );

  const contact = await db
    .select({ contactId: leadIdentities.contactId })
    .from(leadIdentities)
    .where(and(eq(leadIdentities.channel, "whatsapp"), eq(leadIdentities.externalId, digits)))
    .limit(1)
    .then((rows) => rows[0]?.contactId ?? null);

  const platformMessageId = result.ok ? result.providerMessageId || `${keyPrefix}:${randomUUID()}` : `${keyPrefix}:failed:${randomUUID()}`;
  await persistCanonicalMessage({
    channel: "whatsapp",
    channelAccountId: decision.channelAccountId,
    externalThreadId: digits,
    platformMessageId,
    direction: "outbound",
    senderKind: "operator",
    senderRef: context.actorRef ?? null,
    contentType: "text",
    content: message,
    deliveryState: result.ok ? "sent" : "failed",
    customerId: contact,
    rawPayload: { tool: keyPrefix.startsWith("bc") ? "broadcastWhatsApp" : "sendWhatsAppMessage" },
  });

  return { phone, contactId: contact ?? "", ok: result.ok, error: result.ok ? undefined : result.error.slice(0, 120), platformMessageId };
}

const broadcastInput = z.object({
  audience: audienceSchema,
  query: z.string().trim().min(2).max(120).optional(),
  message: z.string().trim().min(1).max(2000),
  dryRun: z.boolean().optional(),
});

const broadcastInner: AgentTool<BroadcastInput> = {
  id: "broadcastWhatsApp",
  description:
    "Envía un mensaje de WhatsApp a una audiencia de contactos (all | with_orders | search). SIEMPRE correr primero con dryRun=true: la ejecución real exige un dry-run fresco + confirmación y se rechaza si ya se envió lo mismo en 24h.",
  effect: "draft",
  inputSchema: broadcastInput,
  async handler(input, context) {
    const recipients = await resolveRecipients(input);
    const phones = recipients.map((r) => r.phone);
    const hash = broadcastHash(input, phones);

    if (input.dryRun !== false) {
      const value = { audience: input.audience, query: input.query ?? null, count: recipients.length, at: new Date().toISOString() };
      await db
        .insert(agentMemories)
        .values({ scope: "global", key: `broadcast:dryrun:${hash}`, value, expiresAt: new Date(Date.now() + BROADCAST_DRYRUN_TTL_MS) })
        .onConflictDoUpdate({ target: [agentMemories.scope, agentMemories.key], set: { value } });
      return {
        ok: true as const,
        dryRun: true as const,
        audience: input.audience,
        recipients: recipients.length,
        sample: phones.slice(0, 5).map(maskTail),
        messagePreview: input.message.slice(0, 160),
        note: "Vista previa guardada. Para enviar, pedí la acción real (dryRun=false) — requiere confirmación humana.",
      };
    }

    const [dryRunMarker] = await db
      .select({ id: agentMemories.id })
      .from(agentMemories)
      .where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, `broadcast:dryrun:${hash}`)))
      .limit(1);
    if (!dryRunMarker) {
      return {
        ok: false as const,
        error: "dry_run_required" as const,
        message: "No hay un dry-run fresco para esta audiencia y mensaje. Corré primero broadcastWhatsApp con dryRun=true.",
      };
    }

    const [lastSend] = await db
      .select({ id: agentMemories.id, value: agentMemories.value })
      .from(agentMemories)
      .where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, `broadcast:last:${hash}`)))
      .limit(1);
    if (lastSend) {
      return { ok: false as const, error: "duplicate_broadcast" as const, message: "Ya se envió un broadcast idéntico en las últimas 24h." };
    }

    let sent = 0;
    let failed = 0;
    const errors: { phone: string; error: string }[] = [];
    for (const recipient of recipients) {
      const outcome = await sendWhatsAppTo(recipient.phone, input.message, context, `bc:${hash}`);
      if (outcome.ok) sent += 1;
      else {
        failed += 1;
        if (errors.length < 10) errors.push({ phone: maskTail(recipient.phone), error: outcome.error ?? "send_failed" });
      }
    }

    const value = { sent, failed, at: new Date().toISOString(), by: context.actorRef ?? null };
    await db
      .insert(agentMemories)
      .values({ scope: "global", key: `broadcast:last:${hash}`, value, expiresAt: new Date(Date.now() + BROADCAST_DEDUPE_TTL_MS) })
      .onConflictDoUpdate({ target: [agentMemories.scope, agentMemories.key], set: { value } });

    return { ok: true as const, dryRun: false as const, attempted: recipients.length, sent, failed, errors };
  },
};

const broadcastGated = withOperatorConfirmation(broadcastInner, (args) => `broadcast WhatsApp a audiencia ${String(args.audience)}${args.query ? ` (${String(args.query).slice(0, 60)})` : ""}`);

/** dryRun executes immediately (it is the preview the real send requires); only the real send queues a pending action. */
export const broadcastWhatsAppTool: AgentTool<BroadcastInput> = {
  ...broadcastInner,
  async handler(input, context) {
    if (input.dryRun !== false) return broadcastInner.handler(input, context);
    return broadcastGated.handler(input, context);
  },
};

const sendWhatsAppInput = z.object({
  phone: z.string().trim().min(7).max(32),
  message: z.string().trim().min(1).max(2000),
});

const sendWhatsAppInner: AgentTool<z.infer<typeof sendWhatsAppInput>> = {
  id: "sendWhatsAppMessage",
  description:
    "Envía un mensaje puntual de WhatsApp a un teléfono como operador (send-as-operator). Persiste el hecho en la conversación. Requiere confirmación.",
  effect: "draft",
  inputSchema: sendWhatsAppInput,
  async handler(input, context) {
    const outcome = await sendWhatsAppTo(input.phone, input.message, context, "op-send");
    if (!outcome.ok) return { ok: false as const, error: outcome.error ?? "send_failed" };
    return { ok: true as const, to: maskTail(input.phone), platformMessageId: outcome.platformMessageId ?? null };
  },
};

export const sendWhatsAppMessageTool = withOperatorConfirmation(sendWhatsAppInner, (args) => `enviar WhatsApp como operador a ${maskTail(String(args.phone))}`);

export const broadcastTools = [broadcastWhatsAppTool, sendWhatsAppMessageTool] as const;
