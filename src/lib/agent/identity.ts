import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentMemories, users } from "@/db/schema";
import { AGENT_ADMIN_ROLES, type AgentAdminRole } from "@/lib/agent/rbac";

/**
 * Internal-agent sender binding.
 *
 * Binds a verified transport sender (Telegram chat/user id) to an authorized
 * internal identity. The binding is stored in the generic `agent_memories` KV
 * (scope `operator`) so P1 needs no new table; only bound, active users whose
 * role is in the agent-admin allowlist are authorized.
 */

export const OPERATOR_BINDING_SCOPE = "operator" as const;

export function operatorBindingKey(channel: string, transportId: string): string {
  return `${channel}:${transportId}`.slice(0, 255);
}

export type AuthorizedOperator = {
  authorized: true;
  userId: string;
  name: string;
  role: AgentAdminRole;
};

export type OperatorIdentity =
  | AuthorizedOperator
  | { authorized: false; reason: "unbound" | "inactive" | "unauthorized" };

export async function resolveOperatorIdentity(
  channel: string,
  transportId: string,
): Promise<OperatorIdentity> {
  const key = operatorBindingKey(channel, transportId);
  const [memory] = await db
    .select({ value: agentMemories.value })
    .from(agentMemories)
    .where(and(eq(agentMemories.scope, OPERATOR_BINDING_SCOPE), eq(agentMemories.key, key)))
    .limit(1);

  const boundUserId = typeof memory?.value?.userId === "string" ? memory.value.userId : null;
  if (!boundUserId) return { authorized: false, reason: "unbound" };

  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, boundUserId))
    .limit(1);

  if (!user || !user.active) return { authorized: false, reason: "inactive" };
  if (!AGENT_ADMIN_ROLES.includes(user.role as AgentAdminRole)) {
    return { authorized: false, reason: "unauthorized" };
  }

  return { authorized: true, userId: user.id, name: user.name, role: user.role as AgentAdminRole };
}

/**
 * Creates or updates a sender binding. Wired to the admin surface in a later
 * work unit; exposed here so the binding contract has a single owner.
 */
export async function bindOperatorIdentity(
  channel: string,
  transportId: string,
  userId: string,
): Promise<void> {
  const key = operatorBindingKey(channel, transportId);
  await db
    .insert(agentMemories)
    .values({ scope: OPERATOR_BINDING_SCOPE, key, value: { userId } })
    .onConflictDoUpdate({
      target: [agentMemories.scope, agentMemories.key],
      set: { value: { userId } },
    });
}
