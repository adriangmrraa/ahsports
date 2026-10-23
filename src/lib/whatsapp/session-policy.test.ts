/**
 * Session boundary machine (A-18).
 *
 * The boundary policy decides, per inbound message, whether the commercial
 * agent runs, a fixed reply goes out at most once, or the conversation is
 * blocked. It is deterministic and repository-independent — the repository
 * only persists the decision.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSessionContext,
  classifyBoundary,
  createInitialSessionState,
  SessionPolicyService,
  toSessionContext,
  transitionSession,
  type BoundarySignal,
  type ConversationSessionState,
  type RoutingDecision,
  type SessionEventType,
  type SessionPolicyInput,
  type SessionPolicyRepository,
} from "./session-policy";

const CONV = "11111111-1111-1111-1111-111111111111";

function input(overrides: Partial<SessionPolicyInput> = {}): SessionPolicyInput {
  return { signal: "commercial", messageId: "msg-1", delivery: "allowed", ...overrides };
}

describe("classifyBoundary", () => {
  it("treats any text with an active order as commercial", () => {
    assert.equal(classifyBoundary({ text: "hola", messageType: "text", hasActiveOrder: true }), "commercial");
  });

  it("detects textile/commercial vocabulary", () => {
    for (const text of [
      "quiero cotizar remeras",
      "pasame precios",
      "necesito talles M y L",
      "hacen sublimado?",
      "cuál es el plazo de entrega",
    ]) {
      assert.equal(classifyBoundary({ text, messageType: "text", hasActiveOrder: false }), "commercial", text);
    }
  });

  it("detects personal small talk only on text messages", () => {
    assert.equal(classifyBoundary({ text: "gracias, todo bien", messageType: "text", hasActiveOrder: false }), "personal");
    assert.equal(classifyBoundary({ text: "gracias", messageType: "image", hasActiveOrder: false }), "ambiguous");
  });

  it("falls back to ambiguous", () => {
    assert.equal(classifyBoundary({ text: "mmm", messageType: "text", hasActiveOrder: false }), "ambiguous");
  });
});

describe("transitionSession — commercial intent always reaches the agent", () => {
  it("allows the agent and resets the fixed-reply flags", () => {
    const state = { ...createInitialSessionState(CONV), ackSent: true, mode: "personal_acknowledged" as const };
    const decision = transitionSession(state, input());
    assert.equal(decision.kind, "allow_agent");
    assert.equal(decision.eventType, "commercial_detected");
    assert.equal(decision.state.ackSent, false);
    assert.equal(decision.state.clarificationSent, false);
    assert.equal(decision.state.mode, "commercial");
    // A prior fixed reply closes the episode.
    assert.equal(decision.state.episode, 1);
  });

  it("revives a handed_off conversation instead of keeping it dead", () => {
    const state = { ...createInitialSessionState(CONV), mode: "handed_off" as const };
    const decision = transitionSession(state, input());
    assert.equal(decision.kind, "allow_agent");
    assert.equal(decision.state.mode, "commercial");
  });

  it("does not bump the episode when no fixed reply was sent", () => {
    const decision = transitionSession(createInitialSessionState(CONV), input());
    assert.equal(decision.state.episode, 0);
    assert.equal(decision.state.version, 1);
  });
});

describe("transitionSession — at most one fixed reply per episode", () => {
  it("sends exactly one fixed ack for personal small talk, then routes to the agent", () => {
    const first = transitionSession(createInitialSessionState(CONV), input({ signal: "personal" }));
    assert.equal(first.kind, "fixed_ack");
    assert.equal(first.eventType, "personal_acknowledged");
    if (first.kind !== "fixed_ack") return;
    assert.equal(first.delivery, "allowed");
    assert.equal(first.state.ackSent, true);
    assert.equal(first.state.mode, "personal_acknowledged");

    const second = transitionSession(first.state, input({ signal: "personal", messageId: "msg-2" }));
    assert.equal(second.kind, "allow_agent");
    assert.equal(second.eventType, "commercial_detected");
  });

  it("sends exactly one fixed clarification for ambiguous first contact", () => {
    const first = transitionSession(createInitialSessionState(CONV), input({ signal: "ambiguous" }));
    assert.equal(first.kind, "fixed_clarification");
    assert.equal(first.eventType, "ambiguous_clarified");
    if (first.kind !== "fixed_clarification") return;
    assert.equal(first.state.clarificationSent, true);

    const second = transitionSession(first.state, input({ signal: "ambiguous", messageId: "msg-2" }));
    assert.equal(second.kind, "allow_agent");
  });

  it("propagates delivery=suppressed so a fixed reply is claimed but not delivered", () => {
    const decision = transitionSession(
      createInitialSessionState(CONV),
      input({ signal: "personal", delivery: "suppressed" })
    );
    assert.equal(decision.kind, "fixed_ack");
    if (decision.kind === "fixed_ack") assert.equal(decision.delivery, "suppressed");
  });

  it("suppresses the clarification too when delivery is suppressed", () => {
    const decision = transitionSession(
      createInitialSessionState(CONV),
      input({ signal: "ambiguous", delivery: "suppressed" })
    );
    assert.equal(decision.kind, "fixed_clarification");
    if (decision.kind === "fixed_clarification") assert.equal(decision.delivery, "suppressed");
  });
});

describe("transitionSession — human override blocks everything", () => {
  it("blocks even commercial intent with reason=override", () => {
    const state = createInitialSessionState(CONV);
    const decision = transitionSession(state, input({ hasHumanOverride: true }));
    assert.equal(decision.kind, "blocked");
    if (decision.kind === "blocked") assert.equal(decision.reason, "override");
    // Blocked decisions never mutate/bump the state.
    assert.equal(decision.state, state);
  });
});

describe("applyCommercialFacts via transitionSession", () => {
  it("carries permitted commercial facts into the next state", () => {
    const decision = transitionSession(
      createInitialSessionState(CONV),
      input({
        commercialFacts: {
          intent: "quote",
          pendingQuestion: "quantity",
          hasActiveOrder: true,
          activeOrderId: "order-1",
          recentAssetKinds: ["image"],
        },
      })
    );
    assert.equal(decision.state.commercialIntent, "quote");
    assert.equal(decision.state.pendingQuestion, "quantity");
    assert.equal(decision.state.hasActiveOrder, true);
    assert.equal(decision.state.activeOrderId, "order-1");
    assert.deepEqual(decision.state.recentAssetKinds, ["image"]);
  });

  it("ignores non-permitted fact keys instead of ingesting them", () => {
    const decision = transitionSession(
      createInitialSessionState(CONV),
      input({ commercialFacts: { phone: "5493704000000" } as never })
    );
    assert.equal(decision.kind, "allow_agent");
    // Extra keys never enter the compact session context.
    assert.equal(decision.state.commercialIntent, null);
    assert.equal(Object.hasOwn(decision.state, "phone"), false);
  });
});

describe("assertSessionContext", () => {
  it("rejects non-objects and unknown keys", () => {
    assert.throws(() => assertSessionContext(null), /not permitted/);
    assert.throws(() => assertSessionContext([]), /not permitted/);
    assert.throws(() => assertSessionContext({ phone: "123" }), /phone is not permitted/);
  });

  it("rejects wrong field types", () => {
    assert.throws(() => assertSessionContext({ hasActiveOrder: "yes" }), /not permitted/);
    assert.throws(() => assertSessionContext({ recentAssetKinds: ["image", 3] }), /not permitted/);
  });

  it("drops undefined fields", () => {
    assert.deepEqual(assertSessionContext({ commercialIntent: undefined, hasActiveOrder: false }), {
      hasActiveOrder: false,
    } as unknown as ReturnType<typeof assertSessionContext>);
  });

  it("toSessionContext exposes only the permitted compact references", () => {
    const context = toSessionContext({
      ...createInitialSessionState(CONV),
      commercialIntent: "order",
      recentAssetKinds: ["image", "audio"],
    });
    assert.deepEqual(Object.keys(context).sort(), [
      "commercialIntent",
      "hasActiveOrder",
      "hasAddressReference",
      "recentAssetKinds",
    ]);
  });
});

// ─── Service orchestration (repository seam) ────────────────────────────────

class MemorySessionRepository implements SessionPolicyRepository {
  state: ConversationSessionState | null = null;
  readonly events = new Map<string, { eventType: SessionEventType; signal: BoundarySignal }>();
  saveResult: "saved" | "duplicate" | "conflict" = "saved";
  private saveCount = 0;

  async withConversationLock<T>(_conversationId: string, work: () => Promise<T>): Promise<T> {
    return work();
  }

  async load(): Promise<ConversationSessionState | null> {
    return this.state;
  }

  async findEvent(_conversationId: string, inboundMessageId: string) {
    return this.events.get(inboundMessageId) ?? null;
  }

  async saveTransition(input: {
    state: ConversationSessionState;
    expectedVersion: number;
    inboundMessageId: string;
    eventType: SessionEventType;
    signal: BoundarySignal;
  }): Promise<"saved" | "duplicate" | "conflict"> {
    this.saveCount += 1;
    if (this.saveResult === "conflict") return "conflict";
    if (this.saveResult === "duplicate") {
      this.events.set(input.inboundMessageId, { eventType: input.eventType, signal: input.signal });
      return "duplicate";
    }
    this.state = input.state;
    this.events.set(input.inboundMessageId, { eventType: input.eventType, signal: input.signal });
    return "saved";
  }

  get saves(): number {
    return this.saveCount;
  }
}

describe("SessionPolicyService", () => {
  it("persists the transition and returns the decision", async () => {
    const repository = new MemorySessionRepository();
    const service = new SessionPolicyService(repository);
    const decision = await service.decide(CONV, input());
    assert.equal(decision.kind, "allow_agent");
    assert.equal(repository.saves, 1);
    assert.ok(repository.events.has("msg-1"));
  });

  it("returns duplicate for an already-seen inbound message without saving", async () => {
    const repository = new MemorySessionRepository();
    repository.state = createInitialSessionState(CONV);
    repository.events.set("msg-1", { eventType: "commercial_detected", signal: "commercial" });
    const service = new SessionPolicyService(repository);
    const decision = await service.decide(CONV, input());
    assert.equal(decision.kind, "duplicate");
    assert.equal(decision.eventType, "commercial_detected");
    assert.equal(repository.saves, 0);
  });

  it("maps a repository CAS conflict to duplicate after re-reading the winner", async () => {
    const repository = new MemorySessionRepository();
    repository.saveResult = "duplicate";
    const service = new SessionPolicyService(repository);
    const decision = await service.decide(CONV, input());
    assert.equal(decision.kind, "duplicate");
    assert.ok(repository.events.has("msg-1"));
  });

  it("throws on an unrecoverable CAS conflict (fail closed)", async () => {
    const repository = new MemorySessionRepository();
    repository.saveResult = "conflict";
    const service = new SessionPolicyService(repository);
    await assert.rejects(() => service.decide(CONV, input()), /compare-and-swap conflict/);
  });
});

describe("RoutingDecision shape guard", () => {
  it("keeps blocked decisions state-identical", () => {
    const state = createInitialSessionState(CONV);
    const decision: RoutingDecision = transitionSession(state, input({ hasHumanOverride: true }));
    assert.equal(decision.state.version, state.version);
  });
});
