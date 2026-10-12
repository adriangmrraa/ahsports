import { z } from "zod";

import type { MessageContentType } from "@/lib/channels/types";

/**
 * WhatsApp Business (Cloud API) webhook import — OBSERVE ONLY.
 *
 * This module normalizes the operator-authored messages echoed by the WhatsApp
 * Business app (`smb_message_echoes`) into the canonical message shape and
 * persists them as `channel: 'whatsapp'`, `direction: 'outbound'`,
 * `senderKind: 'operator'`, `deliveryState: 'imported'` facts. There is NO
 * outbound/send path here or anywhere downstream: the WhatsApp Business app is
 * the sender; we only record that the operator replied.
 *
 * Inbound customer messages (`value.messages`) and delivery `statuses` are NOT
 * imported in this phase — Telegram is the inbound channel. Template status
 * callbacks carry no message content and are ignored.
 *
 * The pure schema + `normalizeWhatsAppWebhook` have no server-only/DB imports so
 * they can be exercised by a DB-free check; only `importWhatsAppWebhook` reaches
 * the persistence layer (lazy import) and therefore the database.
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

export type WhatsAppImportOutcome =
  | { ok: true; imported: number; duplicated: number }
  | { ok: false; error: "persistence_failed"; issues?: string[] };

/**
 * Persists every operator outbound echo as a canonical WhatsApp fact via
 * `importOperatorOutbound`. Idempotent: a duplicate `wamid` resolves to a safe
 * success with no new fact. Purely observe-only — no WhatsApp client is used.
 */
export async function importWhatsAppWebhook(update: WhatsAppWebhook): Promise<WhatsAppImportOutcome> {
  const messages = normalizeWhatsAppWebhook(update);
  if (messages.length === 0) {
    return { ok: true, imported: 0, duplicated: 0 };
  }

  // Lazy so the pure normalizer stays importable without the server-only DB
  // graph (see module header); the route and this path always run on the server.
  const { importOperatorOutbound } = await import("@/lib/channels/intake");

  let imported = 0;
  let duplicated = 0;

  for (const message of messages) {
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

  return { ok: true, imported, duplicated };
}
