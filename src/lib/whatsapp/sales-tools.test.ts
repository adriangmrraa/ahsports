/**
 * Customer sales-tool contracts (A-18).
 *
 * The agent NEVER supplies identity, prices, totals or quantities it decided:
 * - tool schemas strip unknown/price fields,
 * - every quote goes through the server pricing engine (`quoteOrder`),
 * - drafts are reversible (`borrador`, requires human confirmation),
 * - `recordPaymentIntent` records an intent only (never a payment),
 * - `transferToHuman` claims its side effects at most once per episode.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  agentMemories,
  contacts,
  conversations,
  idempotencyKeys,
  orderItems,
  orderLines,
  orders,
  payments,
  products,
  sizes,
} from "@/db/schema";
import type { QuoteResult } from "@/lib/pricing";
import type { AgentToolContext } from "@/lib/agents/tools/types";

import {
  FakeDb,
  installFakeDb,
  installModuleIntercepts,
} from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

const quoteCalls: Array<{ productId: string; quantity: number }> = [];
installModuleIntercepts({
  "@/lib/pricing": () => ({
    quoteOrder: async (input: { lines: Array<{ productId: string; quantity: number }> }): Promise<QuoteResult> => {
      const line = input.lines[0];
      quoteCalls.push({ productId: line.productId, quantity: line.quantity });
      const unitPrice = 250;
      const unitCost = 100;
      return {
        lines: [
          {
            productId: line.productId,
            productName: "Remera",
            quantity: line.quantity,
            unitCost,
            unitPrice,
            subtotal: unitPrice * line.quantity,
            materials: [],
            techniques: [],
            sizeBreakdown: [],
          },
        ],
        totals: {
          cost: unitCost * line.quantity,
          price: unitPrice * line.quantity,
          margin: (unitPrice - unitCost) * line.quantity,
          marginPercent: 60,
        },
        rule: {
          id: "rule-1",
          name: "Base",
          marginPercent: 60,
          urgentSurcharge: 10,
          minAdvancePercent: 50,
          rounding: 1,
        },
        snapshot: { rule: { id: "rule-1" }, lines: [] },
      } as unknown as QuoteResult;
    },
  }),
});

const {
  draftOrderWhatsAppTool,
  quoteGarmentTool,
  recordPaymentIntentTool,
  resolveWhatsAppSalesTools,
  transferToHumanTool,
  WHATSAPP_SALES_TOOLS,
} = require("./sales-tools") as typeof import("./sales-tools");
const { HandoffEffectService, DrizzleHandoffEffectRepository } = require("./human-handoff") as typeof import("./human-handoff");

const CONV = "conv-1";
const CONTACT = "contact-1";
const PRODUCT = "prod-1";

const context: AgentToolContext = { conversationId: CONV, actorRef: "whatsapp-sales-agent" };

function seedCatalog(): void {
  fake.seed(products, [
    {
      id: PRODUCT,
      sku: "REM-1",
      name: "Remera",
      active: true,
      productKind: "garment",
      minOrder: 1,
      zones: [],
      garmentType: "remera",
      basePrice: "0",
    },
  ]);
  fake.seed(sizes, []);
  fake.seed(conversations, [
    {
      id: CONV,
      customerId: CONTACT,
      organizationId: null,
      channel: "whatsapp",
      channelAccountId: null,
      externalThreadId: "15550000001",
      lastMessageAt: new Date(),
      createdAt: new Date(),
    },
  ]);
  fake.seed(contacts, [
    { id: CONTACT, name: "Cliente", phone: "15550000001", organizationId: null, role: "cliente", status: "nuevo", createdAt: new Date() },
  ]);
}

beforeEach(() => {
  fake.reset();
  quoteCalls.length = 0;
  seedCatalog();
});

describe("resolveWhatsAppSalesTools", () => {
  it("returns the full customer-safe set when no allowlist is configured", () => {
    assert.equal(resolveWhatsAppSalesTools(null).length, WHATSAPP_SALES_TOOLS.length);
    assert.equal(resolveWhatsAppSalesTools([]).length, WHATSAPP_SALES_TOOLS.length);
    assert.equal(resolveWhatsAppSalesTools(undefined).length, WHATSAPP_SALES_TOOLS.length);
  });

  it("narrows to the admin allowlist and ignores unknown ids", () => {
    const tools = resolveWhatsAppSalesTools(["quoteGarment", "notATool", "transferToHuman"]);
    assert.deepEqual(tools.map((tool) => tool.id), ["quoteGarment", "transferToHuman"]);
  });

  it("cannot widen the surface with an id outside the customer-safe set", () => {
    const tools = resolveWhatsAppSalesTools(["quoteGarment", "manageCash", "updateAgentConfig"]);
    assert.deepEqual(tools.map((tool) => tool.id), ["quoteGarment"]);
  });
});

describe("tool schemas — model-supplied money is discarded", () => {
  it("quote/draft inputs strip unitPrice, price and total", () => {
    for (const tool of [quoteGarmentTool, draftOrderWhatsAppTool]) {
      const parsed = tool.inputSchema.parse({
        productName: "Remera",
        quantity: 5,
        unitPrice: 0.01,
        price: 0.01,
        total: 0.01,
        unitCost: 0,
      }) as Record<string, unknown>;
      assert.equal("unitPrice" in parsed, false, tool.id);
      assert.equal("price" in parsed, false, tool.id);
      assert.equal("total" in parsed, false, tool.id);
      assert.equal("unitCost" in parsed, false, tool.id);
    }
  });

  it("quantity must be a positive integer", () => {
    assert.equal(quoteGarmentTool.inputSchema.safeParse({ productName: "Remera", quantity: 0 }).success, false);
    assert.equal(quoteGarmentTool.inputSchema.safeParse({ productName: "Remera", quantity: 2.5 }).success, false);
  });
});

describe("quoteGarment", () => {
  it("prices through the server engine, using the resolved product id (never model ids)", async () => {
    const result = (await quoteGarmentTool.handler(
      { productName: "Remera", quantity: 5 } as never,
      context
    )) as Record<string, unknown>;

    assert.equal(result.ok, true);
    assert.deepEqual(quoteCalls, [{ productId: PRODUCT, quantity: 5 }]);
    assert.equal(result.totalPrice, 1250);
    assert.equal(result.unitPrice, 250);
    assert.equal(result.minAdvancePercent, 50);
  });

  it("returns a candidate list instead of guessing an ambiguous product", async () => {
    fake.seed(products, [
      { id: "p1", sku: "R1", name: "Remera Manga Corta", active: true, productKind: "garment", minOrder: 1, zones: [], basePrice: "0" },
      { id: "p2", sku: "R2", name: "Remera Manga Larga", active: true, productKind: "garment", minOrder: 1, zones: [], basePrice: "0" },
    ]);
    const result = (await quoteGarmentTool.handler(
      { productName: "Remera", quantity: 5 } as never,
      context
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.equal(result.error, "product_ambiguous");
    assert.equal(quoteCalls.length, 0);
  });

  it("reports product_not_found with available candidates", async () => {
    const result = (await quoteGarmentTool.handler(
      { productName: "Buzo inexistente", quantity: 5 } as never,
      context
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.equal(result.error, "product_not_found");
    assert.deepEqual(result.candidates, ["Remera"]);
  });
});

describe("draftOrder — reversible draft only", () => {
  it("writes a borrador order with the engine price, never an approved/paid one", async () => {
    const result = (await draftOrderWhatsAppTool.handler(
      { productName: "Remera", quantity: 5, notes: "Diseño club" } as never,
      context
    )) as Record<string, unknown>;

    assert.equal(result.ok, true);
    assert.equal(result.draft, true);
    assert.equal(result.status, "borrador");
    assert.equal(result.requiresHumanConfirmation, true);

    const order = fake.rows("orders")[0];
    assert.equal(order.status, "borrador");
    assert.equal(order.totalQuoted, "1250.00");
    assert.equal(order.contactId, CONTACT);
    assert.ok(order.snapshot);
    assert.equal(fake.rows("order_lines").length, 1);
    assert.equal(fake.rows("order_items").length, 5);
    assert.equal(fake.rows("payments").length, 0);
    assert.ok(fake.rows("audit_events").some((entry) => entry.action === "whatsapp.draft_order.created"));
  });

  it("ignores a model-supplied price on the draft", async () => {
    const parsed = draftOrderWhatsAppTool.inputSchema.parse({
      productName: "Remera",
      quantity: 5,
      unitPrice: 0.01,
    });
    const result = (await draftOrderWhatsAppTool.handler(parsed as never, context)) as Record<string, unknown>;
    assert.equal(result.totalPrice, 1250);
    assert.equal(fake.rows("orders")[0].totalQuoted, "1250.00");
  });

  it("refuses a sub-minimum order without writing anything", async () => {
    fake.seed(products, [
      { id: PRODUCT, sku: "REM-1", name: "Remera", active: true, productKind: "garment", minOrder: 10, zones: [], basePrice: "0" },
    ]);
    const result = (await draftOrderWhatsAppTool.handler(
      { productName: "Remera", quantity: 5 } as never,
      context
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.equal(result.error, "min_order");
    assert.equal(fake.rows("orders").length, 0);
  });

  it("fails closed when the conversation cannot be resolved", async () => {
    const result = (await draftOrderWhatsAppTool.handler(
      { productName: "Remera", quantity: 5 } as never,
      { conversationId: "missing" }
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.equal(result.error, "no_conversation");
    assert.equal(fake.rows("orders").length, 0);
  });
});

describe("recordPaymentIntent — never marks a payment", () => {
  it("records an audit intent and leaves the payments table empty", async () => {
    const result = (await recordPaymentIntentTool.handler(
      { orderNumber: 42, note: "Transferí la seña" } as never,
      context
    )) as Record<string, unknown>;

    assert.equal(result.ok, true);
    assert.equal(result.recorded, true);
    assert.equal(result.requiresHumanConfirmation, true);
    assert.equal(fake.rows("payments").length, 0);

    const audit = fake.rows("audit_events").find((entry) => entry.action === "whatsapp.payment.claim");
    assert.ok(audit);
    const payload = audit?.payload as { after?: Record<string, unknown> };
    assert.equal(payload.after?.orderNumber, 42);
  });

  it("never accepts paid/amount fields from the model", () => {
    const parsed = recordPaymentIntentTool.inputSchema.parse({
      orderNumber: 42,
      paid: true,
      amount: 5000,
      status: "paid",
    }) as Record<string, unknown>;
    assert.equal("paid" in parsed, false);
    assert.equal("amount" in parsed, false);
    assert.equal("status" in parsed, false);
  });

  it("requires a resolvable conversation", async () => {
    const result = (await recordPaymentIntentTool.handler({ orderNumber: 1 } as never, {})) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.equal(result.error, "no_conversation");
  });
});

describe("transferToHuman — effect claims are idempotent per episode", () => {
  it("claims override + owner notification once; a retry in the same episode claims nothing", async () => {
    const first = (await transferToHumanTool.handler(
      { reason: "Cliente pide hablar con una persona", category: "solicitud_cliente" } as never,
      context
    )) as Record<string, unknown>;
    assert.equal(first.ok, true);
    assert.equal(first.handoff, true);

    const claimsAfterFirst = fake.rows("idempotency_keys").length;
    const overrideRowsAfterFirst = fake.rows("agent_memories").filter(
      (entry) => entry.key === `whatsapp-handoff:${CONV}`
    ).length;
    assert.equal(claimsAfterFirst, 3);
    assert.equal(overrideRowsAfterFirst, 1);

    const second = (await transferToHumanTool.handler(
      { reason: "Repito la derivación", category: "solicitud_cliente" } as never,
      context
    )) as Record<string, unknown>;
    assert.equal(second.ok, true);

    // Same episode → no new claims, no second override row, but both calls audit.
    assert.equal(fake.rows("idempotency_keys").length, 3);
    assert.equal(
      fake.rows("agent_memories").filter((entry) => entry.key === `whatsapp-handoff:${CONV}`).length,
      1
    );
    assert.equal(
      fake.rows("audit_events").filter((entry) => entry.action === "whatsapp.handoff.requested").length,
      2
    );
  });

  it("fails closed without a conversation", async () => {
    const result = (await transferToHumanTool.handler(
      { reason: "nada" } as never,
      {}
    )) as Record<string, unknown>;
    assert.equal(result.ok, false);
    assert.equal(result.error, "no_conversation");
    assert.equal(fake.rows("idempotency_keys").length, 0);
  });

  it("the repository seam itself is at-most-once", async () => {
    const service = new HandoffEffectService(new DrizzleHandoffEffectRepository());
    const input = { conversationId: CONV, episode: 3, inboundMessageId: "msg-1", aiEnabled: true };
    const first = await service.claimHandoffEffects(input);
    assert.deepEqual(
      [first.overrideClaimed, first.ownerNotificationClaimed, first.customerReplyClaimed],
      [true, true, true]
    );
    const second = await service.claimHandoffEffects(input);
    assert.deepEqual(
      [second.overrideClaimed, second.ownerNotificationClaimed, second.customerReplyClaimed],
      [false, false, false]
    );
  });

  it("a new episode claims a fresh override + notification", async () => {
    const service = new HandoffEffectService(new DrizzleHandoffEffectRepository());
    await service.claimHandoffEffects({ conversationId: CONV, episode: 0, inboundMessageId: "m1", aiEnabled: true });
    const next = await service.claimHandoffEffects({ conversationId: CONV, episode: 1, inboundMessageId: "m2", aiEnabled: true });
    assert.equal(next.overrideClaimed, true);
    assert.equal(next.ownerNotificationClaimed, true);
    // customer replies are inbound-scoped: a new inbound may reply.
    assert.equal(next.customerReplyClaimed, true);
  });

  it("customer replies stay undeliverable while AI is disabled", async () => {
    const service = new HandoffEffectService(new DrizzleHandoffEffectRepository());
    const claims = await service.claimHandoffEffects({
      conversationId: CONV,
      episode: 0,
      inboundMessageId: "m1",
      aiEnabled: false,
    });
    assert.equal(claims.customerReplyClaimed, true);
    assert.equal(claims.customerReplyDeliverable, false);
    assert.equal(claims.ownerNotificationDeliverable, true);
  });
});
