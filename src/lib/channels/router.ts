import "server-only";

import { randomUUID } from "node:crypto";
import { persistCanonicalMessage, type IntakeOutcome } from "@/lib/channels/intake";
import { defaultDeliveryState, type NormalizedMessage } from "@/lib/channels/types";
import { handleOperatorCommand } from "@/lib/agents/commands";
import { resolveOperatorIdentity } from "@/lib/agent/identity";

/**
 * Normalized channel router.
 *
 * Persists the canonical fact first (idempotent), then dispatches by channel and
 * direction. Telegram inbound is the internal operator channel: the sender is
 * bound to an authorized identity and answered with a safe, deterministic
 * command reply. Every other channel/kind is persisted without a reply until the
 * AI runtime (P2) lands. Duplicates never produce a second reply.
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

  const replyText = identity.authorized
    ? handleOperatorCommand({ text: message.content, identity })
    : denialMessage(identity.reason);

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
