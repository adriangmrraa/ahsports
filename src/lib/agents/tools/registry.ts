import "server-only";

import type { ToolSpec } from "@/lib/ai/provider";
import { draftTools } from "@/lib/agents/tools/draft";
import { readTools } from "@/lib/agents/tools/read";
import { AGENT_TOOL_EFFECTS, toToolSpec, type AgentTool } from "@/lib/agents/tools/types";
import { OPERATOR_TOOLS } from "@/lib/telegram/tools";
import { WHATSAPP_SALES_TOOLS } from "@/lib/whatsapp/sales-tools";

/**
 * Agent tool registry.
 *
 * `ALL_AGENT_TOOLS` is the closed set of tools the runtime can ever expose.
 * `resolveEnabledTools` intersects it with the DB `enabledTools` allowlist and
 * hard-filters to executable effects (`'read'` and `'draft'`): even a config
 * mistake can never expose a tool with an unknown effect.
 *
 * Wave-3 union: the wave-1 readers/drafters plus the wave-2 surfaces —
 * `OPERATOR_TOOLS` (Telegram operator bot: domain readers + gated mutations +
 * the confirmation surface) and `WHATSAPP_SALES_TOOLS` (customer-safe sales
 * tools). The reconcile reader set is already covered by those two unions; its
 * `reportReconcileCandidate` write path stays run-bound (it is built per run
 * with a `reportedIds` collector) and is exercised by `check:agent-tools` via
 * `buildReconcileTools` rather than living in this static registry.
 *
 * Ids collide across surfaces on purpose (`draftQuote`, `getProductDetail`,
 * `listTechniques`, the shared wave-1 readers re-exported by OPERATOR_TOOLS):
 * each surface keeps its own resolver/dispatcher, while the shared registry
 * dedupes first-wins — wave-1 then operator then sales — so `enabledTools`
 * can never resolve two specs to the same function name. The surface-specific
 * variants remain reachable through `buildOperatorTools()` and
 * `resolveWhatsAppSalesTools()` where their dispatchers actually run.
 */
const REGISTRY_SOURCES: readonly (readonly AgentTool[])[] = [
  readTools,
  draftTools,
  OPERATOR_TOOLS,
  WHATSAPP_SALES_TOOLS,
];

function dedupeById(sources: readonly (readonly AgentTool[])[]): AgentTool[] {
  const seen = new Set<string>();
  const out: AgentTool[] = [];
  for (const tools of sources) {
    for (const tool of tools) {
      if (seen.has(tool.id)) continue;
      seen.add(tool.id);
      out.push(tool);
    }
  }
  return out;
}

export const ALL_AGENT_TOOLS: readonly AgentTool[] = dedupeById(REGISTRY_SOURCES);

export function getAgentTool(id: string): AgentTool | undefined {
  return ALL_AGENT_TOOLS.find((tool) => tool.id === id);
}

export function resolveEnabledTools(enabledTools: readonly string[] | null | undefined): AgentTool[] {
  if (!enabledTools || enabledTools.length === 0) return [];
  const allowed = new Set(enabledTools);
  return ALL_AGENT_TOOLS.filter((tool) => allowed.has(tool.id) && AGENT_TOOL_EFFECTS.includes(tool.effect));
}

export function buildToolSpecs(tools: readonly AgentTool[]): ToolSpec[] {
  return tools.map(toToolSpec);
}
