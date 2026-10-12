import { z } from "zod";
import type { ToolSpec } from "@/lib/ai/provider";
import { zodToParameters } from "@/lib/agents/tools/schema";

/**
 * Agent tool contract.
 *
 * Every tool validates its (model-supplied, therefore untrusted) arguments with
 * a Zod `inputSchema` before execution. `effect` gates side effects: the loop
 * only ever executes `'read'` and `'draft'` tools. `'draft'` handlers may write
 * reversible, non-authoritative state (e.g. `borrador` orders) but never
 * finalize, charge or advance production.
 */

export type AgentToolEffect = "read" | "draft";

/** Effects the loop is allowed to execute. Anything else is refused. */
export const AGENT_TOOL_EFFECTS: readonly AgentToolEffect[] = ["read", "draft"];

export type AgentToolContext = {
  /** Trusted, server-derived correlation; never model-supplied. */
  conversationId?: string;
  actorRef?: string | null;
};

export type AgentTool<TInput = unknown, TOutput = unknown> = {
  id: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  effect: AgentToolEffect;
  // Method shorthand keeps the handler parameter bivariant, so heterogeneous
  // tools can be stored in one `AgentTool[]` registry without variance errors.
  handler(input: TInput, context: AgentToolContext): Promise<TOutput>;
};

/** Projects a tool's Zod schema into the provider-facing spec. */
export function toToolSpec(tool: AgentTool): ToolSpec {
  return {
    name: tool.id,
    description: tool.description,
    parameters: zodToParameters(tool.inputSchema as z.ZodObject<z.ZodRawShape>),
  };
}
