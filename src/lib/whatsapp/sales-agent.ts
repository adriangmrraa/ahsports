/**
 * Customer WhatsApp sales dispatcher — the seam between the wave-1 inbound
 * pipeline and the ported SocialCRM sales-agent behavior.
 *
 * The pipeline owns transport concerns (signature, dedup, echo suppression,
 * debounce/burst batching, retryable persistence). This module owns the turn
 * policy: session boundary (persist-or-fail-closed), scoped config, layered
 * prompt, the hardened read/draft tool set, canonical outbound persistence
 * and delivery through the messenger facade.
 *
 * Ported behaviors (adapted, documented per-module):
 *  - boundary session policy + at-most-once claims (session-store),
 *  - fixed ack/clarification replies gated by AI-enabled delivery,
 *  - anti-loop + non-commercial directives (anti-loop),
 *  - temporal day segmentation + turn-intent guard (temporal-context),
 *  - server-side identity + re-priced quote/order tools (sales-tools),
 *  - idempotent human handoff (human-handoff),
 *  - 24h customer-service window gating (outbound-window): outside the window
 *    the reply goes through the configured fallback template; with no
 *    template configured the text send is attempted and the outcome recorded
 *    honestly on the canonical outbound fact.
 *
 * Media downloads/uploads remain out of scope (the media pipeline belongs to
 * another wave).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, conversations, orders, products, promotions, techniques } from "@/db/schema";
import {
  defaultInboundTurnDispatcher,
  type InboundTurn,
  type InboundTurnDispatcher,
} from "@/lib/messaging/inbound-pipeline";
import { messenger } from "@/lib/messaging/messenger";
import { persistAgentOutbound, updateMessageDelivery } from "@/lib/channels/intake";
import {
  resolveAgentConfigStrict,
  resolveScopeForConversation,
  runWithAgentConfigScope,
  type AgentConfigScope,
} from "@/lib/channels/agent-config-scope";
import { resolveRuntimeFromConfig, type ResolvedAgentRuntime } from "@/lib/ai/config";
import { createChatProvider } from "@/lib/ai/registry";
import { runAgentLoop, type AgentLoopResult } from "@/lib/agents/loop";
import type { ChatMessage } from "@/lib/ai/provider";
import { persistSessionTransition } from "./session-store";
import { toSessionContext, type ConversationSessionState } from "./session-policy";
import { analyzeConversationState, classifyMessageType } from "./anti-loop";
import { updateSessionMetadataCAS } from "./session-metadata";
import { isHumanOverrideActive } from "./human-handoff";
import { loadConversationHistory } from "./history";
import { buildTemporalAgentMessages } from "./buffered-history";
import { buildSalesSystemPrompt, type CustomerPromptContext } from "./prompt-builder";
import { buildWebOrderRedirectMessage, buildWebOrderUrl } from "./web-order-redirect";
import {
  classifyTurnIntent,
  evaluateOrderRecency,
  OPEN_ORDER_STATUSES,
} from "./temporal-context";
import { getStatusSemantic } from "./status-utils";
import { resolveWhatsAppSalesTools } from "./sales-tools";
import { decideCustomerWindowSend } from "./outbound-window";

// ─── Fixed replies (es-AR, customer-facing) ──────────────────────────────────

export const FIXED_ACK_REPLY =
  "¡Hola! ¿Todo bien? Cuando necesites prendas o un presupuesto, avisame.";
export const FIXED_CLARIFICATION_REPLY =
  "¿Me contás qué necesitás? Puedo cotizar prendas, mostrarte técnicas y talles, o ver el estado de tu pedido.";
export const NO_RESPONSE_REPLY = "¿Me repetís eso? No te entendí bien.";
export const UNAVAILABLE_REPLY =
  "Estoy con un problema técnico para responderte ahora. Un integrante del equipo te va a contactar a la brevedad.";

const TEMPORAL_DIRECTIVE =
  "⏱️ CONTEXTO TEMPORAL: HOY es el único día válido para la cotización o pedido actual. " +
  "Los mensajes etiquetados [DD/MM HH:mm] son de días previos (histórico SECUNDARIO): " +
  "NUNCA armes, reconstruyas ni ofrezcas un pedido basándote en ellos.";

const NON_COMMERCIAL_FIRST =
  "🚫 NO COMERCIAL: Este mensaje no parece ser sobre el negocio. Respondé amable algo breve " +
  "SIN ofrecer catálogo, SIN arrancar flujo de venta, SIN preguntar qué quiere.";

const NON_COMMERCIAL_HANDOFF =
  "🚫 NO COMERCIAL REITERADO: el cliente manda varios mensajes seguidos sin intención comercial. " +
  "Respondé amable que una persona del equipo lo va a atender y ejecutá transferToHuman.";

// ─── Customer context (server-derived, sanitized downstream) ────────────────

async function loadCustomerPromptContext(conversationId: string): Promise<{
  context: CustomerPromptContext;
  hasActiveOrder: boolean;
  contactId: string | null;
  channelAccountId: string | null;
}> {
  const [conv] = await db
    .select({
      customerId: conversations.customerId,
      organizationId: conversations.organizationId,
      channelAccountId: conversations.channelAccountId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  let customerName: string | undefined;
  if (conv?.customerId) {
    const [contact] = await db
      .select({ name: contacts.name })
      .from(contacts)
      .where(eq(contacts.id, conv.customerId))
      .limit(1);
    customerName = contact?.name ?? undefined;
  }

  let openOrder: CustomerPromptContext["openOrder"];
  let hasActiveOrder = false;
  if (conv?.customerId) {
    const [candidate] = await db
      .select({ id: orders.id, number: orders.number, status: orders.status, createdAt: orders.createdAt })
      .from(orders)
      .where(
        and(
          eq(orders.contactId, conv.customerId),
          inArray(orders.status, [...OPEN_ORDER_STATUSES]),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(1);
    if (candidate) {
      hasActiveOrder = true;
      const recency = evaluateOrderRecency({ activeOrder: candidate });
      openOrder = {
        number: candidate.number,
        status: candidate.status,
        semantic: getStatusSemantic(candidate.status),
        recent: recency === "recent",
      };
    }
  }

  return {
    context: { name: customerName, openOrder },
    hasActiveOrder,
    contactId: conv?.customerId ?? null,
    channelAccountId: conv?.channelAccountId ?? null,
  };
}

/** Compact catalog layer: names only — prices are never injected. */
async function loadCatalogSummary(): Promise<string | null> {
  const [rows, techs, promos] = await Promise.all([
    db
      .select({ name: products.name, garmentType: products.garmentType, minOrder: products.minOrder })
      .from(products)
      .where(eq(products.active, true))
      .limit(40),
    db
      .select({ name: techniques.name })
      .from(techniques)
      .where(eq(techniques.active, true))
      .limit(12),
    // A-14: active promotion NAMES only — content/price detail goes through
    // the getPromotions tool so the prompt never becomes a price channel.
    db
      .select({ name: promotions.name })
      .from(promotions)
      .where(eq(promotions.active, true))
      .limit(8),
  ]);
  if (rows.length === 0) return null;
  const productLines = rows.map(
    (row) => `- ${row.name}${row.garmentType ? ` (${row.garmentType})` : ""} — mínimo ${row.minOrder}`,
  );
  const techLine = techs.length > 0 ? `Técnicas: ${techs.map((t) => t.name).join(", ")}` : null;
  const promoLine = promos.length > 0 ? `Promos activas (detalle con getPromotions): ${promos.map((p) => p.name).join(", ")}` : null;
  return [...productLines, ...(techLine ? [techLine] : []), ...(promoLine ? [promoLine] : [])].join("\n");
}

// ─── Outbound delivery ───────────────────────────────────────────────────────

async function deliverAgentReply(
  turn: InboundTurn,
  content: string,
  inReplyTo: string | undefined,
  channelAccountId: string | null,
  contactId: string | null,
): Promise<void> {
  // F-02: inside the 24h customer window a free-form text reply is valid;
  // outside it only an approved template is deliverable. A settings/DB hiccup
  // never blocks the reply — it degrades to the text path.
  const windowDecision = await decideCustomerWindowSend(turn.conversationId).catch(
    () => ({ kind: "text" as const, windowOpen: true as const }),
  );
  const sendAsTemplate = windowDecision.kind === "template";
  const windowClosedWithoutTemplate =
    windowDecision.kind === "text" && !windowDecision.windowOpen;

  const persisted = await persistAgentOutbound({
    channel: "whatsapp",
    channelAccountId: channelAccountId ?? undefined,
    externalThreadId: turn.externalThreadId,
    platformMessageId: `agent:${inReplyTo ?? turn.conversationId}:${randomUUID()}`,
    senderRef: "whatsapp-sales-agent",
    contentType: "text",
    content: content.slice(0, 20000),
    deliveryState: "queued",
    customerId: contactId ?? undefined,
    rawPayload: {
      inReplyTo: inReplyToMessageIdOrNull(inReplyTo),
      ...(sendAsTemplate
        ? { sentAs: "template", template: windowDecision.template }
        : {}),
      ...(windowClosedWithoutTemplate
        ? { windowClosed: true, templateFallback: "not_configured" }
        : {}),
    },
  });
  if (!persisted.ok) {
    // Fail closed like the router path: a reply that cannot be persisted is
    // not sent — an invisible reply is worse than a retryable silence.
    console.warn("[whatsapp/sales-agent] outbound persist failed — reply suppressed", {
      conversationId: turn.conversationId,
    });
    return;
  }
  const send = await messenger.send(
    sendAsTemplate
      ? {
          to: turn.to,
          type: "template",
          template: windowDecision.template,
          ...(turn.providerConversationId
            ? { providerConversationId: turn.providerConversationId }
            : {}),
          idempotencyKey: `wa-reply:${persisted.messageId}`,
        }
      : {
          to: turn.to,
          type: "text",
          text: content,
          ...(turn.providerConversationId
            ? { providerConversationId: turn.providerConversationId }
            : {}),
          idempotencyKey: `wa-reply:${persisted.messageId}`,
        },
    turn.account ? { channel: "whatsapp", account: turn.account } : { channel: "whatsapp" },
  );
  await updateMessageDelivery(persisted.messageId, send.ok ? "sent" : "failed");
  if (windowClosedWithoutTemplate) {
    console.warn(
      `[whatsapp/sales-agent] 24h window closed and wa_template_fallback is not configured — text reply attempted, delivery may be rejected — conversation=${turn.conversationId}`,
    );
  }
  if (!send.ok) {
    console.warn(
      `[whatsapp/sales-agent] reply send failed — retryable=${send.retryable} conversation=${turn.conversationId}: ${send.error}`,
    );
  }
}

function inReplyToMessageIdOrNull(value: string | undefined): string | null {
  return value ?? null;
}

/**
 * A-08: exposes /presupuesto to the agent only when the scope enables the
 * redirect AND a link or an owner message exists to offer. The wizard stays
 * informational — the agent never creates an operational order from it.
 */
function webOrderRedirectFor(
  row: { webOrderRedirectEnabled?: boolean; webOrderRedirectMessage?: string | null } | null,
): { url: string; message: string } | null {
  if (row?.webOrderRedirectEnabled !== true) return null;
  const url = buildWebOrderUrl();
  const message = buildWebOrderRedirectMessage(row);
  if (!url && !message.trim()) return null;
  return { url: url ?? "", message };
}

function pickReply(result: AgentLoopResult): string {
  if (result.status === "completed") {
    const text = result.content.trim();
    return text.length > 0 ? text : NO_RESPONSE_REPLY;
  }
  return UNAVAILABLE_REPLY;
}

// ─── Turn execution ──────────────────────────────────────────────────────────

async function runAgentTurn(
  turn: InboundTurn,
  text: string,
  state: ConversationSessionState,
  runtime: ResolvedAgentRuntime,
  configExtras: string | null,
  enabledTools: string[] | null,
  scope: AgentConfigScope,
  webOrderRedirect: { url: string; message: string } | null,
): Promise<void> {
  const conversationId = turn.conversationId;
  const lastBuffered = turn.messages[turn.messages.length - 1];

  const history = await loadConversationHistory(conversationId);
  const customer = await loadCustomerPromptContext(conversationId);

  let antiLoopDirective = "";
  try {
    const analysis = await analyzeConversationState(conversationId, text, []);
    antiLoopDirective = analysis.directive;
  } catch {
    // non-fatal — metadata persistence is best-effort.
  }

  // Non-commercial two-in-a-row escalates toward a human handoff.
  let nonCommercialDirective = "";
  if (classifyMessageType(text) === "non_commercial") {
    const prevUser = [...history].reverse().find((entry) => entry.role === "user");
    const prevWasNonCommercial =
      prevUser !== undefined && classifyMessageType(prevUser.content) === "non_commercial";
    nonCommercialDirective = prevWasNonCommercial ? NON_COMMERCIAL_HANDOFF : NON_COMMERCIAL_FIRST;
  }

  const turnIntent = classifyTurnIntent(text);
  const sessionContext = toSessionContext(state);
  const catalogSummary = await loadCatalogSummary().catch(() => null);

  const systemPrompt = buildSalesSystemPrompt({
    configExtras,
    catalogSummary,
    customer: customer.context,
    sessionContext,
    antiLoopDirective,
    nonCommercialDirective,
    temporalDirective: TEMPORAL_DIRECTIVE,
    webOrderRedirect,
    turnIntent,
  });

  const segmented = buildTemporalAgentMessages(history, turn.messages);
  const historyForLoop: ChatMessage[] =
    segmented.length > 0 && segmented[segmented.length - 1].role === "user"
      ? segmented.slice(0, -1)
      : segmented;

  const tools = resolveWhatsAppSalesTools(enabledTools);
  const provider = createChatProvider(runtime);

  const result = await runAgentLoop({
    provider,
    systemPrompt,
    history: historyForLoop,
    untrustedContent: text,
    tools,
    context: { conversationId, actorRef: "whatsapp-sales-agent" },
    maxSteps: 8,
  });

  // Record the executed tool names for next-turn anti-loop context.
  if (result.toolCalls.length > 0) {
    const names = result.toolCalls.map((call) => call.name);
    updateSessionMetadataCAS(conversationId, (current) => ({ ...current, lastTools: names })).catch(() => {});
  }

  const reply = pickReply(result);
  await deliverAgentReply(
    turn,
    reply,
    lastBuffered?.messageId,
    customer.channelAccountId ?? scope.channelAccountId ?? null,
    customer.contactId,
  );
}

async function dispatchSalesTurn(
  turn: InboundTurn,
  text: string,
  scope: AgentConfigScope,
): Promise<void> {
  const conversationId = turn.conversationId;
  const lastBuffered = turn.messages[turn.messages.length - 1];

  // Scoped config — db errors are retryable: throw so the buffer re-enqueues.
  const resolution = await resolveAgentConfigStrict(scope);
  if (resolution.kind === "db-error") {
    throw new Error("whatsapp/sales-agent: agent_config resolution failed (retryable)");
  }
  const row = resolution.kind === "resolved" ? resolution.row : null;
  // G-01 kill-switch: a disabled scope still ingests inbound (persisted
  // upstream) but produces no reply. `undefined` (pre-migration row) is ON.
  if (row?.enabled === false) return;
  const runtimeResolution = resolveRuntimeFromConfig(
    row
      ? {
          provider: row.provider,
          model: row.model,
          systemPrompt: row.systemPrompt,
          enabledTools: row.enabledTools,
        }
      : null,
  );
  const aiEnabled = runtimeResolution.configured;

  // Session boundary — throws on dedup/CAS failure (fail closed, no output).
  const hasHumanOverride = await isHumanOverrideActive(conversationId);
  const customer = await loadCustomerPromptContext(conversationId);
  const decision = await persistSessionTransition({
    conversationId,
    messageId: lastBuffered?.messageId ?? `turn:${conversationId}:${Date.now()}`,
    text,
    messageType: "text",
    aiEnabled,
    hasHumanOverride,
    hasActiveOrder: customer.hasActiveOrder,
  });

  switch (decision.kind) {
    case "duplicate":
    case "blocked":
      return;
    case "fixed_ack":
      if (decision.delivery === "allowed") {
        await deliverAgentReply(
          turn,
          FIXED_ACK_REPLY,
          lastBuffered?.messageId,
          customer.channelAccountId ?? scope.channelAccountId ?? null,
          customer.contactId,
        );
      }
      return;
    case "fixed_clarification":
      if (decision.delivery === "allowed") {
        await deliverAgentReply(
          turn,
          FIXED_CLARIFICATION_REPLY,
          lastBuffered?.messageId,
          customer.channelAccountId ?? scope.channelAccountId ?? null,
          customer.contactId,
        );
      }
      return;
    case "allow_agent":
      // Session already persisted; an unconfigured AI stays silent (ported
      // delivery="suppressed" semantics) rather than improvising.
      if (!runtimeResolution.configured) return;
      await runAgentTurn(
        turn,
        text,
        decision.state,
        runtimeResolution.runtime,
        row?.systemPrompt ?? null,
        row?.enabledTools ?? null,
        scope,
        webOrderRedirectFor(row),
      );
      return;
  }
}

/**
 * The dispatcher installed via `setInboundTurnDispatcher`. WhatsApp turns run
 * the sales pipeline; any other channel falls back to the wave-1 default.
 */
export const whatsappSalesDispatcher: InboundTurnDispatcher = {
  async dispatch(turn: InboundTurn): Promise<void> {
    if (turn.channel !== "whatsapp") {
      return defaultInboundTurnDispatcher.dispatch(turn);
    }
    const text = turn.messages
      .map((message) => message.content)
      .filter((content) => content.trim().length > 0)
      .join("\n\n")
      .trim();
    if (!text) return;

    const scope = await resolveScopeForConversation(turn.conversationId);
    return runWithAgentConfigScope(scope, () => dispatchSalesTurn(turn, text, scope));
  },
};
