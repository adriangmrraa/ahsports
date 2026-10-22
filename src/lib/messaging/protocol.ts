/**
 * Protocol-artifact detection for inbound webhooks.
 *
 * Port of SocialCRM `src/lib/whatsapp/webhook-pipeline.ts` (the artifact gate),
 * moved into the provider-agnostic messaging layer. Pure and side-effect-free:
 * protocol artifacts (empty Business echoes and delivery/status events) must
 * never cause conversation lookup, persistence, routing, or replies — they are
 * acked with 200 and dropped.
 *
 * The check runs on the RAW provider payload (ycloud-shaped envelope), before
 * any side effect.
 */

export const ECHO_EVENT_TYPES = [
  "whatsapp.message.echo",
  "whatsapp.smb.message.echoes",
] as const;

const ECHO_MESSAGE_KEYS = [
  "whatsappMessage",
  "whatsappSmbMessageEcho",
  "whatsappSmbMessageEchoes",
  "smbMessage",
  "message",
  "whatsappMessageEcho",
] as const;

const INBOUND_EVENT_TYPE = "whatsapp.inbound_message.received";

const STATUS_MESSAGE_TYPES = new Set([
  "status",
  "delivery",
  "delivery_status",
  "message_status",
  "seen",
  "read",
  "played",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractEchoMessage(event: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const key of ECHO_MESSAGE_KEYS) {
    const candidate = event[key];
    if (isRecord(candidate)) return candidate;
  }
  for (const [key, value] of Object.entries(event)) {
    if (["type", "id", "createTime", "sendTime", "apiVersion"].includes(key)) continue;
    if (isRecord(value) && (value.to !== undefined || value.from !== undefined)) return value;
  }
  return undefined;
}

function echoMessageHasContent(msg: Record<string, unknown>): boolean {
  const msgType = typeof msg.type === "string" ? msg.type : "text";
  if (msgType === "text" && isRecord(msg.text)) {
    return typeof msg.text.body === "string" && msg.text.body.trim().length > 0;
  }
  if (["image", "audio", "document", "video"].includes(msgType)) {
    const media = msg[msgType];
    if (isRecord(media)) {
      if (typeof media.id === "string" && media.id.length > 0) return true;
      if (typeof media.caption === "string" && media.caption.trim().length > 0) return true;
    }
    return false;
  }
  if (msgType === "location" && isRecord(msg.location)) {
    const loc = msg.location;
    return (
      (typeof loc.address === "string" && loc.address.trim().length > 0) ||
      (typeof loc.name === "string" && loc.name.trim().length > 0) ||
      (typeof loc.latitude === "number" && typeof loc.longitude === "number")
    );
  }
  return false;
}

/**
 * Returns true when the webhook payload is a protocol artifact that must be
 * acknowledged with 200 and cause no lookup, mutation, routing, or reply:
 * empty Business echoes and delivery/status events.
 */
export function isProtocolArtifact(payload: unknown): boolean {
  if (!isRecord(payload)) return true;
  const type = typeof payload.type === "string" ? payload.type : undefined;

  if (type !== undefined && (ECHO_EVENT_TYPES as readonly string[]).includes(type)) {
    const msg = extractEchoMessage(payload);
    if (!msg) return true;
    return !echoMessageHasContent(msg);
  }

  if (type !== INBOUND_EVENT_TYPE) return true;

  const message = payload.whatsappInboundMessage;
  if (!isRecord(message)) return true;
  const msgType = typeof message.type === "string" ? message.type : undefined;
  if (!msgType || STATUS_MESSAGE_TYPES.has(msgType)) return true;
  if (typeof message.id !== "string" || message.id.length === 0) return true;
  if (typeof message.from !== "string" || message.from.length === 0) return true;
  return false;
}
