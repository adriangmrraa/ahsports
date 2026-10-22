/**
 * Customer-facing WhatsApp sales agent — barrel exports.
 *
 * Import `register` for the side effect that installs the dispatcher on the
 * wave-1 inbound pipeline; the other exports are for tests/checks.
 */
export { registerWhatsAppSalesDispatcher } from "./register";
export { whatsappSalesDispatcher } from "./sales-agent";
export { WHATSAPP_SALES_TOOLS, resolveWhatsAppSalesTools } from "./sales-tools";
export { buildSalesSystemPrompt, formatPermittedSessionFacts } from "./prompt-builder";
export {
  persistSessionTransition,
  loadSessionState,
  loadSessionMetadata,
} from "./session-store";
export { updateSessionMetadataCAS } from "./session-metadata";
export { analyzeConversationState, classifyMessageType } from "./anti-loop";
export { isHumanOverrideActive, notifyHandoffOperators } from "./human-handoff";
export { buildTemporalAgentMessages, dedupeHistoryWithBuffered } from "./buffered-history";
export {
  classifyTurnIntent,
  planOrderCreation,
  evaluateOrderRecency,
  segmentHistoryByDay,
} from "./temporal-context";
export { detectInjection, sanitizePersistedField } from "./prompt-security";
export { getStatusSemantic, isActiveStatus, isTerminalStatus } from "./status-utils";
