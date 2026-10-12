import type { ToolSpec } from "@/lib/ai/provider";
import { readTools } from "@/lib/agents/tools/read";
import { toToolSpec, type AgentTool } from "@/lib/agents/tools/types";

/**
 * Agent tool registry.
 *
 * `ALL_AGENT_TOOLS` is the closed set of tools the runtime can ever expose.
 * `resolveEnabledTools` intersects it with the DB `enabledTools` allowlist and
 * additionally hard-filters to `effect: 'read'`: P2 is read-only, so even a
 * config mistake can never expose a mutating tool.
 */

export const ALL_AGENT_TOOLS: readonly AgentTool[] = [...readTools];

export function getAgentTool(id: string): AgentTool | undefined {
  return ALL_AGENT_TOOLS.find((tool) => tool.id === id);
}

export function resolveEnabledTools(enabledTools: readonly string[] | null | undefined): AgentTool[] {
  if (!enabledTools || enabledTools.length === 0) return [];
  const allowed = new Set(enabledTools);
  return ALL_AGENT_TOOLS.filter((tool) => allowed.has(tool.id) && tool.effect === "read");
}

export function buildToolSpecs(tools: readonly AgentTool[]): ToolSpec[] {
  return tools.map(toToolSpec);
}
