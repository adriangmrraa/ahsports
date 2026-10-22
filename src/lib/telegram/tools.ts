import type { AgentTool } from "@/lib/agents/tools/types";
import { draftTools } from "@/lib/agents/tools/draft";
import { findMissingInfoTool, getConversationTool, lookupCustomerTool, lookupOrderTool, quotePreviewTool } from "@/lib/agents/tools/read";
import {
  cancelPendingActionTool,
  confirmActionTool,
  listPendingActionsTool,
} from "@/lib/telegram/confirmations";
import { orderMutationTools, orderReadTools } from "@/lib/telegram/tools-orders";
import { clientTools } from "@/lib/telegram/tools-clients";
import { productTools } from "@/lib/telegram/tools-products";
import { cashTools } from "@/lib/telegram/tools-cash";
import { analyticsTools } from "@/lib/telegram/tools-analytics";
import { broadcastTools } from "@/lib/telegram/tools-broadcast";
import { memoryTools } from "@/lib/telegram/tools-memory";

/**
 * Operator tool assembly.
 *
 * Composition:
 *  - wave-1 read/draft tools where the semantics are already identical
 *    (conversation view, missing-info heuristic, customer/order lookup, quote
 *    preview, lead/quote/order drafts — all already read-or-draft effects);
 *  - the new operator domain tools (orders, clients, catalog, caja, analytics,
 *    broadcast, memory) with the two-step gate / audit wrappers baked in;
 *  - the confirmation surface itself (confirm / cancel / list pending).
 *
 * Registration into `ALL_AGENT_TOOLS` is wave-3's job — the operator bot
 * builds its own set here and never touches the shared registry.
 */

const wave1SharedTools: readonly AgentTool[] = [
  getConversationTool,
  findMissingInfoTool,
  lookupOrderTool,
  lookupCustomerTool,
  quotePreviewTool,
  ...draftTools,
];

const confirmationSurface: readonly AgentTool[] = [confirmActionTool, cancelPendingActionTool, listPendingActionsTool];

export const OPERATOR_TOOLS: readonly AgentTool[] = [
  ...wave1SharedTools,
  ...orderReadTools,
  ...orderMutationTools,
  ...clientTools,
  ...productTools,
  ...cashTools,
  ...analyticsTools,
  ...broadcastTools,
  ...memoryTools,
  ...confirmationSurface,
];

export function buildOperatorTools(): AgentTool[] {
  return [...OPERATOR_TOOLS];
}

export function getOperatorTool(id: string): AgentTool | undefined {
  return OPERATOR_TOOLS.find((tool) => tool.id === id);
}
