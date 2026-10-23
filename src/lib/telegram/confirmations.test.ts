/**
 * Two-step operator CONFIRM gate (A-18).
 *
 * A high-impact tool call never mutates: it stores a pending action and tells
 * the operator to send `CONFIRM <token>`. Only `executePendingAction` runs the
 * inner handler, and it claims the token with an atomic DELETE...RETURNING:
 * single use, expiry-aware, re-validated args, unknown tools unreachable.
 * A model that echoes/invents a token (or re-calls the tool) cannot confirm.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { z } from "zod";

import { agentMemories, auditEvents } from "@/db/schema";
import type { AgentTool, AgentToolContext } from "@/lib/agents/tools/types";

import { FakeDb, installFakeDb, installModuleIntercepts } from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

const notifications: string[] = [];
installModuleIntercepts({
  "@/lib/telegram/notifier": () => ({
    notifyOperators: async (text: string) => {
      notifications.push(text);
      return { ok: true, delivered: 0, failed: 0 };
    },
  }),
});

const {
  executePendingAction,
  requestOperatorConfirmation,
  withOperatorConfirmation,
  confirmActionTool,
  cancelPendingActionTool,
  listPendingActionsTool,
  PENDING_CONFIRMATION_TTL_MS,
} = require("./confirmations") as typeof import("./confirmations");

const context: AgentToolContext = { actorRef: "operator-1" };

function makeInnerTool(): { tool: AgentTool<{ orderId: string }>; calls: () => number } {
  let calls = 0;
  const tool: AgentTool<{ orderId: string }> = {
    id: "cancelOrderFixture",
    description: "Cancela un pedido",
    effect: "draft",
    inputSchema: z.object({ orderId: z.string().min(1) }),
    async handler(input) {
      calls += 1;
      return { ok: true as const, cancelled: input.orderId };
    },
  };
  return { tool, calls: () => calls };
}

function pendingRow(value: unknown, expiresAt: Date | null = null) {
  return {
    id: "mem-seed",
    scope: "operator",
    key: "pending-confirm:abcdef1234",
    value,
    expiresAt,
    createdAt: new Date(),
  };
}

beforeEach(() => {
  fake.reset();
  notifications.length = 0;
});

describe("executePendingAction — token format is validated before any DB read", () => {
  it("rejects malformed tokens without touching the database", async () => {
    for (const token of ["", "abc", "zzzzzzzzzz", "abcdef12345", "abcdef123", " not-a-token "]) {
      const result = await executePendingAction(token);
      assert.equal(result.ok, false, token);
      if (!result.ok) assert.equal(result.error, "invalid_token", token);
    }
    assert.deepEqual(fake.writes, []);
  });

  it("rejects an unknown but well-formed token", async () => {
    const result = await executePendingAction("abcdef1234");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_token");
  });
});

describe("requestOperatorConfirmation — queue, never execute", () => {
  it("does NOT run the inner handler; it persists a pending row and returns a token", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = withOperatorConfirmation(tool);
    assert.match(wrapped.description, /REQUIERE confirmación humana/);

    const result = (await wrapped.handler({ orderId: "o-1" }, context)) as {
      pending: boolean;
      token: string;
      tool: string;
    };
    assert.equal(result.pending, true);
    assert.equal(result.tool, tool.id);
    assert.match(result.token, /^[0-9a-f]{10}$/);
    assert.equal(calls(), 0);

    const rows = fake.rows("agent_memories");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, `pending-confirm:${result.token}`);
    assert.equal(rows[0].expiresAt instanceof Date, true);
    assert.ok((rows[0].expiresAt as Date).getTime() > Date.now());
    assert.equal(
      (rows[0].expiresAt as Date).getTime() - Date.now() <= PENDING_CONFIRMATION_TTL_MS,
      true
    );

    // The out-of-band notice carries the CONFIRM instruction, never the args.
    assert.equal(notifications.length, 1);
    assert.match(notifications[0], new RegExp(`CONFIRM ${result.token}`));
  });

  it("a model-echoed/invented token cannot confirm anything", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = withOperatorConfirmation(tool);
    const pending = (await wrapped.handler({ orderId: "o-1" }, context)) as { token: string };

    const forged = await confirmActionTool.handler({ token: "deadbeef01" }, context);
    assert.deepEqual(forged, {
      ok: false,
      error: "invalid_token",
      message: "Token inválido o expirado. Pedí que la acción se vuelva a solicitar.",
    });
    assert.equal(calls(), 0);
    assert.equal(fake.rows("agent_memories").length, 1);
    assert.ok(pending.token.length === 10);
  });

  it("also queues (not executes) when called directly", async () => {
    const { tool, calls } = makeInnerTool();
    const result = await requestOperatorConfirmation({
      tool,
      args: { orderId: "o-2" },
      context,
      description: "cancelar pedido",
    });
    assert.equal(result.pending, true);
    assert.equal(calls(), 0);
  });
});

describe("executePendingAction — atomic single-use claim", () => {
  it("executes exactly once with re-validated args, then the token is gone", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = withOperatorConfirmation(tool);
    const { token } = (await wrapped.handler({ orderId: "o-1" }, context)) as { token: string };

    const first = await executePendingAction(token);
    assert.equal(first.ok, true);
    if (first.ok) assert.deepEqual(first.result, { ok: true, cancelled: "o-1" });
    assert.equal(calls(), 1);
    assert.equal(fake.rows("agent_memories").length, 0);

    const replay = await executePendingAction(token);
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.error, "invalid_token");
    assert.equal(calls(), 1, "a replayed token must never execute twice");
  });

  it("is case-insensitive on the token but still single-use", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = withOperatorConfirmation(tool);
    const { token } = (await wrapped.handler({ orderId: "o-1" }, context)) as { token: string };

    const result = await executePendingAction(token.toUpperCase());
    assert.equal(result.ok, true);
    assert.equal(calls(), 1);
    const replay = await executePendingAction(token);
    assert.equal(replay.ok, false);
  });

  it("refuses an expired pending action and consumes nothing else", async () => {
    fake.seed(agentMemories, [
      pendingRow(
        { toolId: "cancelOrderFixture", args: { orderId: "o-1" }, actorRef: null, requestedAt: new Date().toISOString() },
        new Date(Date.now() - 60_000)
      ),
    ]);
    const result = await executePendingAction("abcdef1234");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_token");
    // Expired rows are left for the pruner, not silently executed.
    assert.equal(fake.rows("agent_memories").length, 1);
  });

  it("never executes a tool id that was not registered as confirmable", async () => {
    fake.seed(agentMemories, [
      pendingRow({ toolId: "ghostTool", args: {}, actorRef: null, requestedAt: new Date().toISOString() }),
    ]);
    const result = await executePendingAction("abcdef1234");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unknown_tool");
  });

  it("re-validates args at execution time and refuses invalid ones", async () => {
    fake.seed(agentMemories, [
      pendingRow(
        { toolId: "cancelOrderFixture", args: { orderId: 42 }, actorRef: null, requestedAt: new Date().toISOString() },
        new Date(Date.now() + 60_000)
      ),
    ]);
    const { tool, calls } = makeInnerTool();
    withOperatorConfirmation(tool);
    const result = await executePendingAction("abcdef1234");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_args");
    assert.equal(calls(), 0);
    assert.ok(fake.rows("audit_events").some((entry) => entry.action === "agent.operator.denied"));
  });

  it("maps a throwing handler to handler_failed without leaking the error", async () => {
    const throwing: AgentTool<{ orderId: string }> = {
      id: "throwingFixture",
      description: "boom",
      effect: "draft",
      inputSchema: z.object({ orderId: z.string() }),
      async handler() {
        throw new Error("secret internal detail");
      },
    };
    withOperatorConfirmation(throwing);
    const pending = await requestOperatorConfirmation({
      tool: throwing,
      args: { orderId: "o-1" },
      context,
      description: "boom",
    });
    const result = await executePendingAction(pending.token);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "handler_failed");
    assert.ok(!JSON.stringify(result).includes("secret internal detail"));
  });
});

describe("cancelPendingAction / listPendingActions", () => {
  it("cancels a pending action so it can never execute", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = withOperatorConfirmation(tool);
    const { token } = (await wrapped.handler({ orderId: "o-1" }, context)) as { token: string };

    const cancelled = await cancelPendingActionTool.handler({ token }, context);
    assert.deepEqual(cancelled, { ok: true, cancelled: true });

    const result = await executePendingAction(token);
    assert.equal(result.ok, false);
    assert.equal(calls(), 0);
  });

  it("reports not_found for an unknown/cancelled token", async () => {
    const result = await cancelPendingActionTool.handler({ token: "abcdef1234" }, context);
    assert.deepEqual(result, {
      ok: false,
      error: "not_found",
      message: "No hay acción pendiente con ese token (o ya se ejecutó/expiró).",
    });
  });

  it("lists unexpired pending actions without exposing args", async () => {
    const { tool } = makeInnerTool();
    const wrapped = withOperatorConfirmation(tool);
    const { token } = (await wrapped.handler({ orderId: "o-secret" }, context)) as { token: string };

    const listed = (await listPendingActionsTool.handler({}, context)) as {
      ok: boolean;
      count: number;
      actions: Array<Record<string, unknown>>;
    };
    assert.equal(listed.ok, true);
    assert.equal(listed.count, 1);
    assert.equal(listed.actions[0].token, token);
    assert.equal(listed.actions[0].tool, tool.id);
    assert.equal(JSON.stringify(listed).includes("o-secret"), false);
  });
});
