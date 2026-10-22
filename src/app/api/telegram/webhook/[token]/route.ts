import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentConfig } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { updateMessageDelivery } from "@/lib/channels/intake";
import {
  normalizeTelegramUpdate,
  sendTelegramMessage,
  telegramSecretHeader,
  telegramUpdateSchema,
  verifyTelegramRequest,
} from "@/lib/channels/telegram";
import { handleTelegramOperatorUpdate } from "@/lib/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/webhook/[token]
 *
 * Telegram webhook. Verifies the secret-token header (constant time) against the
 * decrypted bot webhook secret before any side effect, validates the update with
 * Zod, then hands the normalized inbound to the operator-bot dispatch (wave 2),
 * which rides the canonical intake from wave 1. Replies are persisted before
 * delivery so a failed send preserves the outbound fact and retries stay safe.
 * Secrets are never logged. Always answers 2xx for handled/duplicate/ignored
 * updates so Telegram stops retrying.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [config] = await db
    .select({ botTokenEnc: agentConfig.botTokenEnc, webhookSecretEnc: agentConfig.webhookSecretEnc })
    .from(agentConfig)
    .where(eq(agentConfig.id, 1))
    .limit(1);

  const webhookSecret = decryptSecret(config?.webhookSecretEnc ?? "");
  const botToken = decryptSecret(config?.botTokenEnc ?? "");
  if (!webhookSecret || !botToken) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const authorized = verifyTelegramRequest({
    pathToken: token,
    headerSecret: telegramSecretHeader(request),
    expectedSecret: webhookSecret,
  });
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = telegramUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_update" }, { status: 400 });
  }

  const inbound = normalizeTelegramUpdate(parsed.data);
  if (!inbound) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await handleTelegramOperatorUpdate(inbound);

  if (!result.persisted.ok) {
    return NextResponse.json({ ok: false, error: result.persisted.error }, { status: 500 });
  }

  if (result.replyText && result.replyMessageId) {
    const sent = await sendTelegramMessage(botToken, inbound.chatId, result.replyText);
    await updateMessageDelivery(result.replyMessageId, sent.ok ? "sent" : "failed");
  }

  return NextResponse.json({ ok: true, duplicate: result.persisted.duplicate });
}
