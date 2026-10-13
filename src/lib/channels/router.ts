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
 * when it is not. WhatsApp inbound is the customer-facing sales channel: every
 * verified customer message is routed to the same AI loop (there is NO operator
 * identity binding) and the reply is persisted channel-aware so the caller can
 * deliver it. Every other channel/kind is persisted without a reply. Duplicates
 * never produce a second reply.
 */

export type RouteResult = {
  persisted: IntakeOutcome;
  replyText: string | null;
  replyMessageId: string | null;
};

/** A persisted fact handed in by a caller that already performed intake. */
export type PersistedInbound = Extract<IntakeOutcome, { ok: true }>;

export async function routeInboundMessage(
  message: NormalizedMessage,
  alreadyPersisted?: PersistedInbound,
): Promise<RouteResult> {
  const persisted = alreadyPersisted ?? (await persistCanonicalMessage(message));

  if (!persisted.ok || persisted.duplicate) {
    return { persisted, replyText: null, replyMessageId: null };
  }

  if (message.channel === "telegram" && message.direction === "inbound") {
    return routeTelegramOperator(persisted, message);
  }

  if (
    message.channel === "whatsapp" &&
    message.direction === "inbound" &&
    message.senderKind === "customer"
  ) {
    return routeWhatsAppCustomer(persisted, message);
  }

  return { persisted, replyText: null, replyMessageId: null };
}

/**
 * Telegram is the internal operator channel: resolve the sender identity, then
 * answer with the AI loop (authorized) or a denial, falling back to the
 * deterministic command set when the runtime is not configured.
 */
async function routeTelegramOperator(
  persisted: PersistedInbound,
  message: NormalizedMessage,
): Promise<RouteResult> {
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

/**
 * WhatsApp is the customer-facing sales channel. There is no operator identity
 * binding: every verified customer inbound is answered by the AI loop. When the
 * runtime is not configured we still answer politely instead of leaving the
 * customer unheard, and any runtime failure degrades to a safe message — the
 * webhook must never crash on a customer message.
 */
async function routeWhatsAppCustomer(
  persisted: PersistedInbound,
  message: NormalizedMessage,
): Promise<RouteResult> {
  try {
    const resolution = await resolveAgentRuntime();

    if (!resolution.configured) {
      return persistOutboundReply(persisted, message, WHATSAPP_NOT_CONFIGURED_REPLY);
    }

    const runtime = resolution.runtime;
    const provider = createChatProvider(runtime);
    const tools = resolveEnabledTools(runtime.enabledTools);

    const result = await runAgentLoop({
      provider,
      systemPrompt: runtime.systemPrompt,
      untrustedContent: message.content,
      tools,
      context: { conversationId: persisted.conversationId, actorRef: null },
    });

    const replyText = result.content.trim() ? result.content : NO_RESPONSE_FALLBACK;
    return persistOutboundReply(persisted, message, replyText);
  } catch {
    return persistOutboundReply(persisted, message, WHATSAPP_UNAVAILABLE_REPLY);
  }
}

const NO_RESPONSE_FALLBACK = "No pude generar una respuesta. Reintentá o contactá a administración.";
const WHATSAPP_NOT_CONFIGURED_REPLY =
  "Gracias por escribir a AH Sports. En breve un integrante del equipo te va a responder.";
const WHATSAPP_UNAVAILABLE_REPLY =
  "Estamos teniendo un problema para procesar tu mensaje. Un integrante del equipo te va a responder a la brevedad.";

async function persistOutboundReply(
  persisted: PersistedInbound,
  message: NormalizedMessage,
  replyText: string,
): Promise<RouteResult> {
  const channel = message.channel;
  const outbound = await persistCanonicalMessage({
    channel,
    externalThreadId: message.externalThreadId,
    platformMessageId: outboundPlatformId(persisted.messageId),
    direction: "outbound",
    senderKind: "agent",
    senderRef: "agent",
    contentType: "text",
    content: replyText,
    deliveryState: defaultDeliveryState({ channel, direction: "outbound", senderKind: "agent" }),
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
