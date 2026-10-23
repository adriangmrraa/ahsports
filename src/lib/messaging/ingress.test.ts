/**
 * Unified ingress seam (A-18): fail-closed account resolution, per-account
 * signature verification and the delivery-marker claim/release protocol.
 *
 * The signature path is the security boundary: an install-wide secret alone
 * must not let a signer name ANOTHER provisioned account. Events are resolved
 * before processing and each one is checked against the secret its account
 * owns; unresolvable/DB-down events are never acked away.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { chatMessages } from "@/db/schema";
import type {
  ChannelAccountRow,
  ChannelAccountStore,
} from "@/lib/messaging/accounts";
import type {
  ChannelAccount,
  MessagingProvider,
  NormalizedInboundEvent,
} from "@/lib/messaging/types";

import { FakeDb, installFakeDb } from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

// Loaded through the same CJS graph the modules under test use, so the
// injected account store is the one ingress reads.
const { setChannelAccountStore } = require("@/lib/messaging/accounts") as typeof import("@/lib/messaging/accounts");
const {
  eventConversationExternalUserId,
  eventSelfAddresses,
  handlePassiveChannelEvent,
  resolveEventChannel,
  resolveIngressContext,
  resolveWebhookSecret,
  verifyAndResolveEvents,
} = require("./ingress") as typeof import("./ingress");
const {
  deliveryMarkerKey,
  isChannelDeliveryRecorded,
  persistChannelEvent,
  releaseChannelDeliveryMarker,
} = require("./channel-events") as typeof import("./channel-events");
const { ChannelAccountResolutionError } = require("@/lib/messaging/accounts") as typeof import("@/lib/messaging/accounts");

const PROVIDER_SECRET = "provider-install-secret";
const SIGNATURE_HEADER = "x-signature";

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function provider(): MessagingProvider {
  return {
    id: "ycloud",
    signatureScheme: "raw-body-hmac",
    verifyWebhook({ headers, rawBody, secret }) {
      return { ok: headers[SIGNATURE_HEADER] === sign(rawBody, secret) };
    },
    parseWebhook({ rawBody }) {
      const parsed = JSON.parse(rawBody) as { events?: NormalizedInboundEvent[] };
      return parsed.events ?? [];
    },
    async sendMessage() {
      return { ok: false as const, retryable: false, error: "not-used" };
    },
  };
}

function envelope(events: NormalizedInboundEvent[], secret: string) {
  const rawBody = JSON.stringify({ events });
  return { headers: { [SIGNATURE_HEADER]: sign(rawBody, secret) }, rawBody };
}

function event(overrides: Partial<NormalizedInboundEvent> = {}): NormalizedInboundEvent {
  return {
    provider: "ycloud",
    deliveryId: "del-1",
    kind: "message.received",
    direction: "inbound",
    providerAccountId: "waba-a",
    platformMessageId: "wamid.1",
    type: "text",
    text: "hola",
    sender: { phone: "+15550000001" },
    timestamp: "2026-01-01T00:00:00.000Z",
    raw: { whatsappInboundMessage: { to: "+15550000009" } },
    ...overrides,
  };
}

function row(overrides: Partial<ChannelAccountRow> = {}): ChannelAccountRow {
  return {
    id: "acct-row-a",
    tenantId: "default",
    provider: "ycloud",
    channel: "whatsapp",
    providerAccountId: "waba-a",
    senderAddress: "+15550000009",
    credentialsRef: "env:ACCTA_",
    status: "active",
    ...overrides,
  };
}

function storeWith(rows: ChannelAccountRow[]): ChannelAccountStore {
  return {
    async listByChannel(channel) {
      return rows.filter((candidate) => candidate.channel === channel);
    },
    async findById(id) {
      return rows.find((candidate) => candidate.id === id) ?? null;
    },
  };
}

function downStore(): ChannelAccountStore {
  return {
    async listByChannel() {
      throw Object.assign(new Error("connection terminated"), { code: "08006" });
    },
    async findById() {
      return null;
    },
  };
}

const account: ChannelAccount = {
  id: "acct-row-a",
  tenantId: "default",
  provider: "ycloud",
  channel: "whatsapp",
  providerAccountId: "waba-a",
  senderAddress: "+15550000009",
  credentials: { apiKey: "k", webhookSecret: "" },
  status: "active",
};

beforeEach(() => {
  fake.reset();
  process.env.YCLOUD_WEBHOOK_SECRET = PROVIDER_SECRET;
  process.env.ACCTA_API_KEY = "acct-a-api-key";
  process.env.ACCTA_WEBHOOK_SECRET = "acct-a-secret";
  process.env.ACCTB_API_KEY = "acct-b-api-key";
  process.env.ACCTB_WEBHOOK_SECRET = "acct-b-secret";
  setChannelAccountStore(
    storeWith([
      row(),
      row({ id: "acct-row-b", providerAccountId: "waba-b", senderAddress: "+15550000008", credentialsRef: "env:ACCTB_" }),
    ])
  );
});

afterEach(() => {
  delete process.env.YCLOUD_WEBHOOK_SECRET;
  delete process.env.ACCTA_API_KEY;
  delete process.env.ACCTA_WEBHOOK_SECRET;
  delete process.env.ACCTB_API_KEY;
  delete process.env.ACCTB_WEBHOOK_SECRET;
});

describe("resolveWebhookSecret", () => {
  it("reads <PROVIDER>_WEBHOOK_SECRET and returns empty (fail closed) when absent", async () => {
    assert.equal(await resolveWebhookSecret("ycloud"), PROVIDER_SECRET);
    delete process.env.YCLOUD_WEBHOOK_SECRET;
    assert.equal(await resolveWebhookSecret("ycloud"), "");
  });
});

describe("resolveEventChannel", () => {
  it("lets the adapter hint win over the registry inversion", () => {
    assert.equal(resolveEventChannel(provider(), event({ raw: { channel: "instagram" } })), "instagram");
  });

  it("falls back to the provider's registered channel", () => {
    assert.equal(resolveEventChannel(provider(), event({ raw: {} })), "whatsapp");
  });
});

describe("eventSelfAddresses — direction is load-bearing", () => {
  it("uses the business `to` on inbound events", () => {
    assert.deepEqual(eventSelfAddresses(event()), ["+15550000009"]);
  });

  it("uses `from` (never the customer `to`) on outbound events", () => {
    const outbound = event({
      direction: "outbound",
      kind: "message.echo",
      sender: { phone: "+15550000009" },
      raw: { whatsappMessage: { from: "+15550000009", to: "+15550000001" } },
    });
    const addresses = eventSelfAddresses(outbound);
    assert.ok(addresses.includes("+15550000009"));
    assert.ok(!addresses.includes("+15550000001"));
  });
});

describe("eventConversationExternalUserId", () => {
  it("keys an echo by the CUSTOMER conversation id, not the business phone", () => {
    const echo = event({
      kind: "message.echo",
      direction: "outbound",
      sender: { phone: "+15550000009" },
      providerConversationId: "+15550000001",
    });
    assert.equal(eventConversationExternalUserId(echo), "+15550000001");
  });

  it("keys an inbound message by the sender phone", () => {
    assert.equal(eventConversationExternalUserId(event()), "+15550000001");
  });
});

describe("verifyAndResolveEvents — signature verification", () => {
  it("rejects an unsigned/incorrectly signed envelope", async () => {
    const result = await verifyAndResolveEvents(provider(), envelope([event()], "wrong-secret"));
    assert.equal(result.kind, "unauthorized");
  });

  it("rejects a missing provider secret even with a matching header", async () => {
    delete process.env.YCLOUD_WEBHOOK_SECRET;
    const result = await verifyAndResolveEvents(provider(), envelope([event()], ""));
    assert.equal(result.kind, "unauthorized");
  });

  it("accepts an event signed with its own account secret", async () => {
    const result = await verifyAndResolveEvents(provider(), envelope([event()], "acct-a-secret"));
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].ctx?.channel, "whatsapp");
    assert.equal(result.rejected, 0);
  });

  it("accepts an event signed with the install-wide secret when the account has none", async () => {
    setChannelAccountStore(storeWith([row({ credentialsRef: null, id: "acct-row-provider" })]));
    const result = await verifyAndResolveEvents(provider(), envelope([event()], PROVIDER_SECRET));
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") assert.equal(result.events.length, 1);
  });

  it("drops events naming an account whose secret did not sign them (cross-account forgery)", async () => {
    const events = [
      event({ deliveryId: "del-a", providerAccountId: "waba-a", platformMessageId: "wamid.a" }),
      event({ deliveryId: "del-b", providerAccountId: "waba-b", platformMessageId: "wamid.b" }),
    ];
    const result = await verifyAndResolveEvents(provider(), envelope(events, "acct-a-secret"));
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].event.providerAccountId, "waba-a");
    assert.equal(result.rejected, 1);
  });

  it("returns unauthorized when NO event's account secret verifies", async () => {
    const result = await verifyAndResolveEvents(
      provider(),
      envelope([event({ providerAccountId: "waba-b" })], "acct-a-secret")
    );
    assert.equal(result.kind, "unauthorized");
  });

  it("returns empty for a verified envelope that parses to no events", async () => {
    const rawBody = JSON.stringify({ events: [] });
    const result = await verifyAndResolveEvents(provider(), {
      headers: { [SIGNATURE_HEADER]: sign(rawBody, PROVIDER_SECRET) },
      rawBody,
    });
    assert.equal(result.kind, "empty");
  });

  it("caps an over-stuffed envelope instead of fanning out unbounded resolution", async () => {
    const events = Array.from({ length: 105 }, (_, index) =>
      event({ deliveryId: `del-${index}`, platformMessageId: `wamid.${index}` })
    );
    const result = await verifyAndResolveEvents(provider(), envelope(events, "acct-a-secret"));
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") assert.equal(result.events.length, 100);
  });
});

describe("resolveIngressContext — fail closed", () => {
  it("resolves the account and stamps the row id", async () => {
    const ctx = await resolveIngressContext(provider(), event());
    assert.equal(ctx?.channel, "whatsapp");
    assert.equal(ctx?.channelAccountId, "acct-row-a");
  });

  it("returns undefined for an event whose routing key matches no account", async () => {
    assert.equal(
      await resolveIngressContext(
        provider(),
        event({ providerAccountId: "waba-zzz", raw: { whatsappInboundMessage: { to: "+15558880000" } } })
      ),
      undefined
    );
  });

  it("throws a retryable resolution error when the account store is down", async () => {
    setChannelAccountStore(downStore());
    await assert.rejects(
      () => resolveIngressContext(provider(), event()),
      (error: unknown) => error instanceof ChannelAccountResolutionError
    );
  });

  it("treats an unverified envelope whose account store is down as unauthorized", async () => {
    setChannelAccountStore(downStore());
    const result = await verifyAndResolveEvents(provider(), envelope([event()], "nope"));
    assert.equal(result.kind, "unauthorized");
  });

  it("keeps a provider-verified envelope retryable when the account store is down (never acked away)", async () => {
    setChannelAccountStore(downStore());
    await assert.rejects(
      () => verifyAndResolveEvents(provider(), envelope([event()], PROVIDER_SECRET)),
      (error: unknown) => error instanceof ChannelAccountResolutionError
    );
  });
});

describe("handlePassiveChannelEvent — delivery marker claim", () => {
  function passiveEvent(overrides: Partial<NormalizedInboundEvent> = {}): NormalizedInboundEvent {
    return event({ provider: "kapso", raw: { channel: "whatsapp" }, ...overrides });
  }

  const ctx = { channel: "whatsapp" as const, account, channelAccountId: "acct-row-a" };

  it("claims the delivery marker BEFORE any message write", async () => {
    const response = await handlePassiveChannelEvent(passiveEvent(), ctx);
    assert.equal(response.status, 200);
    assert.equal(fake.rows("idempotency_keys").length, 1);
    assert.equal(
      fake.rows("idempotency_keys")[0].key,
      deliveryMarkerKey("kapso", "del-1", "acct-row-a")
    );
  });

  it("acks a redelivered event without a second claim", async () => {
    await handlePassiveChannelEvent(passiveEvent(), ctx);
    const again = await handlePassiveChannelEvent(passiveEvent(), ctx);
    assert.equal(again.status, 200);
    assert.equal(fake.rows("idempotency_keys").length, 1);
  });

  it("never claims a delivery it cannot key to a sender identity", async () => {
    const response = await handlePassiveChannelEvent(
      passiveEvent({ sender: {}, providerConversationId: undefined, providerThreadId: undefined }),
      ctx
    );
    assert.equal(response.status, 200);
    assert.equal(fake.rows("idempotency_keys").length, 0);
  });

  it("persists an echo through canonical intake as an imported operator outbound fact", async () => {
    const echo = passiveEvent({
      kind: "message.echo",
      direction: "outbound",
      sender: { phone: "+15550000009" },
      providerConversationId: "+15550000001",
    });
    await handlePassiveChannelEvent(echo, ctx);
    const message = fake.rows("chat_messages")[0];
    assert.equal(message.direction, "outbound");
    assert.equal(message.senderKind, "operator");
    assert.equal(message.deliveryState, "imported");
    // delivery marker + canonical-intake idempotency key
    assert.equal(fake.rows("idempotency_keys").length, 2);
  });

  it("keeps only the durable marker for channels outside the persistence enum", async () => {
    const response = await handlePassiveChannelEvent(
      passiveEvent({ raw: { channel: "instagram" } }),
      { channel: "instagram", account, channelAccountId: "acct-row-a" }
    );
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 0);
    assert.equal(fake.rows("idempotency_keys").length, 1);
  });

  // KNOWN BUG (reported, not fixed): inbound/comment passive events reach
  // `persistCanonicalMessage` WITHOUT `direction`/`senderKind`, so canonical
  // intake rejects them as invalid_input. The handler acks 200 and only the
  // durable delivery marker survives — the message itself is lost. This test
  // pins the CURRENT (lossy) behavior so the fix flips it deliberately.
  it("currently drops an inbound passive message (marker only) — missing direction/senderKind", async () => {
    const response = await handlePassiveChannelEvent(passiveEvent(), ctx);
    assert.equal(response.status, 200);
    assert.equal(fake.rows("chat_messages").length, 0);
    assert.equal(fake.rows("idempotency_keys").length, 1);
  });

  it("currently drops a comment the same way", async () => {
    await handlePassiveChannelEvent(passiveEvent({ kind: "comment.received", platformMessageId: "comment-1" }), ctx);
    assert.equal(fake.rows("chat_messages").length, 0);
  });
});

describe("delivery marker release", () => {
  const ctx = { channel: "whatsapp" as const, account, channelAccountId: "acct-row-a" };

  it("releases a claim so the provider's redelivery can be claimed again", async () => {
    const withoutDirection = event({ provider: "kapso", raw: { channel: "whatsapp" } });
    const first = await persistChannelEvent(withoutDirection, ctx);
    assert.equal(first.kind, "persisted");
    assert.equal(await isChannelDeliveryRecorded("kapso", "del-1", "acct-row-a"), true);

    await releaseChannelDeliveryMarker("kapso", "del-1", "acct-row-a");
    assert.equal(await isChannelDeliveryRecorded("kapso", "del-1", "acct-row-a"), false);

    const retried = await persistChannelEvent(withoutDirection, ctx);
    assert.equal(retried.kind, "persisted");
  });

  it("is idempotent: releasing an absent marker does not throw", async () => {
    await releaseChannelDeliveryMarker("kapso", "never-claimed", "acct-row-a");
    assert.equal(await isChannelDeliveryRecorded("kapso", "never-claimed", "acct-row-a"), false);
  });
});
