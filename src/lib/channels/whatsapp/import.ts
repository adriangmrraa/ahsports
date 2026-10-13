import { z } from "zod";

import type { IntakeSuccess } from "@/lib/channels/intake";
import type { MessageContentType } from "@/lib/channels/types";

/**
 * WhatsApp Business (Cloud API) webhook import.
 *
 * This module normalizes a verified webhook into canonical facts. Operator
 * messages echoed by the WhatsApp Business app (`smb_message_echoes`) are
 * persisted as `channel: 'whatsapp'`, `direction: 'outbound'`,
 * `senderKind: 'operator'`, `deliveryState: 'imported'` — an observed record of
 * a reply the operator already sent elsewhere (never re-routed through the AI).
 * Customer inbound messages (`value.messages`) are persisted as
 * `direction: 'inbound'`, `senderKind: 'customer'`, `deliveryState: 'received'`
 * and handed back (`pendingInbound`) so the caller can answer them through the
 * AI loop. The outbound send path lives in `./send.ts`; nothing here sends.
 *
 * Delivery `statuses` and template-status callbacks carry no message content and
 * are ignored.
 *
 * The pure schema + normalizers (`normalizeWhatsAppWebhook`,
 * `normalizeWhatsAppInbound`) have no server-only/DB imports so they can be
 * exercised by a DB-free check; only `importWhatsAppWebhook` reaches the
 * persistence layer (lazy import) and therefore the database.
 */

const waId = z.union([z.number(), z.string()]).transform((value) => String(value));

const waTextSchema = z
  .object({ body: z.string().optional() })
  .passthrough();

const waImageSchema = z
  .object({
    id: z.string().optional(),
    mime_type: z.string().optional(),
    caption: z.string().optional(),
  })
  .passthrough();

const waDocumentSchema = z
  .object({
    id: z.string().optional(),
    filename: z.string().optional(),
    mime_type: z.string().optional(),
    caption: z.string().optional(),
  })
  .passthrough();

const waTemplateSchema = z
  .object({
    name: z.string().optional(),
    language: z.object({ code: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const waMessageSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    from: waId.optional(),
    to: waId.optional(),
    timestamp: waId.optional(),
    type: z.string().optional(),
    text: waTextSchema.optional(),
    image: waImageSchema.optional(),
    document: waDocumentSchema.optional(),
    template: waTemplateSchema.optional(),
  })
  .passthrough();

export type WhatsAppMessage = z.infer<typeof waMessageSchema>;

const waMetadataSchema = z
  .object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string().optional(),
  })
  .passthrough();

const waStatusSchema = z.object({ id: z.string().optional() }).passthrough();

const waChangeValueSchema = z
  .object({
    messaging_product: z.string().optional(),
    metadata: waMetadataSchema.optional(),
    contacts: z.array(z.unknown()).optional(),
    /** Customer → business inbound. Out of scope for this observe-only phase. */
    messages: z.array(waMessageSchema).optional(),
    /** Business app self-sent messages → the operator outbound we import. */
    smb_message_echoes: z.array(waMessageSchema).optional(),
    statuses: z.array(waStatusSchema).optional(),
    message_template_status_update: z.record(z.unknown()).optional(),
  })
  .passthrough();

const waChangeSchema = z
  .object({
    field: z.string().optional(),
    value: waChangeValueSchema,
  })
  .passthrough();

const waEntrySchema = z
  .object({
    id: z.string().optional(),
    changes: z.array(waChangeSchema),
  })
  .passthrough();

export const whatsAppWebhookSchema = z
  .object({
    object: z.string().optional(),
    entry: z.array(waEntrySchema),
  })
  .passthrough();

export type WhatsAppWebhook = z.infer<typeof whatsAppWebhookSchema>;

/** Normalized operator outbound message ready for canonical persistence. */
export type NormalizedWhatsAppOperatorMessage = {
  channel: "whatsapp";
  /** Counterpart wa_id (the customer) so this attaches to the customer thread. */
  externalThreadId: string;
  /** Provider message id (`wamid...`) — the idempotency anchor per channel. */
  platformMessageId: string;
  direction: "outbound";
  senderKind: "operator";
  /** The business number that authored the reply. */
  senderRef: string;
  contentType: MessageContentType;
  content: string;
  deliveryState: "imported";
  rawPayload: Record<string, unknown>;
  waId: string;
  businessNumber: string;
};

function contentTypeFor(message: WhatsAppMessage): MessageContentType {
  switch (message.type) {
    case "image":
      return "image";
    case "document":
      return "document";
    default:
      return "text";
  }
}

function contentFor(message: WhatsAppMessage): string {
  if (message.text?.body) return message.text.body;
  if (message.image?.caption) return message.image.caption;
  if (message.image) return "[image]";
  if (message.document?.caption) return message.document.caption;
  if (message.document?.filename) return message.document.filename;
  if (message.document) return "[document]";
  if (message.template?.name) return `[template: ${message.template.name}]`;
  return "";
}

/**
 * Reduces a verified WhatsApp webhook payload to the operator outbound messages
 * worth importing. Echoed messages without an id or counterpart are skipped;
 * inbound messages, statuses and template-status callbacks yield nothing.
 */
export function normalizeWhatsAppWebhook(update: WhatsAppWebhook): NormalizedWhatsAppOperatorMessage[] {
  const normalized: NormalizedWhatsAppOperatorMessage[] = [];

  for (const entry of update.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const businessNumber =
        value.metadata?.phone_number_id ?? value.metadata?.display_phone_number ?? "";

      for (const message of value.smb_message_echoes ?? []) {
        const counterpart = message.to ?? message.from ?? "";
        if (!counterpart) continue;

        normalized.push({
          channel: "whatsapp",
          externalThreadId: counterpart.slice(0, 255),
          platformMessageId: message.id.slice(0, 255),
          direction: "outbound",
          senderKind: "operator",
          senderRef: (message.from ?? businessNumber).slice(0, 255),
          contentType: contentTypeFor(message),
          content: contentFor(message).slice(0, 20000),
          deliveryState: "imported",
          rawPayload: message as unknown as Record<string, unknown>,
          waId: counterpart,
          businessNumber,
        });
      }
    }
  }

  return normalized;
}

/** Normalized customer inbound message ready for canonical persistence + routing. */
export type NormalizedWhatsAppCustomerMessage = {
  channel: "whatsapp";
  /** Counterpart wa_id (the customer) so this opens/attaches to the thread. */
  externalThreadId: string;
  /** Provider message id (`wamid...`) — the idempotency anchor per channel. */
  platformMessageId: string;
  direction: "inbound";
  senderKind: "customer";
  /** The customer wa_id that authored the message. */
  senderRef: string;
  contentType: MessageContentType;
  content: string;
  deliveryState: "received";
  rawPayload: Record<string, unknown>;
  waId: string;
  businessNumber: string;
};

/**
 * Reduces a verified WhatsApp webhook payload to the customer inbound messages
 * worth importing. Messages without an id or sender are skipped, as are
 * content-less events (e.g. an empty text body) that would only add noise and
 * trigger a meaningless AI turn.
 */
export function normalizeWhatsAppInbound(update: WhatsAppWebhook): NormalizedWhatsAppCustomerMessage[] {
  const normalized: NormalizedWhatsAppCustomerMessage[] = [];

  for (const entry of update.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const businessNumber =
        value.metadata?.phone_number_id ?? value.metadata?.display_phone_number ?? "";

      for (const message of value.messages ?? []) {
        const counterpart = message.from ?? "";
        if (!counterpart) continue;

        const content = contentFor(message);
        if (!content) continue;

        normalized.push({
          channel: "whatsapp",
          externalThreadId: counterpart.slice(0, 255),
          platformMessageId: message.id.slice(0, 255),
          direction: "inbound",
          senderKind: "customer",
          senderRef: counterpart.slice(0, 255),
          contentType: contentTypeFor(message),
          content: content.slice(0, 20000),
          deliveryState: "received",
          rawPayload: message as unknown as Record<string, unknown>,
          waId: counterpart,
          businessNumber,
        });
      }
    }
  }

  return normalized;
}

/** A customer inbound message that was newly persisted and still needs routing. */
export type PendingInbound = {
  message: NormalizedWhatsAppCustomerMessage;
  persisted: IntakeSuccess;
};

export type WhatsAppImportOutcome =
  | {
      ok: true;
      /** New operator outbound echoes imported. */
      imported: number;
      /** Duplicate operator outbound echoes ignored. */
      duplicated: number;
      /** New customer inbound messages persisted. */
      inbound: number;
      /** Newly persisted customer inbound messages awaiting an AI reply. */
      pendingInbound: PendingInbound[];
    }
  | { ok: false; error: "persistence_failed"; issues?: string[] };

/**
 * Persists every operator outbound echo as a canonical WhatsApp fact via
 * `importOperatorOutbound`, and every customer inbound message via
 * `persistCustomerInbound`. Idempotent: a duplicate `wamid` resolves to a safe
 * success with no new fact. New customer inbound messages are returned in
 * `pendingInbound` so the caller can route them (a duplicate was already
 * answered, so it is not re-routed). No WhatsApp client is used here.
 */
export async function importWhatsAppWebhook(update: WhatsAppWebhook): Promise<WhatsAppImportOutcome> {
  const operatorMessages = normalizeWhatsAppWebhook(update);
  const inboundMessages = normalizeWhatsAppInbound(update);

  if (operatorMessages.length === 0 && inboundMessages.length === 0) {
    return { ok: true, imported: 0, duplicated: 0, inbound: 0, pendingInbound: [] };
  }

  // Lazy so the pure normalizers stay importable without the server-only DB
  // graph (see module header); the route and this path always run on the server.
  const { importOperatorOutbound, persistCustomerInbound } = await import("@/lib/channels/intake");

  let imported = 0;
  let duplicated = 0;

  for (const message of operatorMessages) {
    const result = await importOperatorOutbound({
      channel: message.channel,
      externalThreadId: message.externalThreadId,
      platformMessageId: message.platformMessageId,
      direction: message.direction,
      senderKind: message.senderKind,
      senderRef: message.senderRef,
      contentType: message.contentType,
      content: message.content,
      deliveryState: message.deliveryState,
      rawPayload: message.rawPayload,
    });

    if (!result.ok) {
      return { ok: false, error: "persistence_failed", issues: result.issues };
    }
    if (result.duplicate) duplicated += 1;
    else imported += 1;
  }

  let inbound = 0;
  const pendingInbound: PendingInbound[] = [];

  for (const message of inboundMessages) {
    const result = await persistCustomerInbound({
      channel: message.channel,
      externalThreadId: message.externalThreadId,
      platformMessageId: message.platformMessageId,
      senderRef: message.senderRef,
      contentType: message.contentType,
      content: message.content,
      deliveryState: message.deliveryState,
      rawPayload: message.rawPayload,
    });

    if (!result.ok) {
      return { ok: false, error: "persistence_failed", issues: result.issues };
    }
    if (!result.duplicate) {
      inbound += 1;
      pendingInbound.push({ message, persisted: result });
    }
  }

  return { ok: true, imported, duplicated, inbound, pendingInbound };
}
