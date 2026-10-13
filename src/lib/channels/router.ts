import "server-only";

import { randomUUID } from "node:crypto";
import { persistCanonicalMessage, type IntakeOutcome } from "@/lib/channels/intake";
import { defaultDeliveryState, type NormalizedMessage } from "@/lib/channels/types";
import { handleOperatorCommand } from "@/lib/agents/commands";
import { resolveOperatorIdentity } from "@/lib/agent/identity";
import { resolveAgentRuntime } from "@/lib/ai/config";
import { createChatProvider } from "@/lib/ai/registry";
import { runAgentLoop } from "@/lib/agents/loop";
import { resolveEnabledTools } from "@/lib/agents/tools/registry";

/**
 * Normalized channel router.
 *
 * Persists the canonical fact first (idempotent), then dispatches by channel and
 * direction. Telegram inbound is the internal operator channel: the sender is
 * bound to an authorized identity and answered with the AI agent loop when the
 * runtime is configured, falling back to a safe, deterministic command reply
 * when it is not. Every other channel/kind is persisted without a reply.
 * Duplicates never produce a second reply.
 */

export type RouteResult = {
  persisted: IntakeOutcome;
  replyText: string | null;
  replyMessageId: string | null;
};

export async function routeInboundMessage(message: NormalizedMessage): Promise<RouteResult> {
  const persisted = await persistCanonicalMessage(message);

  if (!persisted.ok || persisted.duplicate) {
    return { persisted, replyText: null, replyMessageId: null };
  }

  if (message.channel !== "telegram" || message.direction !== "inbound") {
    return { persisted, replyText: null, replyMessageId: null };
  }

  const transportId = message.senderRef ?? message.externalThreadId;
  const identity = await resolveOperatorIdentity("telegram", transportId);

  if (!identity.authorized) {
    return persistOutboundReply(persisted, message, denialMessage(identity.reason));
  }

  try {
    const resolution = await resolveAgentRuntime();

    // Runtime not configured: keep the safe, deterministic command set.
    if (!resolution.configured) {
      return persistOutboundReply(
        persisted,
        message,
        handleOperatorCommand({ text: message.content, identity }),
      );
    }

    const runtime = resolution.runtime;
    const provider = createChatProvider(runtime);
    const tools = resolveEnabledTools(runtime.enabledTools);

    const result = await runAgentLoop({
      provider,
      systemPrompt: runtime.systemPrompt,
      untrustedContent: message.content,
      tools,
      context: { conversationId: persisted.conversationId, actorRef: identity.userId },
    });

    const replyText = result.content.trim() ? result.content : NO_RESPONSE_FALLBACK;
    return persistOutboundReply(persisted, message, replyText);
  } catch {
    // Unexpected runtime failure (e.g. unsupported provider): degrade to the
    // deterministic command set rather than surfacing an error to the operator.
    return persistOutboundReply(
      persisted,
      message,
      handleOperatorCommand({ text: message.content, identity }),
    );
  }
}

const NO_RESPONSE_FALLBACK = "No pude generar una respuesta. Reintentá o contactá a administración.";

async function persistOutboundReply(
  persisted: Extract<IntakeOutcome, { ok: true }>,
  message: NormalizedMessage,
  replyText: string,
): Promise<RouteResult> {
  const outbound = await persistCanonicalMessage({
    channel: "telegram",
    externalThreadId: message.externalThreadId,
    platformMessageId: outboundPlatformId(persisted.messageId),
    direction: "outbound",
    senderKind: "agent",
    senderRef: "agent",
    contentType: "text",
    content: replyText,
    deliveryState: defaultDeliveryState({
      channel: "telegram",
      direction: "outbound",
      senderKind: "agent",
    }),
    rawPayload: { inReplyTo: persisted.messageId },
  });

  return {
    persisted,
    replyText,
    replyMessageId: outbound.ok ? outbound.messageId : null,
  };
}

/** Synthetic provider id for an agent-authored outbound persisted before send. */
function outboundPlatformId(inReplyTo: string): string {
  return `agent:${inReplyTo}:${randomUUID()}`;
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
