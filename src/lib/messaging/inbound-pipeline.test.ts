/**
 * Shared inbound pipeline (A-18): echo suppression, message/content dedup,
 * operator-active suppression and debounced batching.
 *
 * The pipeline is transport glue: every branch is a claim about what the
 * agent must NOT do (reply to its own echo, reopen a thread a human is
 * handling, run twice for one delivery). The tests exercise those branches
 * against the real pipeline and the in-memory buffer — no DB, no timers left
 * to chance.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { agentMemories, conversations, chatMessages } from "@/db/schema";
import type { ChannelAccountRow } from "@/lib/messaging/accounts";
import type { ChannelAccount, NormalizedInboundEvent } from "@/lib/messaging/types";

import { FakeDb, installFakeDb } from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

const { setChannelAccountStore } = require("@/lib/messaging/accounts") as typeof import("@/lib/messaging/accounts");
const {
  handleNormalizedEvent,
  isMessageDuplicate,
  setInboundTurnDispatcher,
} = require("./inbound-pipeline") as typeof import("./inbound-pipeline");
const { BufferManager, scheduleBufferProcessing } = require("./buffer") as typeof import("./buffer");
const { accountScopedInboundKey } = require("./inbound-keys") as typeof import("./inbound-keys");

const BOT = "+15550000009";
const CUSTOMER = "+15550000001";
const ACCOUNT_ID = "env:a";

function row(overrides: Partial<ChannelAccountRow> = {}): ChannelAccountRow {
  return {
    id: "env:a",
    tenantId: "default",
    provider: "ycloud",
    channel: "whatsapp",
    providerAccountId: "waba-a",
    senderAddress: BOT,
    credentialsRef: "env:ACCTA_",
    status: "active",
    ...overrides,
  };
}

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  tenantId: "default",
  provider: "ycloud",
  channel: "whatsapp",
  providerAccountId: "waba-a",
  senderAddress: BOT,
  credentials: { apiKey: "k", webhookSecret: "" },
  status: "active",
};

function inbound(overrides: Partial<NormalizedInboundEvent> = {}): NormalizedInboundEvent {
  return {
    provider: "ycloud",
    deliveryId: "del-in-1",
    kind: "message.received",
    direction: "inbound",
    providerAccountId: "waba-a",
    platformMessageId: "wamid.in.1",
    type: "text",
    text: "Hola, quiero cotizar remeras",
    sender: { phone: CUSTOMER },
    timestamp: "2026-01-01T00:00:00.000Z",
    raw: {
      type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: { type: "text", id: "wamid.in.1", from: CUSTOMER, to: BOT, text: { body: "Hola" } },
    },
    ...overrides,
  };
}

function echo(overrides: Partial<NormalizedInboundEvent> = {}): NormalizedInboundEvent {
  return {
    provider: "ycloud",
    deliveryId: "del-echo-1",
    kind: "message.echo",
    direction: "outbound",
    providerAccountId: "waba-a",
    platformMessageId: "wamid.echo.1",
    type: "text",
    text: "Hola! ¿Qué prendas necesitás?",
    sender: { phone: BOT },
    providerConversationId: CUSTOMER,
    timestamp: "2026-01-01T00:00:00.000Z",
    raw: {},
    ...overrides,
  };
}

const ctx = { channel: "whatsapp" as const, account };

beforeEach(() => {
  fake.reset();
  process.env.ACCTA_API_KEY = "acct-a-api-key";
  process.env.ACCTA_WEBHOOK_SECRET = "acct-a-secret";
  process.env.ACCTB_API_KEY = "acct-b-api-key";
  process.env.ACCTB_WEBHOOK_SECRET = "acct-b-secret";
  // Two env-scoped rows: candidate matching stays strict (no single-env
  // fallback), and symbolic ids keep the legacy null-account partition.
  setChannelAccountStore({
    async listByChannel() {
      return [
        row(),
        row({ id: "env:b", providerAccountId: "waba-b", senderAddress: "+15550000008", credentialsRef: "env:ACCTB_" }),
      ];
    },
    async findById(id) {
      return id === ACCOUNT_ID ? row() : null;
    },
  });
  setInboundTurnDispatcher({ async dispatch() {} });
});

afterEach(async () => {
  delete process.env.ACCTA_API_KEY;
  delete process.env.ACCTA_WEBHOOK_SECRET;
  delete process.env.ACCTB_API_KEY;
  delete process.env.ACCTB_WEBHOOK_SECRET;
  await BufferManager.fetchAndClear("whatsapp", CUSTOMER);
});

describe("isMessageDuplicate", () => {
  it("is false for an unseen platform message id and true once persisted", async () => {
    assert.equal(await isMessageDuplicate("whatsapp", "wamid.never"), false);
    fake.seed(chatMessages, [
      {
        id: "m-1",
        conversationId: "conv-1",
        channel: "whatsapp",
        platformMessageId: "wamid.seen",
        direction: "inbound",
        senderKind: "customer",
        content: "hola",
        createdAt: new Date(),
      },
    ]);
    assert.equal(await isMessageDuplicate("whatsapp", "wamid.seen"), true);
  });

  it("treats an empty id as not duplicate (no anchor to compare)", async () => {
    assert.equal(await isMessageDuplicate("whatsapp", ""), false);
  });

  it("dedups per account partition — the same pmid under another account is NOT a duplicate", async () => {
    fake.seed(chatMessages, [
      {
        id: "m-b",
        conversationId: "conv-b",
        channel: "whatsapp",
        channelAccountId: "acct-b",
        platformMessageId: "wamid.shared",
        direction: "inbound",
        senderKind: "customer",
        content: "hola",
        createdAt: new Date(),
      },
    ]);
    assert.equal(await isMessageDuplicate("whatsapp", "wamid.shared", "acct-b"), true);
    assert.equal(await isMessageDuplicate("whatsapp", "wamid.shared", "acct-a"), false);
    assert.equal(await isMessageDuplicate("whatsapp", "wamid.shared", null), false);
  });
});

describe("handleNormalizedEvent — inbound", () => {
  it("persists the inbound fact, links the lead and enqueues ONE debounced turn", async () => {
    const response = await handleNormalizedEvent(inbound(), ctx);
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 1);
    assert.equal(fake.rows("chat_messages")[0].senderKind, "customer");
    assert.equal(fake.rows("contacts").length, 1);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", CUSTOMER), true);
  });

  it("acks without persisting a redelivery of the same platform message", async () => {
    fake.seed(chatMessages, [
      {
        id: "m-1",
        conversationId: "conv-1",
        channel: "whatsapp",
        platformMessageId: "wamid.in.1",
        direction: "inbound",
        senderKind: "customer",
        content: "hola",
        createdAt: new Date(),
      },
    ]);
    const response = await handleNormalizedEvent(inbound(), ctx);
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 1);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", CUSTOMER), false);
  });

  it("acks a duplicate DELIVERY (same deliveryId) without persisting again", async () => {
    await handleNormalizedEvent(inbound(), ctx);
    await BufferManager.fetchAndClear("whatsapp", CUSTOMER);
    const again = await handleNormalizedEvent(inbound(), ctx);
    assert.equal(again.status, 200);
    assert.equal(fake.rows("chat_messages").length, 1);
  });

  it("suppresses the agent turn when an operator answered recently", async () => {
    fake.seed(conversations, [
      {
        id: "conv-operator",
        channel: "whatsapp",
        channelAccountId: null,
        externalThreadId: "15550000007",
        createdAt: new Date(),
      },
    ]);
    fake.seed(chatMessages, [
      {
        id: "m-operator",
        conversationId: "conv-operator",
        channel: "whatsapp",
        platformMessageId: "wamid.operator",
        direction: "outbound",
        senderKind: "operator",
        content: "Te ayudo yo",
        createdAt: new Date(),
      },
    ]);

    const phone = "+15550000007";
    const response = await handleNormalizedEvent(inbound({ sender: { phone }, platformMessageId: "wamid.in.7" }), ctx);
    assert.equal(response.status, 200);
    // The inbound fact IS persisted; only the reply is suppressed.
    assert.equal(fake.rows("chat_messages").filter((m) => m.platformMessageId === "wamid.in.7").length, 1);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", phone), false);
  });

  it("does not suppress when the operator message is outside the 2h window", async () => {
    const phone = "+15550000006";
    const normalized = "15550000006";
    fake.seed(conversations, [
      { id: "conv-old", channel: "whatsapp", channelAccountId: null, externalThreadId: normalized, createdAt: new Date() },
    ]);
    fake.seed(chatMessages, [
      {
        id: "m-old",
        conversationId: "conv-old",
        channel: "whatsapp",
        platformMessageId: "wamid.old-op",
        direction: "outbound",
        senderKind: "operator",
        content: "Viejo",
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    ]);
    const response = await handleNormalizedEvent(inbound({ sender: { phone }, platformMessageId: "wamid.in.6" }), ctx);
    assert.equal(response.status, 200);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", phone), true);
  });

  it("does NOT suppress on a recent automated send — agent rows never count as operator activity", async () => {
    const phone = "+15550000005";
    const normalized = "15550000005";
    fake.seed(conversations, [
      { id: "conv-auto", channel: "whatsapp", channelAccountId: null, externalThreadId: normalized, createdAt: new Date() },
    ]);
    fake.seed(chatMessages, [
      {
        id: "m-notify",
        conversationId: "conv-auto",
        channel: "whatsapp",
        platformMessageId: "order-status:1:en_produccion",
        direction: "outbound",
        senderKind: "agent",
        senderRef: "order-status-notify",
        content: "Tu pedido entró a producción",
        createdAt: new Date(),
      },
    ]);
    const response = await handleNormalizedEvent(inbound({ sender: { phone }, platformMessageId: "wamid.in.5" }), ctx);
    assert.equal(response.status, 200);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", phone), true);
  });

  it("clears the operator mute at handoff.resolvedAt — rows before the boundary do not count", async () => {
    const phone = "+15550000004";
    const normalized = "15550000004";
    fake.seed(conversations, [
      { id: "conv-resolved", channel: "whatsapp", channelAccountId: null, externalThreadId: normalized, createdAt: new Date() },
    ]);
    fake.seed(chatMessages, [
      {
        id: "m-during-handoff",
        conversationId: "conv-resolved",
        channel: "whatsapp",
        platformMessageId: "op-reply:during",
        direction: "outbound",
        senderKind: "operator",
        content: "Lo veo yo",
        // One minute ago — inside the 2h window but BEFORE the resolution.
        createdAt: new Date(Date.now() - 60_000),
      },
    ]);
    fake.seed(agentMemories, [
      {
        scope: "customer",
        key: "whatsapp-handoff-resolved:conv-resolved",
        value: { resolvedAt: new Date().toISOString() },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    ]);
    const response = await handleNormalizedEvent(inbound({ sender: { phone }, platformMessageId: "wamid.in.4" }), ctx);
    assert.equal(response.status, 200);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", phone), true);
  });

  it("re-arms the durable turn job on a redelivery whose persist crashed before enqueue", async () => {
    const phone = "+15550000003";
    const normalized = "15550000003";
    fake.seed(conversations, [
      { id: "conv-orphan", channel: "whatsapp", channelAccountId: null, externalThreadId: normalized, createdAt: new Date() },
    ]);
    fake.seed(chatMessages, [
      {
        id: "m-orphan",
        conversationId: "conv-orphan",
        channel: "whatsapp",
        platformMessageId: "wamid.in.3",
        direction: "inbound",
        senderKind: "customer",
        content: "siguen ahí?",
        createdAt: new Date(),
      },
    ]);
    const response = await handleNormalizedEvent(
      inbound({ sender: { phone }, platformMessageId: "wamid.in.3", deliveryId: "del-redelivered" }),
      ctx
    );
    assert.equal(response.status, 200);
    const jobs = fake.rows("agent_inbound_jobs");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].dedupKey, "turn:conv-orphan");
  });
});

describe("handleNormalizedEvent — echo", () => {
  it("suppresses the bot's own echo by CONTENT (the platform id differs per bubble)", async () => {
    const content = "Hola! ¿Qué prendas necesitás?";
    fake.seed(conversations, [
      {
        id: "conv-echo",
        channel: "whatsapp",
        channelAccountId: null,
        externalThreadId: "15550000001",
        createdAt: new Date(),
      },
    ]);
    fake.seed(chatMessages, [
      {
        id: "m-agent",
        conversationId: "conv-echo",
        channel: "whatsapp",
        platformMessageId: "agent:synthetic:1",
        direction: "outbound",
        senderKind: "agent",
        content,
        createdAt: new Date(),
      },
    ]);

    const response = await handleNormalizedEvent(echo({ text: content }), ctx);
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 1);
  });

  it("persists a human echo as an operator outbound fact", async () => {
    fake.seed(conversations, [
      {
        id: "conv-echo",
        channel: "whatsapp",
        channelAccountId: null,
        externalThreadId: "15550000001",
        createdAt: new Date(),
      },
    ]);
    const response = await handleNormalizedEvent(echo({ text: "Te respondo yo por acá" }), ctx);
    assert.equal(response.status, 200);
    const message = fake.rows("chat_messages")[0];
    assert.equal(message.senderKind, "operator");
    assert.equal(message.direction, "outbound");
    assert.equal(message.deliveryState, "imported");
  });

  it("acks and ignores an echo whose business sender matches no active account", async () => {
    const response = await handleNormalizedEvent(
      echo({ sender: { phone: "+15559999999" }, providerAccountId: "waba-zzz" }),
      ctx
    );
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 0);
  });

  it("acks a redelivered echo twice without duplicating the operator fact", async () => {
    fake.seed(conversations, [
      {
        id: "conv-echo",
        channel: "whatsapp",
        channelAccountId: null,
        externalThreadId: "15550000001",
        createdAt: new Date(),
      },
    ]);
    await handleNormalizedEvent(echo({ text: "Respuesta humana" }), ctx);
    await handleNormalizedEvent(echo({ text: "Respuesta humana" }), ctx);
    assert.equal(fake.rows("chat_messages").length, 1);
  });
});

describe("handleNormalizedEvent — non-message kinds", () => {
  it("persists a status event as a durable channel event and acks", async () => {
    const status = inbound({
      kind: "message.status",
      direction: "na",
      status: "delivered",
      platformMessageId: "wamid.in.1",
      raw: {},
    });
    const response = await handleNormalizedEvent(status, ctx);
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 0);
    assert.equal(fake.rows("idempotency_keys").length, 1);
  });

  it("acks without persistence when no channel is known", async () => {
    const response = await handleNormalizedEvent(inbound({ kind: "account.lifecycle" }), {});
    assert.equal(response.status, 200);
    assert.equal(fake.rows("idempotency_keys").length, 0);
  });
});

describe("buffer — debounce, lock and content dedup", () => {
  const realNow = Date.now;
  let offset = 0;

  beforeEach(() => {
    offset = 0;
    Date.now = () => realNow() + offset;
  });

  afterEach(async () => {
    Date.now = realNow;
    await BufferManager.fetchAndClear("whatsapp", "buffer-user");
    await BufferManager.fetchAndClear("whatsapp", "buffer-lock");
    await BufferManager.fetchAndClear("whatsapp", "buffer-dedup");
  });

  it("batches a burst into ONE callback after the debounce window slides closed", async () => {
    await BufferManager.enqueue("whatsapp", "buffer-user", { content: "uno", messageId: "1", timestamp: Date.now() });
    await BufferManager.enqueue("whatsapp", "buffer-user", { content: "dos", messageId: "2", timestamp: Date.now() });
    assert.equal(await BufferManager.isTimerExpired("whatsapp", "buffer-user"), false);

    offset += 4_000;
    const batches: string[][] = [];
    await scheduleBufferProcessing("whatsapp", "buffer-user", async (messages) => {
      batches.push(messages.map((message) => message.content));
    });

    assert.deepEqual(batches, [["uno", "dos"]]);
    assert.equal(await BufferManager.hasNewMessages("whatsapp", "buffer-user"), false);
    assert.equal(await BufferManager.isTimerExpired("whatsapp", "buffer-user"), true);
  });

  it("never double-dispatches while the per-key lock is held", async () => {
    await BufferManager.enqueue("whatsapp", "buffer-lock", { content: "x", messageId: "1", timestamp: Date.now() });
    assert.equal(await BufferManager.acquireLock("whatsapp", "buffer-lock"), true);
    assert.equal(await BufferManager.acquireLock("whatsapp", "buffer-lock"), false);

    offset += 4_000;
    let called = false;
    await scheduleBufferProcessing("whatsapp", "buffer-lock", async () => {
      called = true;
    });
    assert.equal(called, false);

    await BufferManager.releaseLock("whatsapp", "buffer-lock");
    await BufferManager.fetchAndClear("whatsapp", "buffer-lock");
  });

  it("drops an exact content resend within the 5s window but accepts new content", async () => {
    assert.equal(await BufferManager.isContentDuplicate("whatsapp", "buffer-dedup", "Hola"), false);
    assert.equal(await BufferManager.isContentDuplicate("whatsapp", "buffer-dedup", "  hola "), true);
    assert.equal(await BufferManager.isContentDuplicate("whatsapp", "buffer-dedup", "otra cosa"), false);
  });

  it("keeps the newest messages when a batch exceeds the cap", async () => {
    for (let index = 0; index < 25; index += 1) {
      await BufferManager.enqueue("whatsapp", "buffer-user", {
        content: `m-${index}`,
        messageId: String(index),
        timestamp: Date.now(),
      });
    }
    const messages = await BufferManager.fetchAndClear("whatsapp", "buffer-user");
    assert.equal(messages.length, 20);
    assert.equal(messages[0].content, "m-5");
    assert.equal(messages[19].content, "m-24");
  });

  it("computes the same account-scoped key the pipeline uses", () => {
    assert.equal(accountScopedInboundKey(undefined, CUSTOMER), CUSTOMER);
    assert.equal(accountScopedInboundKey("acct-1", CUSTOMER), `acctacct-1:${CUSTOMER}`);
  });
});
