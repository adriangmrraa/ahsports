import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentConfig, conversations } from "@/db/schema";
import { sendTelegramMessage } from "@/lib/channels/telegram";
import { decryptSecret } from "@/lib/crypto/secret-box";

/**
 * Operator notifier — pushes a text to every Telegram conversation the bot
 * has ever persisted (the operator channel is authorized-only: any chat that
 * talked to the bot is either bound or was already denied).
 *
 * Best-effort by contract: delivery failures are counted, never thrown, and
 * the bot token is never logged or returned.
 */

export type NotifyOperatorsResult = { ok: boolean; delivered: number; failed: number };

async function loadBotToken(): Promise<string> {
  const [config] = await db
    .select({ botTokenEnc: agentConfig.botTokenEnc })
    .from(agentConfig)
    .where(eq(agentConfig.id, 1))
    .limit(1);
  return decryptSecret(config?.botTokenEnc ?? "");
}

async function listOperatorChatIds(): Promise<string[]> {
  const rows = await db
    .select({ externalThreadId: conversations.externalThreadId })
    .from(conversations)
    .where(eq(conversations.channel, "telegram"));
  return [...new Set(rows.map((row) => row.externalThreadId))];
}

/** Sends `text` to every known operator Telegram chat. */
export async function notifyOperators(text: string): Promise<NotifyOperatorsResult> {
  const botToken = await loadBotToken();
  if (!botToken) return { ok: false, delivered: 0, failed: 0 };

  const chatIds = await listOperatorChatIds();
  let delivered = 0;
  let failed = 0;
  for (const chatId of chatIds) {
    const result = await sendTelegramMessage(botToken, chatId, text);
    if (result.ok) delivered += 1;
    else failed += 1;
  }
  return { ok: delivered > 0 || chatIds.length === 0, delivered, failed };
}
