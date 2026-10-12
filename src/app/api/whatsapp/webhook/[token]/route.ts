import { NextResponse } from "next/server";

import { deriveWebhookPathToken, timingSafeEqualString } from "@/lib/channels/telegram";
import { importWhatsAppWebhook, whatsAppWebhookSchema } from "@/lib/channels/whatsapp/import";
import { verifyWhatsAppSignature, whatsappSignatureHeader } from "@/lib/channels/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Business (Cloud API) webhook — OBSERVE / IMPORT ONLY.
 *
 * Config-gated by `WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET` (env, no
 * migration). There is NO send path: the WhatsApp Business app is the sender
 * and this endpoint only records operator outbound messages as canonical facts.
 *
 * GET  — Meta verification handshake. Echoes `hub.challenge` only when
 *        `hub.mode=subscribe`, the `hub.verify_token` matches (constant time)
 *        and the URL path token is the derived fingerprint of that token.
 * POST — Verifies `X-Hub-Signature-256` over the RAW body (constant time),
 *        Zod-validates the payload, then imports operator outbound echoes.
 *
 * Missing config → 503 · bad signature/token → 403 · bad payload → 400 ·
 * handled/duplicate/ignored → 2xx. Secrets and raw bodies are never logged.
 */

function whatsAppConfig(): { appSecret: string; verifyToken: string } | null {
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  if (!appSecret || !verifyToken) return null;
  return { appSecret, verifyToken };
}

function pathTokenMatches(token: string, verifyToken: string): boolean {
  return timingSafeEqualString(token, deriveWebhookPathToken(verifyToken));
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const config = whatsAppConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const presentedToken = url.searchParams.get("hub.verify_token") ?? "";

  const authorized =
    mode === "subscribe" &&
    timingSafeEqualString(presentedToken, config.verifyToken) &&
    pathTokenMatches(token, config.verifyToken);

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const config = whatsAppConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  if (!pathTokenMatches(token, config.verifyToken)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // The signature is over the exact bytes received: read text, verify, then parse.
  const rawBody = await request.text();
  const signatureOk = verifyWhatsAppSignature({
    appSecret: config.appSecret,
    rawBody,
    header: whatsappSignatureHeader(request),
  });
  if (!signatureOk) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const parsed = whatsAppWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const outcome = await importWhatsAppWebhook(parsed.data);
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported: outcome.imported, duplicated: outcome.duplicated });
}
