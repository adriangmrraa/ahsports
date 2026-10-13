import type { ToolSpec } from "@/lib/ai/provider";
import { draftTools } from "@/lib/agents/tools/draft";
import { readTools } from "@/lib/agents/tools/read";
import { AGENT_TOOL_EFFECTS, toToolSpec, type AgentTool } from "@/lib/agents/tools/types";

/**
 * Agent tool registry.
 *
 * `ALL_AGENT_TOOLS` is the closed set of tools the runtime can ever expose.
 * `resolveEnabledTools` intersects it with the DB `enabledTools` allowlist and
 * hard-filters to executable effects (`'read'` and `'draft'`): even a config
 * mistake can never expose a tool with an unknown effect.
 */

export const ALL_AGENT_TOOLS: readonly AgentTool[] = [...readTools, ...draftTools];

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
