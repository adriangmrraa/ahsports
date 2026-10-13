import { z } from "zod";

/**
 * Normalized channel contract.
 *
 * Every inbound/outbound message is reduced to this shape before it reaches the
 * canonical persistence layer, so the timeline is channel-agnostic and the
 * idempotency anchor is always `(channel, platformMessageId)`. All external
 * input is validated with Zod `safeParse` at the intake boundary.
 */

export const channelValues = ["telegram", "whatsapp"] as const;
export const messageDirectionValues = ["inbound", "outbound"] as const;
export const senderKindValues = ["customer", "agent", "operator"] as const;
export const contentTypeValues = ["text", "image", "document", "system"] as const;
export const deliveryStateValues = ["received", "queued", "sent", "failed", "imported"] as const;

export const channelSchema = z.enum(channelValues);
export const messageDirectionSchema = z.enum(messageDirectionValues);
export const senderKindSchema = z.enum(senderKindValues);
export const contentTypeSchema = z.enum(contentTypeValues);
export const deliveryStateSchema = z.enum(deliveryStateValues);

export type Channel = z.infer<typeof channelSchema>;
export type MessageDirection = z.infer<typeof messageDirectionSchema>;
export type SenderKind = z.infer<typeof senderKindSchema>;
export type MessageContentType = z.infer<typeof contentTypeSchema>;
export type DeliveryState = z.infer<typeof deliveryStateSchema>;

export const normalizedMessageSchema = z.object({
  channel: channelSchema,
  /** Stable thread identity on the provider (Telegram chat id, WhatsApp wa_id). */
  externalThreadId: z.string().trim().min(1).max(255),
  /** Provider message id; combined with channel it is the idempotency anchor. */
  platformMessageId: z.string().trim().min(1).max(255),
  direction: messageDirectionSchema,
  senderKind: senderKindSchema,
  senderRef: z.string().trim().max(255).nullish(),
  contentType: contentTypeSchema.default("text"),
  content: z.string().max(20000).default(""),
  deliveryState: deliveryStateSchema.optional(),
  rawPayload: z.record(z.unknown()).optional(),
  customerId: z.string().trim().max(36).nullish(),
  organizationId: z.string().trim().max(36).nullish(),
});

/** Validated, normalized message persisted as a canonical DB fact. */
export type NormalizedMessage = z.infer<typeof normalizedMessageSchema>;

/**
 * Default delivery state before an explicit transition:
 * - imported WhatsApp operator outbound is `imported` (never sent by us);
 * - customer inbound is `received`;
 * - agent outbound is `queued` until the channel confirms delivery.
 */
export function defaultDeliveryState(
  message: Pick<NormalizedMessage, "channel" | "direction" | "senderKind">,
): DeliveryState {
  if (message.channel === "whatsapp" && message.direction === "outbound" && message.senderKind === "operator") {
    return "imported";
  }
  if (message.direction === "inbound") return "received";
  if (message.senderKind === "agent") return "queued";
  return "sent";
}
