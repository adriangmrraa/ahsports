/**
 * Conversation-history loader for the customer WhatsApp agent.
 *
 * Reads the canonical `chat_messages` timeline and maps it to temporal
 * history turns for the agent loop. Operator rows (a human replying from
 * the WhatsApp Business app) surface as assistant-side context with an
 * explicit «Equipo humano» marker so the model never mistakes them for its
 * own prior answers.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages } from "@/db/schema";
import type { TemporalHistoryEntry } from "./temporal-context";

const HISTORY_LIMIT = 30;

export async function loadConversationHistory(
  conversationId: string,
): Promise<TemporalHistoryEntry[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      senderKind: chatMessages.senderKind,
      contentType: chatMessages.contentType,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      platformMessageId: chatMessages.platformMessageId,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(HISTORY_LIMIT);

  const turns: TemporalHistoryEntry[] = [];
  for (const row of rows) {
    const content = row.content ?? "";
    if (row.senderKind === "customer") {
      turns.push({
        role: "user",
        content,
        createdAt: row.createdAt,
        messageId: row.id,
        platformMessageId: row.platformMessageId ?? undefined,
      });
      continue;
    }
    const prefix = row.senderKind === "operator" ? "«Equipo humano»: " : "";
    turns.push({
      role: "assistant",
      content: prefix + content,
      createdAt: row.createdAt,
      messageId: row.id,
      platformMessageId: row.platformMessageId ?? undefined,
    });
  }
  return turns;
}
