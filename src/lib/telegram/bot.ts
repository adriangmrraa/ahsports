import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages } from "@/db/schema";
import { persistCanonicalMessage, type IntakeOutcome } from "@/lib/channels/intake";
import { defaultDeliveryState, type NormalizedMessage } from "@/lib/channels/types";
import type { NormalizedTelegramInbound } from "@/lib/channels/telegram";
import { handleOperatorCommand } from "@/lib/agents/commands";
import { resolveOperatorIdentity, type AuthorizedOperator } from "@/lib/agent/identity";
import { resolveAgentRuntime } from "@/lib/ai/config";
import { createChatProvider } from "@/lib/ai/registry";
import { runAgentLoop, wrapUntrustedContent } from "@/lib/agents/loop";
import type { ChatMessage } from "@/lib/ai/provider";
import { executePendingAction } from "@/lib/telegram/confirmations";
import { buildOperatorSystemPrompt } from "@/lib/telegram/system-prompt";
import { buildOperatorTools } from "@/lib/telegram/tools";

/**
 * Telegram operator-bot dispatch (wave 2).
 *
 * Same canonical-intake contract as the wave-1 router — persist the inbound
 * fact first (idempotent), reply through the same outbound persistence so a
 * failed send still leaves the fact — but a different trust domain and tool
 * surface: the sender is a bound operator and gets the full operator toolset
 * with the two-step confirmation gate, not the customer-facing registry.
 *
 * `CONFIRM <token>` is intercepted deterministically BEFORE the LLM loop: the
 * release of a pending action is code-level and never model-mediated.
 */

export type OperatorRouteResult = {
  persisted: IntakeOutcome;
  replyText: string | null;
  replyMessageId: string | null;
};

const HISTORY_TURNS = 12;
const NO_RESPONSE_FALLBACK = "No pude generar una respuesta. Reintentá o contactá a administración.";

const CONFIRM_PATTERN = /^\/?(?:confirm|confirmar)\s+([0-9a-f]{6,32})\s*$/i;
const SLASH_COMMAND = /^\/(start|help|whoami|status)\b/i;

/** Rebuilds prior turns; inbound operator text stays wrapped as untrusted data. */
async function loadHistory(conversationId: string, beforeMessageId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select({ id: chatMessages.id, direction: chatMessages.direction, senderKind: chatMessages.senderKind, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(HISTORY_TURNS * 2);

  const turns = rows
    .reverse()
    .filter((row) => row.id !== beforeMessageId && row.content.trim().length > 0)
    .slice(-HISTORY_TURNS);

  return turns.map((row) =>
    row.direction === "inbound"
      ? { role: "user" as const, content: wrapUntrustedContent(row.content) }
      : { role: "assistant" as const, content: row.content.slice(0, 4000) },
  );
}

async function persistOutboundReply(persisted: Extract<IntakeOutcome, { ok: true }>, inbound: NormalizedTelegramInbound, replyText: string): Promise<OperatorRouteResult> {
  const outbound = await persistCanonicalMessage({
    channel: "telegram",
    externalThreadId: inbound.externalThreadId,
    platformMessageId: `agent:${persisted.messageId}:${randomUUID()}`,
    direction: "outbound",
    senderKind: "agent",
    senderRef: "agent",
    contentType: "text",
    content: replyText,
    deliveryState: defaultDeliveryState({ channel: "telegram", direction: "outbound", senderKind: "agent" }),
    rawPayload: { inReplyTo: persisted.messageId },
  });
  return { persisted, replyText, replyMessageId: outbound.ok ? outbound.messageId : null };
}

function denialMessage(reason: "unbound" | "inactive" | "unauthorized"): string {
  switch (reason) {
    case "unbound":
      return "No autorizado. Tu cuenta de Telegram no está vinculada a un operador de AH Sports.";
    case "inactive":
      return "Tu usuario operador está inactivo. Contactá a administración.";
    default:
      return "No autorizado para usar el agente operativo.";
  }
}

async function handleConfirmCommand(persisted: Extract<IntakeOutcome, { ok: true }>, inbound: NormalizedTelegramInbound, token: string): Promise<OperatorRouteResult> {
  const executed = await executePendingAction(token);
  if (!executed.ok) return persistOutboundReply(persisted, inbound, executed.message);
  const result = executed.result;
  const summary = result && typeof result === "object" && "message" in result ? String((result as { message: unknown }).message) : JSON.stringify(result).slice(0, 800);
  return persistOutboundReply(persisted, inbound, `✅ Acción ejecutada.\n${summary}`);
}

/**
 * Full inbound pipeline: canonical intake → identity binding → deterministic
 * commands (confirm + slash) → operator AI loop → persisted outbound reply.
 */
export async function handleTelegramOperatorUpdate(inbound: NormalizedTelegramInbound): Promise<OperatorRouteResult> {
  const message: NormalizedMessage = {
    channel: "telegram",
    externalThreadId: inbound.externalThreadId,
    platformMessageId: inbound.platformMessageId,
    direction: "inbound",
    senderKind: "operator",
    senderRef: inbound.senderRef,
    contentType: inbound.contentType,
    content: inbound.content,
    rawPayload: inbound.rawPayload,
  };
  const persisted = await persistCanonicalMessage(message);
  if (!persisted.ok || persisted.duplicate) {
    return { persisted, replyText: null, replyMessageId: null };
  }

  const transportId = inbound.senderRef || inbound.externalThreadId;
  const identity = await resolveOperatorIdentity("telegram", transportId);
  if (!identity.authorized) {
    return persistOutboundReply(persisted, inbound, denialMessage(identity.reason));
  }

  const text = inbound.content.trim();

  // Deterministic confirmation release — never model-mediated.
  const confirmMatch = CONFIRM_PATTERN.exec(text);
  if (confirmMatch) {
    return handleConfirmCommand(persisted, inbound, confirmMatch[1]);
  }

  // Deterministic slash commands always answer without the model.
  if (SLASH_COMMAND.test(text)) {
    return persistOutboundReply(persisted, inbound, handleOperatorCommand({ text, identity: identity as AuthorizedOperator }));
  }

  try {
    const resolution = await resolveAgentRuntime();
    if (!resolution.configured) {
      return persistOutboundReply(persisted, inbound, handleOperatorCommand({ text, identity: identity as AuthorizedOperator }));
    }

    const runtime = resolution.runtime;
    const provider = createChatProvider(runtime);
    const history = await loadHistory(persisted.conversationId, persisted.messageId);

    const result = await runAgentLoop({
      provider,
      systemPrompt: buildOperatorSystemPrompt(),
      history,
      untrustedContent: inbound.content,
      tools: buildOperatorTools(),
      context: { conversationId: persisted.conversationId, actorRef: identity.userId },
      maxSteps: 10,
    });

    const replyText = result.content.trim() ? result.content : NO_RESPONSE_FALLBACK;
    return persistOutboundReply(persisted, inbound, replyText);
  } catch {
    // Runtime failure (unsupported provider, transport, history load): degrade
    // to the deterministic command set rather than dropping the operator.
    return persistOutboundReply(persisted, inbound, handleOperatorCommand({ text, identity: identity as AuthorizedOperator }));
  }
}
