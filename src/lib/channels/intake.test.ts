/**
 * Canonical intake contract (A-18).
 *
 * A-18 regression net for the ingest seam the whole agent layer stands on:
 * - invalid input is a discriminated `invalid_input` outcome (never a throw);
 * - a valid message persists conversation + message + idempotency key + audit
 *   inside one transaction;
 * - a duplicate provider delivery is a SAFE success (`ok: true`,
 *   `duplicate: true`) with no second message and the original message id;
 * - persistence failure is `persistence_failed` (retryable) and is distinct
 *   from invalid input — and the transaction rolled back;
 * - dedup is account-scoped: the same platform message id on two provisioned
 *   accounts is two facts, not a duplicate.
 *
 * Hermetic: the DB layer is the in-memory FakeDb installed on `@/db/client`.
 * `require()` runs after the intercepts because static imports are hoisted.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { chatMessages } from "@/db/schema";

import { FakeDb, installFakeDb } from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

const {
  INTAKE_IDEMPOTENCY_SCOPE,
  intakeIdempotencyKey,
  persistCanonicalMessage,
  persistCustomerInbound,
  persistAgentOutbound,
  importOperatorOutbound,
} = require("./intake") as typeof import("./intake");

function customerMessage(overrides: Record<string, unknown> = {}) {
  return {
    channel: "whatsapp",
    externalThreadId: "5493704000000",
    platformMessageId: "wamid.TEST-1",
    direction: "inbound",
    senderKind: "customer",
    contentType: "text",
    content: "Hola, quiero cotizar remeras",
    ...overrides,
  };
}

beforeEach(() => {
  fake.reset();
});

describe("intakeIdempotencyKey", () => {
  it("keys on (channel, platformMessageId)", () => {
    assert.equal(intakeIdempotencyKey("whatsapp", "wamid.X"), "whatsapp:wamid.X");
    assert.notEqual(intakeIdempotencyKey("telegram", "1"), intakeIdempotencyKey("whatsapp", "1"));
  });
});

describe("persistCanonicalMessage — invalid input", () => {
  it("returns invalid_input with per-field issues and touches no table", async () => {
    const outcome = await persistCanonicalMessage({ channel: "myspace" });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.error, "invalid_input");
    assert.ok(outcome.issues && outcome.issues.length > 0);
    assert.deepEqual(fake.writes, []);
  });

  it("rejects an empty platformMessageId (the dedup anchor is mandatory)", async () => {
    const outcome = await persistCanonicalMessage(customerMessage({ platformMessageId: " " }));
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.error, "invalid_input");
    assert.deepEqual(fake.writes, []);
  });
});

describe("persistCanonicalMessage — transactional persistence", () => {
  it("persists conversation, message, idempotency key and audit in one transaction", async () => {
    const outcome = await persistCanonicalMessage(customerMessage());
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.duplicate, false);
    assert.ok(outcome.conversationId);
    assert.ok(outcome.messageId);

    assert.equal(fake.rows("conversations").length, 1);
    assert.equal(fake.rows("chat_messages").length, 1);
    assert.equal(fake.rows("idempotency_keys").length, 1);
    assert.equal(fake.rows("audit_events").length, 1);
    assert.equal(fake.rows("idempotency_keys")[0].scope, INTAKE_IDEMPOTENCY_SCOPE);
    assert.equal(fake.rows("audit_events")[0].action, "channel.message.persisted");
  });

  it("customer inbound defaults to deliveryState=received", async () => {
    await persistCustomerInbound(customerMessage());
    assert.equal(fake.rows("chat_messages")[0].deliveryState, "received");
  });

  it("agent outbound defaults to queued; operator import to imported", async () => {
    await persistAgentOutbound(customerMessage({ platformMessageId: "wamid.AGENT", direction: "outbound", senderKind: "agent" }));
    assert.equal(fake.rows("chat_messages").find((row) => row.platformMessageId === "wamid.AGENT")?.deliveryState, "queued");

    await importOperatorOutbound({ externalThreadId: "5493704000000", platformMessageId: "wamid.OP" });
    assert.equal(fake.rows("chat_messages").find((row) => row.platformMessageId === "wamid.OP")?.deliveryState, "imported");
  });
});

describe("persistCanonicalMessage — duplicate delivery", () => {
  it("returns a safe success with the ORIGINAL message id and no new row", async () => {
    const first = await persistCanonicalMessage(customerMessage());
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const second = await persistCanonicalMessage(customerMessage());
    assert.equal(second.ok, true);
    if (!second.ok) return;

    assert.equal(second.duplicate, true);
    assert.equal(second.messageId, first.messageId);
    assert.equal(second.conversationId, first.conversationId);
    assert.equal(fake.rows("chat_messages").length, 1);
    assert.equal(
      fake.rows("audit_events").filter((row) => row.action === "channel.message.duplicate_ignored").length,
      1
    );
  });

  it("never records a second idempotency key for a replay", async () => {
    await persistCanonicalMessage(customerMessage());
    await persistCanonicalMessage(customerMessage());
    assert.equal(fake.rows("idempotency_keys").length, 1);
  });

  it("dedups per account: the same platform id on two accounts is two facts", async () => {
    const first = await persistCanonicalMessage(customerMessage({ channelAccountId: "acct-a" }));
    const second = await persistCanonicalMessage(customerMessage({ channelAccountId: "acct-b" }));
    assert.equal(first.ok && second.ok, true);
    if (first.ok) assert.equal(first.duplicate, false);
    if (second.ok) assert.equal(second.duplicate, false);
    assert.equal(fake.rows("chat_messages").length, 2);
    assert.equal(fake.rows("conversations").length, 2);
  });
});

describe("persistCanonicalMessage — persistence failure", () => {
  it("returns persistence_failed (not invalid_input) and rolls the transaction back", async () => {
    fake.poison(chatMessages);

    const outcome = await persistCanonicalMessage(customerMessage());
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.error, "persistence_failed");

    // The conversation upsert ran before the failing insert, so an empty
    // table proves the rollback (the fake restores the pre-transaction state).
    assert.equal(fake.rows("conversations").length, 0);
    assert.equal(fake.rows("chat_messages").length, 0);
    // The failure audit runs OUTSIDE the transaction and is best-effort.
    assert.equal(
      fake.rows("audit_events").filter((row) => row.action === "channel.message.failed").length,
      1
    );
  });

  it("a retry after the failure succeeds (the failed delivery left no marker)", async () => {
    fake.poison(chatMessages);
    const failed = await persistCanonicalMessage(customerMessage());
    assert.equal(failed.ok, false);

    fake.unpoison(chatMessages);
    const retried = await persistCanonicalMessage(customerMessage());
    assert.equal(retried.ok, true);
    if (retried.ok) assert.equal(retried.duplicate, false);
    assert.equal(fake.rows("chat_messages").length, 1);
    assert.equal(fake.rows("idempotency_keys").length, 1);
    assert.ok(fake.rows("audit_events").some((row) => row.action === "channel.message.persisted"));
    assert.equal(fake.rows("conversations").length, 1);
  });
});
