/**
 * Anti-loop classifier + directive generation (A-18).
 *
 * `classifyMessageType` orders the keyword families deliberately (info before
 * greeting, order first) and drives the reprompt counter. Two same-type
 * follow-ups in a row produce a warning, three produce the hard "you are in a
 * loop" directive that forbids asking the same question again.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { agentSessionStates } from "@/db/schema";

import { FakeDb, installFakeDb } from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

const { analyzeConversationState, classifyMessageType } = require("./anti-loop") as typeof import("./anti-loop");

const CONV = "22222222-2222-2222-2222-222222222222";

function seedSession(): void {
  fake.seed(agentSessionStates, [
    { conversationId: CONV, kind: "customer", state: { version: 0, metadata: {} } },
  ]);
}

beforeEach(() => {
  fake.reset();
  seedSession();
});

describe("classifyMessageType — family precedence", () => {
  it("order intent wins over everything", () => {
    for (const text of ["quiero 10 remeras", "haceme un presupuesto", "necesito un uniforme"]) {
      assert.equal(classifyMessageType(text), "order", text);
    }
  });

  it("info beats greeting: 'Hola, pasame precios' is info", () => {
    assert.equal(classifyMessageType("Hola, pasame precios"), "info");
    assert.equal(classifyMessageType("cuánto sale el envío"), "info");
  });

  it("detects catalog questions", () => {
    assert.equal(classifyMessageType("qué productos tienen"), "menu");
    assert.equal(classifyMessageType("pasame el catálogo"), "menu");
  });

  it("detects complaints", () => {
    assert.equal(classifyMessageType("tengo un reclamo"), "complaint");
    assert.equal(classifyMessageType("esto es una queja"), "complaint");
  });

  it("detects greetings and non-commercial small talk", () => {
    assert.equal(classifyMessageType("hola"), "greeting");
    assert.equal(classifyMessageType("buen día"), "greeting");
    assert.equal(classifyMessageType("gracias!"), "non_commercial");
    assert.equal(classifyMessageType("todo bien?"), "non_commercial");
  });

  it("classifies a single emoji as non-commercial and unknown text as other", () => {
    assert.equal(classifyMessageType("🔥"), "non_commercial");
    assert.equal(classifyMessageType("zzz"), "other");
  });
});

describe("analyzeConversationState — reprompt escalation", () => {
  it("starts silent and records the message type + tools", async () => {
    const first = await analyzeConversationState(CONV, "hola", ["searchCatalog"]);
    assert.equal(first.isLooping, false);
    assert.equal(first.repromptCount, 0);
    assert.equal(first.directive, "");
    assert.equal(first.metadata.lastUserMessageType, "greeting");
    assert.deepEqual(first.metadata.lastTools, ["searchCatalog"]);
  });

  it("warns on the first repeated type", async () => {
    await analyzeConversationState(CONV, "hola", []);
    const second = await analyzeConversationState(CONV, "buenas", []);
    assert.equal(second.repromptCount, 1);
    assert.equal(second.isLooping, false);
    assert.match(second.directive, /CUIDADO/);
  });

  it("escalates to the loop directive on the second repeat and forbids re-asking", async () => {
    await analyzeConversationState(CONV, "hola", []);
    await analyzeConversationState(CONV, "buenas", []);
    const third = await analyzeConversationState(CONV, "qué tal", []);
    assert.equal(third.repromptCount, 2);
    assert.equal(third.isLooping, true);
    assert.match(third.directive, /CICLO/);
    assert.match(third.directive, /NO preguntes lo mismo/);
  });

  it("resets the counter when the message family changes", async () => {
    await analyzeConversationState(CONV, "hola", []);
    await analyzeConversationState(CONV, "buenas", []);
    await analyzeConversationState(CONV, "qué tal", []);
    const reset = await analyzeConversationState(CONV, "quiero 5 remeras", ["quoteGarment"]);
    assert.equal(reset.repromptCount, 0);
    assert.equal(reset.isLooping, false);
    assert.equal(reset.directive, "");
    assert.equal(reset.metadata.lastUserMessageType, "order");
    assert.deepEqual(reset.metadata.lastTools, ["quoteGarment"]);
  });

  it("preserves opaque metadata keys written by other subsystems", async () => {
    fake.seed(agentSessionStates, [
      {
        conversationId: CONV,
        kind: "customer",
        state: { version: 3, metadata: { lifecycleMarker: "handoff-pending" } },
      },
    ]);
    const result = await analyzeConversationState(CONV, "hola", []);
    const row = fake.rows("agent_session_states")[0];
    const state = row.state as { metadata: Record<string, unknown> };
    assert.equal(state.metadata.lifecycleMarker, "handoff-pending");
    assert.equal(state.metadata.lastUserMessageType, result.metadata.lastUserMessageType);
  });

  it("survives a missing session row (best-effort metadata, directive still computed)", async () => {
    fake.reset();
    const result = await analyzeConversationState(CONV, "hola", []);
    assert.equal(result.repromptCount, 0);
    assert.equal(result.directive, "");
  });
});
