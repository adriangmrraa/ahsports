import { z } from "zod";

/**
 * WhatsApp outbound send path (YCloud).
 *
 * Config-gated by environment variables: `YCLOUD_API_KEY` + 
 * `WHATSAPP_PHONE_NUMBER` (and optional `YCLOUD_BASE_URL`, default
 * `https://api.ycloud.com`). When either required value is missing, the send
 * resolves to `{ ok: false, error: "not_configured" }` and NO HTTP request is
 * ever made — a message whose send config is missing is never sent.
 *
 * Mirrors `sendTelegramMessage`: it never throws and never logs or returns the
 * API key. Only a stable boolean/error code leaves this module.
 */

const DEFAULT_YCLOUD_BASE_URL = "https://api.ycloud.com";
const YCLOUD_SEND_PATH = "/v2/whatsapp/messages/sendDirectly";
const REQUEST_TIMEOUT_MS = 20_000;

export type SendWhatsAppResult = { ok: true; messageId: string } | { ok: false; error: string };

export type WhatsAppSendConfig = { apiKey: string; from: string; baseUrl: string };

/** Content the caller can ask us to deliver. */
export type WhatsAppOutboundContent =
  | { type: "text"; body: string }
  | { type: "image"; link: string; caption?: string }
  | { type: "document"; link: string; caption?: string; filename?: string };

type YCloudContent =
  | { type: "text"; text: { body: string; preview_url: false } }
  | { type: "image"; image: { link: string; caption: string } }
  | { type: "document"; document: { link: string; caption: string; filename: string } };

type EnvRecord = Record<string, string | undefined>;

const ycloudResponseSchema = z.object({ id: z.string().optional() }).passthrough();

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Resolves the YCloud send config from env, or null when the send path is off. */
export function resolveWhatsAppSendConfig(env: EnvRecord = process.env): WhatsAppSendConfig | null {
  const apiKey = clean(env.YCLOUD_API_KEY);
  const from = clean(env.WHATSAPP_PHONE_NUMBER);
  if (!apiKey || !from) return null;
  return {
    apiKey,
    from,
    baseUrl: clean(env.YCLOUD_BASE_URL) || DEFAULT_YCLOUD_BASE_URL,
  };
}

/** True only when both the API key and the sender number are configured. */
export function isWhatsAppSendConfigured(env: EnvRecord = process.env): boolean {
  return resolveWhatsAppSendConfig(env) !== null;
}

function toYCloudContent(content: string | WhatsAppOutboundContent): YCloudContent {
  if (typeof content === "string") {
    return { type: "text", text: { body: content, preview_url: false } };
  }
  if (content.type === "image") {
    return { type: "image", image: { link: content.link, caption: content.caption ?? "" } };
  }
  if (content.type === "document") {
    return {
      type: "document",
      document: {
        link: content.link,
        caption: content.caption ?? "",
        filename: content.filename ?? "documento.pdf",
      },
    };
  }
  return { type: "text", text: { body: content.body, preview_url: false } };
}

/**
 * Sends one outbound WhatsApp message through YCloud. Accepts plain text or a
 * media descriptor (image/document). Never throws and never exposes secrets:
 * every failure returns a stable error code, and a missing send config is a
 * `not_configured` no-op with no network call.
 */
export async function sendWhatsAppMessage(
  to: string,
  content: string | WhatsAppOutboundContent,
  env: EnvRecord = process.env,
): Promise<SendWhatsAppResult> {
  const config = resolveWhatsAppSendConfig(env);
  if (!config) return { ok: false, error: "not_configured" };

  const recipient = to.trim();
  if (!recipient) return { ok: false, error: "missing_recipient" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}${YCLOUD_SEND_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({ from: config.from, to: recipient, ...toYCloudContent(content) }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      // Status only: the provider body may echo request data, so it is never
      // surfaced or logged.
      return { ok: false, error: `ycloud_http_${response.status}` };
    }

    const json = await response.json().catch(() => null);
    const parsed = ycloudResponseSchema.safeParse(json);
    if (!parsed.success) return { ok: false, error: "invalid_response" };
    return { ok: true, messageId: parsed.data.id ?? "" };
  } catch {
    return { ok: false, error: "network_error" };
  } finally {
    clearTimeout(timeoutId);
  }
}
