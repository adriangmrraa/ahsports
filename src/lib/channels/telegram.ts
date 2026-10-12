import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Telegram Bot API adapter (Telegram-first channel runtime).
 *
 * The bot token and webhook secret are always passed in decrypted by the
 * caller; this module never reads or logs them. Requests are verified before
 * any side effect and the update payload is validated with Zod.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

const idSchema = z.union([z.number(), z.string()]).transform((value) => String(value));

export const telegramUserSchema = z
  .object({
    id: idSchema,
    is_bot: z.boolean().optional(),
    username: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  })
  .passthrough();

export const telegramChatSchema = z
  .object({
    id: idSchema,
    type: z.string().optional(),
  })
  .passthrough();

export const telegramMessageSchema = z
  .object({
    message_id: idSchema,
    date: z.number().optional(),
    chat: telegramChatSchema,
    from: telegramUserSchema.optional(),
    text: z.string().optional(),
    caption: z.string().optional(),
    document: z
      .object({
        file_id: z.string(),
        file_name: z.string().optional(),
        mime_type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    photo: z
      .array(z.object({ file_id: z.string(), file_size: z.number().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

export const telegramUpdateSchema = z
  .object({
    update_id: idSchema,
    message: telegramMessageSchema.optional(),
    edited_message: telegramMessageSchema.optional(),
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;

const sendMessageResponseSchema = z.object({
  ok: z.boolean(),
  result: z
    .object({
      message_id: idSchema.optional(),
      chat: telegramChatSchema.optional(),
    })
    .optional(),
  description: z.string().optional(),
});

export type SendMessageResult = { ok: true; messageId: string } | { ok: false; error: string };

export type NormalizedTelegramInbound = {
  channel: "telegram";
  externalThreadId: string;
  platformMessageId: string;
  direction: "inbound";
  senderRef: string;
  contentType: "text" | "image" | "document";
  content: string;
  rawPayload: Record<string, unknown>;
  chatId: string;
  telegramUserId: string;
};

/**
 * Reduces a Telegram update to the normalized inbound shape. Bot-authored
 * updates (including ours) and non-message updates return null so they are
 * acknowledged without side effects. Telegram `message_id` is only unique per
 * chat, so the idempotency id is `${chatId}:${messageId}`.
 */
export function normalizeTelegramUpdate(update: TelegramUpdate): NormalizedTelegramInbound | null {
  const message = update.message ?? update.edited_message;
  if (!message) return null;
  if (message.from?.is_bot) return null;

  const chatId = message.chat.id;
  const telegramUserId = message.from?.id ?? chatId;
  const contentType: "text" | "image" | "document" = message.document
    ? "document"
    : message.photo && message.photo.length > 0
      ? "image"
      : "text";
  const content = (message.text ?? message.caption ?? "").slice(0, 20000);

  return {
    channel: "telegram",
    externalThreadId: chatId,
    platformMessageId: `${chatId}:${message.message_id}`,
    direction: "inbound",
    senderRef: telegramUserId,
    contentType,
    content,
    rawPayload: update as unknown as Record<string, unknown>,
    chatId,
    telegramUserId,
  };
}

/** Constant-time string comparison that tolerates length mismatch. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Non-secret path token derived from the webhook secret. */
export function deriveWebhookPathToken(webhookSecret: string): string {
  return createHash("sha256").update(webhookSecret).digest("hex").slice(0, 32);
}

export function telegramSecretHeader(request: Request): string {
  return request.headers.get(TELEGRAM_SECRET_HEADER) ?? "";
}

/**
 * Verifies a Telegram webhook request before any side effect: the secret-token
 * header must match the configured secret (constant time) and the URL path
 * token must be the non-secret fingerprint of that same secret.
 */
export function verifyTelegramRequest(input: {
  pathToken: string;
  headerSecret: string;
  expectedSecret: string;
}): boolean {
  if (!input.expectedSecret) return false;
  if (!timingSafeEqualString(input.headerSecret, input.expectedSecret)) return false;
  return timingSafeEqualString(input.pathToken, deriveWebhookPathToken(input.expectedSecret));
}

/** Sends a reply through the Bot API. Never logs or returns the bot token. */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<SendMessageResult> {
  if (!botToken) return { ok: false, error: "missing_token" };
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    const parsed = sendMessageResponseSchema.safeParse(json);
    if (!parsed.success) return { ok: false, error: "invalid_response" };
    if (!parsed.data.ok) return { ok: false, error: parsed.data.description ?? "send_failed" };
    return { ok: true, messageId: parsed.data.result?.message_id ?? "" };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
