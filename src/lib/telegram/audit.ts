import "server-only";

import { db } from "@/db/client";
import { auditEvents, type AuditPayload } from "@/db/schema";
import type { AgentToolContext } from "@/lib/agents/tools/types";

/**
 * Insert-only audit trail for operator-tool mutations.
 *
 * No PII ever lands in `audit_events`: arguments are reduced to an opaque-id
 * allowlist (ids, statuses, amounts and flags) before they are recorded, so a
 * customer name, phone number or free-text note can never be replayed from
 * the audit row. The same filter feeds confirmation notifications.
 */

const ID_FIELD_PATTERN = /(^|[_.-])(id|ids)$/i;
const SAFE_ARG_KEYS = new Set([
  "status",
  "kind",
  "method",
  "amount",
  "number",
  "dryRun",
  "urgent",
  "active",
  "resolution",
  "audience",
  "filter",
  "limit",
  "quantity",
  "token",
]);

/** Reduces tool args to opaque ids + enum/number flags safe for audit rows. */
export function auditSafeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (ID_FIELD_PATTERN.test(key) || SAFE_ARG_KEYS.has(key)) {
      if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
        safe[key] = value;
      }
      continue;
    }
    if (Array.isArray(value) && /lines|items|sizeQuantities/.test(key)) {
      safe[key] = { count: value.length };
    }
  }
  return safe;
}

/** Best-effort entity id extraction from a tool result (never required). */
function extractEntityRef(result: unknown): { entityType?: string; entityId?: string } {
  if (!result || typeof result !== "object" || Array.isArray(result)) return {};
  const record = result as Record<string, unknown>;
  for (const key of ["orderId", "paymentId", "contactId", "productId", "organizationId", "candidateId"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 64) {
      return { entityType: key.replace(/Id$/, ""), entityId: value };
    }
  }
  return {};
}

export type OperatorAuditInput = {
  toolId: string;
  phase: "requested" | "executed" | "failed" | "denied";
  args?: unknown;
  context: AgentToolContext;
  result?: unknown;
  error?: string;
};

/**
 * Writes one `audit_events` row for an operator action. actorRef carries the
 * operator's user id (opaque), never a name. Failures are swallowed: audit
 * must never break the action it is recording.
 */
export async function auditOperatorAction(input: OperatorAuditInput): Promise<void> {
  try {
    const entity = input.result ? extractEntityRef(input.result) : {};
    const payload: AuditPayload = {
      after: {
        tool: input.toolId,
        phase: input.phase,
        args: auditSafeArgs(input.args),
      },
    };
    if (input.error) payload.error = input.error.slice(0, 200);
    await db.insert(auditEvents).values({
      action: `agent.operator.${input.phase}`,
      actorKind: "agent",
      actorRef: input.context.actorRef ?? null,
      entityType: entity.entityType ?? "tool",
      entityId: entity.entityId ?? input.toolId,
      correlationId: input.context.conversationId ?? null,
      payload,
    });
  } catch {
    // Audit must never surface secrets nor break the recorded action.
  }
}
