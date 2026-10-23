/**
 * Customer-facing WhatsApp sales tools (AH Sports textile domain).
 *
 * Port of the SocialCRM hardened tool pattern (`resolveItems` server-side
 * re-pricing + `transferToHuman` effect claims), adapted to the AH schema and
 * the shared `AgentTool` contract so wave 3 can register them unchanged:
 *
 *  - Identity is NEVER model-supplied: `context.conversationId` (server
 *    derived) resolves the conversation's contact, phone and organization.
 *    The model cannot bind a draft to another customer.
 *  - Product/technique/size references resolve by name/label on the server
 *    (unique match or an explicit candidate list) — the model never supplies
 *    ids, prices, totals, or quantities it decided itself.
 *  - All money comes from `quoteOrder()` — the authoritative pricing engine.
 *  - Draft tools only ever write reversible `borrador` orders (+snapshot,
 *    +lines, +items) and always report `requiresHumanConfirmation`.
 *  - `recordPaymentIntent` writes an audit row only — never a payment.
 *  - `transferToHuman` claims the handoff effects idempotently, marks the
 *    24h human override, and notifies bound operators truthfully.
 *
 * Schemas stay plain `z.object` roots so the `zodToParameters` projection
 * (used by `check:agent-tools` and provider tool specs) can walk them.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  contacts,
  conversations,
  orderItems,
  orderLines,
  orders,
  organizations,
  payments,
  productBundleItems,
  productBundles,
  products,
  promotions,
  settings,
  sizes,
  techniques,
} from "@/db/schema";
import type { DbTransaction } from "@/lib/db-transaction";
import { OrderDraftDomainError } from "@/lib/orders/draft-order";
import { fromCents, toCents } from "@/lib/payments";
import {
  addOrderContextItem,
  clearOrderContext,
  getOrderContextSummary,
  markOrderContextOrdered,
  removeOrderContextItem,
} from "@/lib/order-context";
import { quoteOrder, type QuoteResult, type SizeQuantity } from "@/lib/pricing";
import type { AgentTool, AgentToolContext } from "@/lib/agents/tools/types";
import { getStatusSemantic } from "./status-utils";
import { loadSessionState } from "./session-store";
import {
  activateHumanOverride,
  DrizzleHandoffEffectRepository,
  HandoffEffectService,
  notifyHandoffOperators,
} from "./human-handoff";

async function runInTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  const { withDbTransaction } = await import("@/lib/db-transaction");
  return withDbTransaction(fn);
}

/** Decimal-safe money: number → integer cents → canonical "d.dd" string. */
function money(value: number): string {
  return fromCents(toCents(value));
}

const HUMAN_CONFIRMATION_REQUIRED = true as const;

// ─── Server-side identity ────────────────────────────────────────────────────

type ConversationCustomer = {
  conversationId: string;
  contactId: string | null;
  organizationId: string | null;
  customerName: string | null;
  phone: string | null;
};

/**
 * Resolves the customer identity bound to the conversation — the only
 * authority a customer tool may act for. `contactId` may be null when no lead
 * identity has been bound yet; draft tools create/attach one by phone.
 */
async function resolveConversationCustomer(
  context: AgentToolContext,
): Promise<ConversationCustomer | { error: "no_conversation" }> {
  const conversationId = context.conversationId;
  if (!conversationId) return { error: "no_conversation" };
  const [conv] = await db
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      organizationId: conversations.organizationId,
      externalThreadId: conversations.externalThreadId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return { error: "no_conversation" };

  if (conv.customerId) {
    const [contact] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        phone: contacts.phone,
        organizationId: contacts.organizationId,
      })
      .from(contacts)
      .where(eq(contacts.id, conv.customerId))
      .limit(1);
    if (contact) {
      return {
        conversationId,
        contactId: contact.id,
        organizationId: conv.organizationId ?? contact.organizationId,
        customerName: contact.name,
        phone: contact.phone ?? conv.externalThreadId,
      };
    }
  }
  return {
    conversationId,
    contactId: null,
    organizationId: conv.organizationId,
    customerName: null,
    phone: conv.externalThreadId,
  };
}

/**
 * Draft tools need a persisted contact. Reuses the bound contact or resolves
 * one by the conversation phone; creates a minimal `nuevo` contact when none
 * exists and binds it back to the conversation. Never trusts model input.
 */
async function ensureConversationContact(
  tx: DbTransaction,
  customer: ConversationCustomer,
): Promise<{ contactId: string; organizationId: string | null; customerName: string }> {
  if (customer.contactId) {
    return {
      contactId: customer.contactId,
      organizationId: customer.organizationId,
      customerName: customer.customerName ?? "Cliente",
    };
  }
  const phone = customer.phone;
  if (phone) {
    const [existing] = await tx
      .select({ id: contacts.id, name: contacts.name, organizationId: contacts.organizationId })
      .from(contacts)
      .where(eq(contacts.phone, phone))
      .limit(1);
    if (existing) {
      await tx
        .update(conversations)
        .set({ customerId: existing.id })
        .where(eq(conversations.id, customer.conversationId));
      return {
        contactId: existing.id,
        organizationId: customer.organizationId ?? existing.organizationId,
        customerName: existing.name,
      };
    }
  }
  const [created] = await tx
    .insert(contacts)
    .values({
      name: "Cliente WhatsApp",
      phone: phone ?? null,
      organizationId: customer.organizationId,
      role: "cliente",
      status: "nuevo",
      notes: "Contacto creado por el agente de WhatsApp",
    })
    .returning({ id: contacts.id });
  if (!created) throw new OrderDraftDomainError("No se pudo crear el contacto");
  await tx
    .update(conversations)
    .set({ customerId: created.id })
    .where(eq(conversations.id, customer.conversationId));
  return { contactId: created.id, organizationId: customer.organizationId, customerName: "Cliente WhatsApp" };
}

// ─── Server-side catalog resolution ─────────────────────────────────────────

type ResolvedProduct = {
  id: string;
  name: string;
  sku: string;
  productKind: string;
  minOrder: number;
  zones: string[];
};

type Resolution<T> = { ok: true; value: T } | { ok: false; error: "not_found" | "ambiguous"; candidates: string[] };

function candidateNames(rows: Array<{ name: string }>): string[] {
  return rows.map((row) => row.name).slice(0, 8);
}

/** Product by name — exact, then unique ilike; never model-supplied ids. */
async function resolveProductByName(name: string): Promise<Resolution<ResolvedProduct>> {
  const term = name.trim();
  const [exact] = await db
    .select()
    .from(products)
    .where(and(eq(products.active, true), ilike(products.name, term)))
    .limit(2);
  const pool = exact
    ? [exact]
    : await db.select().from(products).where(and(eq(products.active, true), ilike(products.name, `%${term}%`))).limit(9);
  if (pool.length === 0) {
    const available = await db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.active, true))
      .limit(8);
    return { ok: false, error: "not_found", candidates: candidateNames(available) };
  }
  if (pool.length > 1) return { ok: false, error: "ambiguous", candidates: candidateNames(pool) };
  const p = pool[0];
  return {
    ok: true,
    value: { id: p.id, name: p.name, sku: p.sku, productKind: p.productKind, minOrder: p.minOrder, zones: p.zones },
  };
}

async function resolveTechniqueByName(name: string): Promise<Resolution<{ id: string; name: string }>> {
  const term = name.trim();
  const rows = await db
    .select({ id: techniques.id, name: techniques.name })
    .from(techniques)
    .where(and(eq(techniques.active, true), ilike(techniques.name, `%${term}%`)))
    .limit(9);
  if (rows.length === 0) {
    const available = await db.select({ name: techniques.name }).from(techniques).where(eq(techniques.active, true)).limit(8);
    return { ok: false, error: "not_found", candidates: candidateNames(available) };
  }
  if (rows.length > 1) return { ok: false, error: "ambiguous", candidates: candidateNames(rows) };
  return { ok: true, value: rows[0] };
}

/** Maps model-supplied size labels to this product's size ids. */
async function resolveSizeQuantities(
  productId: string,
  requested: Array<{ label: string; quantity: number }> | undefined,
): Promise<
  | { ok: true; sizeQuantities: SizeQuantity[] }
  | { ok: false; error: "unknown_size" | "ambiguous_size"; candidates: string[] }
> {
  const productSizes = await db
    .select({ id: sizes.id, label: sizes.label })
    .from(sizes)
    .where(eq(sizes.productId, productId));
  const available = productSizes.map((row) => row.label);
  if (!requested || requested.length === 0) {
    return { ok: true, sizeQuantities: [] };
  }
  const resolved: SizeQuantity[] = [];
  for (const entry of requested) {
    const label = entry.label.trim().toUpperCase();
    const matches = productSizes.filter((row) => row.label.toUpperCase() === label);
    if (matches.length === 0) return { ok: false, error: "unknown_size", candidates: available };
    if (matches.length > 1) return { ok: false, error: "ambiguous_size", candidates: available };
    resolved.push({ sizeId: matches[0].id, quantity: entry.quantity });
  }
  return { ok: true, sizeQuantities: resolved };
}

/** Shared arg shape for the price/draft tools. */
const garmentRefInput = {
  productName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Nombre del producto o prenda tal como lo mencionó el cliente"),
  quantity: z.number().int().min(1).max(100000).nullish()
    .describe("Cantidad total de prendas (obligatoria si no se indican talles)"),
  sizeQuantities: z
    .array(z.object({ label: z.string().trim().min(1).max(32), quantity: z.number().int().min(1).max(10000) }))
    .max(32)
    .nullish()
    .describe("Curva de talles: [{label:'M',quantity:10},...]. Si se indica, la cantidad total es la suma"),
  techniqueName: z.string().trim().min(1).max(128).nullish()
    .describe("Técnica de personalización (sublimado, DTF, bordado, vinilo, serigrafía)"),
  urgent: z.boolean().optional()
    .describe("Pedido urgente (aplica recargo de la regla de precios)"),
};

type GarmentRefArgs = {
  productName: string;
  quantity?: number | null;
  sizeQuantities?: Array<{ label: string; quantity: number }> | null;
  techniqueName?: string | null;
  urgent?: boolean;
};

type ResolvedGarmentLine =
  | {
      ok: true;
      product: ResolvedProduct;
      techniqueId: string | null;
      techniqueName: string | null;
      quantity: number;
      sizeQuantities: SizeQuantity[];
    }
  | { ok: false; response: Record<string, unknown> };

/** Resolves product + technique + size curve into a server-authoritative line. */
async function resolveGarmentLine(input: GarmentRefArgs): Promise<ResolvedGarmentLine> {
  const product = await resolveProductByName(input.productName);
  if (!product.ok) {
    return {
      ok: false,
      response: {
        ok: false,
        error: product.error === "ambiguous" ? "product_ambiguous" : "product_not_found",
        message:
          product.error === "ambiguous"
            ? "Hay varios productos con ese nombre — pedile al cliente que precise cuál."
            : "No encontré ese producto en el catálogo. Ofrecé las opciones disponibles.",
        candidates: product.candidates,
      },
    };
  }

  let techniqueId: string | null = null;
  let techniqueName: string | null = null;
  if (input.techniqueName) {
    const technique = await resolveTechniqueByName(input.techniqueName);
    if (!technique.ok) {
      return {
        ok: false,
        response: {
          ok: false,
          error: technique.error === "ambiguous" ? "technique_ambiguous" : "technique_not_found",
          message: "No pude resolver la técnica indicada — pedile al cliente que precise cuál o cotizá sin técnica.",
          candidates: technique.candidates,
        },
      };
    }
    techniqueId = technique.value.id;
    techniqueName = technique.value.name;
  }

  const resolvedSizes = await resolveSizeQuantities(product.value.id, input.sizeQuantities ?? undefined);
  if (!resolvedSizes.ok) {
    return {
      ok: false,
      response: {
        ok: false,
        error: resolvedSizes.error,
        message: "Ese talle no existe para este producto — informá los talles disponibles.",
        availableSizes: resolvedSizes.candidates,
      },
    };
  }

  const quantity =
    resolvedSizes.sizeQuantities.length > 0
      ? resolvedSizes.sizeQuantities.reduce((total, entry) => total + entry.quantity, 0)
      : input.quantity ?? null;
  if (!quantity || quantity < 1) {
    return {
      ok: false,
      response: {
        ok: false,
        error: "quantity_required",
        message: "Necesito la cantidad total de prendas o la curva de talles para cotizar.",
      },
    };
  }
  if (input.sizeQuantities && input.quantity && input.quantity !== quantity) {
    return {
      ok: false,
      response: {
        ok: false,
        error: "quantity_mismatch",
        message: `La cantidad total (${input.quantity}) no coincide con la suma por talle (${quantity}).`,
      },
    };
  }

  return {
    ok: true,
    product: product.value,
    techniqueId,
    techniqueName,
    quantity,
    sizeQuantities: resolvedSizes.sizeQuantities,
  };
}

function quoteFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("regla de pricing activa")) return "no_active_pricing_rule";
  if (message.includes("no tiene receta")) return "recipe_missing";
  if (message.includes("no tiene insumos")) return "recipe_empty";
  if (message.includes("no coinciden con la cantidad")) return "quantity_mismatch";
  if (message.includes("no pertenece")) return "size_mismatch";
  if (message.includes("metros/kilo")) return "material_yield_missing";
  if (message.includes("por m") || message.includes("aplicaciones")) return "application_measure_required";
  if (message.includes("componentes")) return "bundle_misconfigured";
  if (message.includes("no encontrad")) return "not_found";
  return "quote_failed";
}

function quoteResponse(quote: QuoteResult, minOrder: number) {
  const line = quote.lines[0];
  const total = quote.totals.price;
  return {
    productName: line?.productName,
    quantity: line?.quantity,
    unitPrice: line?.unitPrice,
    subtotal: line?.subtotal,
    totalPrice: total,
    sizeBreakdown: line?.sizeBreakdown?.map((entry) => ({
      sizeLabel: entry.sizeLabel,
      quantity: entry.quantity,
      unitPrice: entry.unitPrice,
      subtotal: entry.subtotal,
    })),
    bundleComponents: line?.bundleComponents?.map((entry) => ({
      productName: entry.productName,
      quantity: entry.quantity,
    })),
    minOrder,
    belowMinOrder: (line?.quantity ?? 0) < minOrder,
    /** Minimum advance (seña) the pricing rule requires — informational. */
    minAdvanceAmount: Math.round((total * quote.rule.minAdvancePercent) / 100),
    minAdvancePercent: quote.rule.minAdvancePercent,
  };
}

// ─── searchCatalog ───────────────────────────────────────────────────────────

const searchCatalogInput = z.object({
  query: z.string().trim().max(255).nullish()
    .describe("Texto libre para buscar en el catálogo (nombre o SKU); vacío lista todo"),
  limit: z.number().int().min(1).max(20).nullish(),
});

export const searchCatalogTool: AgentTool<z.infer<typeof searchCatalogInput>> = {
  id: "searchCatalog",
  description:
    "Busca productos del catálogo de AH Sports por nombre o SKU. Devuelve nombre, tipo, pedido mínimo y zonas de personalización. NUNCA inventa precios — para precios usá quoteGarment.",
  effect: "read",
  inputSchema: searchCatalogInput,
  async handler(input) {
    const term = input.query?.trim();
    const rows = await db
      .select({
        name: products.name,
        sku: products.sku,
        garmentType: products.garmentType,
        productKind: products.productKind,
        minOrder: products.minOrder,
        zones: products.zones,
        description: products.description,
      })
      .from(products)
      .where(
        term
          ? and(eq(products.active, true), or(ilike(products.name, `%${term}%`), ilike(products.sku, `%${term}%`)))
          : eq(products.active, true),
      )
      .limit(input.limit ?? 8);
    return {
      ok: true as const,
      count: rows.length,
      products: rows.map((row) => ({
        name: row.name,
        sku: row.sku,
        kind: row.productKind,
        garmentType: row.garmentType,
        minOrder: row.minOrder,
        zones: row.zones,
        description: row.description?.slice(0, 200) ?? null,
      })),
      note: "Los precios nunca se muestran desde el catálogo — usá quoteGarment para cotizar con el motor de precios.",
    };
  },
};

// ─── getProductDetail ────────────────────────────────────────────────────────

const productDetailInput = z.object({
  productName: z.string().trim().min(1).max(255).describe("Nombre del producto a detallar"),
});

export const getProductDetailTool: AgentTool<z.infer<typeof productDetailInput>> = {
  id: "getProductDetail",
  description:
    "Detalle de un producto: talles disponibles, pedido mínimo, zonas y componentes si es un conjunto. Resolución por nombre en el servidor.",
  effect: "read",
  inputSchema: productDetailInput,
  async handler(input) {
    const resolved = await resolveProductByName(input.productName);
    if (!resolved.ok) {
      return {
        ok: false as const,
        error: resolved.error === "ambiguous" ? "product_ambiguous" : "product_not_found",
        candidates: resolved.candidates,
      };
    }
    const product = resolved.value;
    const productSizes = await db
      .select({ label: sizes.label, order: sizes.order })
      .from(sizes)
      .where(eq(sizes.productId, product.id))
      .orderBy(sizes.order);

    let bundleComponents: Array<{ name: string; quantity: number }> = [];
    if (product.productKind === "bundle") {
      const [bundle] = await db
        .select({ id: productBundles.id })
        .from(productBundles)
        .where(eq(productBundles.productId, product.id))
        .limit(1);
      if (bundle) {
        const items = await db
          .select({ componentProductId: productBundleItems.componentProductId, quantity: productBundleItems.quantity })
          .from(productBundleItems)
          .where(eq(productBundleItems.bundleId, bundle.id));
        const names = items.length
          ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, items.map((i) => i.componentProductId)))
          : [];
        const nameById = new Map(names.map((n) => [n.id, n.name]));
        bundleComponents = items.map((item) => ({
          name: nameById.get(item.componentProductId) ?? "?",
          quantity: Number(item.quantity),
        }));
      }
    }

    return {
      ok: true as const,
      product: {
        name: product.name,
        sku: product.sku,
        kind: product.productKind,
        minOrder: product.minOrder,
        zones: product.zones,
        sizes: productSizes.map((row) => row.label),
        bundleComponents: bundleComponents.length > 0 ? bundleComponents : undefined,
      },
    };
  },
};

// ─── listTechniques ─────────────────────────────────────────────────────────

const listTechniquesInput = z.object({});

export const listTechniquesTool: AgentTool<z.infer<typeof listTechniquesInput>> = {
  id: "listTechniques",
  description:
    "Lista las técnicas de personalización activas (sublimado, DTF, bordado, vinilo, serigrafía, etc.) con su descripción.",
  effect: "read",
  inputSchema: listTechniquesInput,
  async handler() {
    const rows = await db
      .select({ name: techniques.name, description: techniques.description })
      .from(techniques)
      .where(eq(techniques.active, true))
      .limit(20);
    return { ok: true as const, techniques: rows };
  },
};

// ─── quoteGarment ────────────────────────────────────────────────────────────

const quoteGarmentInput = z.object(garmentRefInput);

export const quoteGarmentTool: AgentTool<z.infer<typeof quoteGarmentInput>> = {
  id: "quoteGarment",
  description:
    "Cotiza una prenda o conjunto con el MOTOR DE PRECIOS del servidor: resuelve producto, talles y técnica por nombre y devuelve precio unitario, subtotal, total y seña mínima. NUNCA inventes precios — usá esta herramienta para cualquier número.",
  effect: "read",
  inputSchema: quoteGarmentInput,
  async handler(input) {
    const resolved = await resolveGarmentLine(input);
    if (!resolved.ok) return resolved.response;

    let quote: QuoteResult;
    try {
      quote = await quoteOrder({
        urgent: input.urgent,
        lines: [
          {
            productId: resolved.product.id,
            quantity: resolved.quantity,
            techniqueId: resolved.techniqueId,
            sizeQuantities: resolved.sizeQuantities.length > 0 ? resolved.sizeQuantities : undefined,
          },
        ],
      });
    } catch (error) {
      return {
        ok: false as const,
        error: "quote_failed" as const,
        reason: quoteFailureReason(error),
        message:
          "No se pudo cotizar — puede faltar la receta/BOM del producto o la regla de precios. Decile al cliente que un humano confirma la cotización.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    return {
      ok: true as const,
      technique: resolved.techniqueName,
      ...quoteResponse(quote, resolved.product.minOrder),
      note: "Cotización informativa calculada por el motor de precios. Para formalizarla usá draftQuote (queda en borrador hasta que un humano confirme).",
    };
  },
};

// ─── getMyOrders / getMyOrderStatus ──────────────────────────────────────────

const myOrdersInput = z.object({});

async function listCustomerOrders(contactId: string) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      urgent: orders.urgent,
      totalQuoted: orders.totalQuoted,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.contactId, contactId))
    .orderBy(desc(orders.createdAt))
    .limit(10);
}

export const getMyOrdersTool: AgentTool<z.infer<typeof myOrdersInput>> = {
  id: "getMyOrders",
  description:
    "Lista los pedidos del cliente actual (el contacto vinculado a esta conversación de WhatsApp). Devuelve número, estado y total cotizado.",
  effect: "read",
  inputSchema: myOrdersInput,
  async handler(_input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    if (!customer.contactId) {
      return {
        ok: true as const,
        orders: [] as const,
        note: "Este número todavía no tiene pedidos registrados.",
      };
    }
    const rows = await listCustomerOrders(customer.contactId);
    return {
      ok: true as const,
      orders: rows.map((row) => ({
        number: row.number,
        status: row.status,
        statusLabel: getStatusSemantic(row.status).label,
        statusDescription: getStatusSemantic(row.status).description,
        totalQuoted: row.totalQuoted ? Number(row.totalQuoted) : null,
        urgent: row.urgent,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
};

const myOrderStatusInput = z.object({
  orderNumber: z.number().int().positive().max(999999999).describe("Número de pedido visible para el cliente"),
});

export const getMyOrderStatusTool: AgentTool<z.infer<typeof myOrderStatusInput>> = {
  id: "getMyOrderStatus",
  description:
    "Estado y saldo de UN pedido del cliente actual, por número de pedido. Solo funciona para pedidos del contacto vinculado a esta conversación.",
  effect: "read",
  inputSchema: myOrderStatusInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    if (!customer.contactId) {
      return { ok: false as const, error: "no_orders", message: "Este número todavía no tiene pedidos registrados." };
    }
    const [order] = await db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        totalQuoted: orders.totalQuoted,
        urgent: orders.urgent,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.number, input.orderNumber), eq(orders.contactId, customer.contactId)))
      .limit(1);
    if (!order) {
      return {
        ok: false as const,
        error: "order_not_found",
        message: "No encontré ese número de pedido para este cliente — verificá el número o usá getMyOrders.",
      };
    }
    const paid = await db
      .select({ amount: payments.amount })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.cancelled, false)));
    const paidTotal = paid.reduce((total, row) => total + Number(row.amount), 0);
    const quoted = order.totalQuoted ? Number(order.totalQuoted) : 0;
    const semantic = getStatusSemantic(order.status);
    return {
      ok: true as const,
      order: {
        number: order.number,
        status: order.status,
        statusLabel: semantic.label,
        statusDescription: semantic.description,
        totalQuoted: quoted,
        paid: Math.round(paidTotal * 100) / 100,
        balance: Math.round((quoted - paidTotal) * 100) / 100,
        urgent: order.urgent,
        createdAt: order.createdAt.toISOString(),
      },
    };
  },
};

// ─── draftQuote ──────────────────────────────────────────────────────────────

const draftQuoteInput = z.object({
  ...garmentRefInput,
  organizationName: z.string().trim().min(1).max(255).nullish()
    .describe("Nombre del club/colegio/empresa si el cliente lo mencionó"),
  notes: z.string().trim().max(4000).nullish()
    .describe("Notas del pedido que dio el cliente (diseño, referencias, aclaraciones)"),
});

export const draftQuoteWhatsAppTool: AgentTool<z.infer<typeof draftQuoteInput>> = {
  id: "draftQuote",
  description:
    "Formaliza una cotización: calcula el precio con el motor y guarda un pedido BORRADOR con snapshot inmutable, vinculado al cliente de esta conversación. Nunca aprueba ni cobra. Requiere confirmación humana.",
  effect: "draft",
  inputSchema: draftQuoteInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    const resolved = await resolveGarmentLine(input);
    if (!resolved.ok) return resolved.response;

    let quote: QuoteResult;
    try {
      quote = await quoteOrder({
        urgent: input.urgent,
        lines: [
          {
            productId: resolved.product.id,
            quantity: resolved.quantity,
            techniqueId: resolved.techniqueId,
            sizeQuantities: resolved.sizeQuantities.length > 0 ? resolved.sizeQuantities : undefined,
          },
        ],
      });
    } catch (error) {
      return {
        ok: false as const,
        draft: false as const,
        error: "quote_failed" as const,
        reason: quoteFailureReason(error),
        message: "No se pudo cotizar el pedido — probablemente falte receta/BOM o regla de precios. No se guardó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    const { totals } = quote;
    const result = await runInTransaction(async (tx) => {
      const bound = await ensureConversationContact(tx, customer);

      let organizationId = bound.organizationId;
      if (input.organizationName) {
        const [existingOrg] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(ilike(organizations.name, input.organizationName))
          .limit(1);
        if (existingOrg) {
          organizationId = existingOrg.id;
        } else {
          const [createdOrg] = await tx
            .insert(organizations)
            .values({ name: input.organizationName, kind: "club", notes: "Creada desde el agente de WhatsApp" })
            .returning({ id: organizations.id });
          if (!createdOrg) throw new OrderDraftDomainError("No se pudo crear la organización");
          organizationId = createdOrg.id;
        }
      }

      const publicToken = randomBytes(24).toString("base64url");
      const [order] = await tx
        .insert(orders)
        .values({
          publicToken,
          organizationId,
          contactId: bound.contactId,
          status: "borrador",
          urgent: input.urgent ?? false,
          notes: input.notes ?? null,
          pricingRuleId: quote.rule.id,
          snapshot: quote.snapshot,
          totalQuoted: money(totals.price),
          totalCost: money(totals.cost),
          marginPercent: money(totals.marginPercent),
        })
        .returning({ id: orders.id, number: orders.number });
      if (!order) throw new OrderDraftDomainError("No se pudo crear el pedido borrador");

      await tx.insert(orderLines).values(
        quote.lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          techniqueId: resolved.techniqueId,
          quantity: line.quantity,
          unitPrice: money(line.unitPrice),
          unitCost: money(line.unitCost),
        })),
      );

      await tx.insert(auditEvents).values({
        actorKind: "agent",
        actorRef: "whatsapp-sales-agent",
        action: "whatsapp.draft_quote.created",
        entityType: "order",
        entityId: order.id,
        correlationId: customer.conversationId,
        payload: { after: { orderNumber: order.number, totalQuoted: totals.price } },
      });

      return { orderId: order.id, number: order.number };
    });

    return {
      ok: true as const,
      draft: true as const,
      entity: "quote" as const,
      orderId: result.orderId,
      number: result.number,
      status: "borrador" as const,
      customerName: customer.customerName ?? undefined,
      ...quoteResponse(quote, resolved.product.minOrder),
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Borrador de cotización guardado con snapshot en estado 'borrador'. Un humano debe confirmarla antes de enviarla formalmente — no está aprobada ni se cobró nada.",
    };
  },
};

// ─── draftOrder ──────────────────────────────────────────────────────────────

const draftOrderInput = z.object({
  ...garmentRefInput,
  organizationName: z.string().trim().min(1).max(255).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  items: z
    .array(
      z.object({
        sizeLabel: z.string().trim().min(1).max(32).nullish(),
        individualName: z.string().trim().max(128).nullish(),
        individualNumber: z.string().trim().max(32).nullish(),
      }),
    )
    .max(1000)
    .nullish()
    .describe("Personalización por prenda (nombre/número). Opcional — sin datos quedan en blanco"),
});

export const draftOrderWhatsAppTool: AgentTool<z.infer<typeof draftOrderInput>> = {
  id: "draftOrder",
  description:
    "Crea un BORRADOR de pedido con precio del motor y prendas por talle (opcionalmente personalizadas con nombre/número), vinculado al cliente de esta conversación. No aprueba, no cobra ni avanza producción. Requiere confirmación humana.",
  effect: "draft",
  inputSchema: draftOrderInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    const resolved = await resolveGarmentLine(input);
    if (!resolved.ok) return resolved.response;
    if (resolved.quantity < resolved.product.minOrder) {
      return {
        ok: false as const,
        draft: false as const,
        error: "min_order" as const,
        message: `El pedido mínimo de "${resolved.product.name}" es de ${resolved.product.minOrder} prendas.`,
        minOrder: resolved.product.minOrder,
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    let quote: QuoteResult;
    try {
      quote = await quoteOrder({
        urgent: input.urgent,
        lines: [
          {
            productId: resolved.product.id,
            quantity: resolved.quantity,
            techniqueId: resolved.techniqueId,
            sizeQuantities: resolved.sizeQuantities.length > 0 ? resolved.sizeQuantities : undefined,
          },
        ],
      });
    } catch (error) {
      return {
        ok: false as const,
        draft: false as const,
        error: "quote_failed" as const,
        reason: quoteFailureReason(error),
        message: "No se pudo cotizar el pedido — probablemente falte receta/BOM o regla de precios. No se guardó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    // Build per-unit items: explicit personalization wins; otherwise blank
    // items matching the size curve (or unlabeled units when no sizes given).
    const explicitItems = input.items ?? [];
    const sizeById = new Map<string, string>();
    if (resolved.sizeQuantities.length > 0) {
      const rows = await db
        .select({ id: sizes.id, label: sizes.label })
        .from(sizes)
        .where(inArray(sizes.id, resolved.sizeQuantities.flatMap((s) => (s.sizeId ? [s.sizeId] : []))));
      for (const row of rows) sizeById.set(row.label.toUpperCase(), row.id);
    }
    const expanded: Array<{ sizeId: string | null; individualName: string | null; individualNumber: string | null }> = [];
    if (explicitItems.length > 0) {
      for (const item of explicitItems) {
        let sizeId: string | null = null;
        if (item.sizeLabel) {
          const mapped = sizeById.get(item.sizeLabel.trim().toUpperCase());
          if (!mapped) {
            return {
              ok: false as const,
              draft: false as const,
              error: "unknown_size" as const,
              message: `El talle "${item.sizeLabel}" de una prenda personalizada no existe para este producto.`,
              requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
            };
          }
          sizeId = mapped;
        }
        expanded.push({
          sizeId,
          individualName: item.individualName ?? null,
          individualNumber: item.individualNumber ?? null,
        });
      }
      if (expanded.length !== resolved.quantity) {
        return {
          ok: false as const,
          draft: false as const,
          error: "quantity_mismatch" as const,
          message: `Las prendas personalizadas (${expanded.length}) no coinciden con la cantidad total (${resolved.quantity}).`,
          requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
        };
      }
    } else if (resolved.sizeQuantities.length > 0) {
      for (const entry of resolved.sizeQuantities) {
        for (let i = 0; i < entry.quantity; i++) {
          expanded.push({ sizeId: entry.sizeId, individualName: null, individualNumber: null });
        }
      }
    } else {
      for (let i = 0; i < resolved.quantity; i++) {
        expanded.push({ sizeId: null, individualName: null, individualNumber: null });
      }
    }

    const { totals } = quote;
    const result = await runInTransaction(async (tx) => {
      const bound = await ensureConversationContact(tx, customer);

      let organizationId = bound.organizationId;
      if (input.organizationName) {
        const [existingOrg] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(ilike(organizations.name, input.organizationName))
          .limit(1);
        if (existingOrg) {
          organizationId = existingOrg.id;
        } else {
          const [createdOrg] = await tx
            .insert(organizations)
            .values({ name: input.organizationName, kind: "club", notes: "Creada desde el agente de WhatsApp" })
            .returning({ id: organizations.id });
          if (!createdOrg) throw new OrderDraftDomainError("No se pudo crear la organización");
          organizationId = createdOrg.id;
        }
      }

      const publicToken = randomBytes(24).toString("base64url");
      const [order] = await tx
        .insert(orders)
        .values({
          publicToken,
          organizationId,
          contactId: bound.contactId,
          status: "borrador",
          urgent: input.urgent ?? false,
          notes: input.notes ?? null,
          pricingRuleId: quote.rule.id,
          snapshot: quote.snapshot,
          totalQuoted: money(totals.price),
          totalCost: money(totals.cost),
          marginPercent: money(totals.marginPercent),
        })
        .returning({ id: orders.id, number: orders.number });
      if (!order) throw new OrderDraftDomainError("No se pudo crear el pedido borrador");

      const [line] = await tx
        .insert(orderLines)
        .values({
          orderId: order.id,
          productId: resolved.product.id,
          techniqueId: resolved.techniqueId,
          quantity: resolved.quantity,
          unitPrice: money(quote.lines[0]?.unitPrice ?? 0),
          unitCost: money(quote.lines[0]?.unitCost ?? 0),
        })
        .returning({ id: orderLines.id });
      if (!line) throw new OrderDraftDomainError("No se pudo crear la línea del pedido");

      if (expanded.length > 0) {
        await tx.insert(orderItems).values(
          expanded.map((item) => ({
            orderLineId: line.id,
            sizeId: item.sizeId,
            individualName: item.individualName,
            individualNumber: item.individualNumber,
          })),
        );
      }

      await tx.insert(auditEvents).values({
        actorKind: "agent",
        actorRef: "whatsapp-sales-agent",
        action: "whatsapp.draft_order.created",
        entityType: "order",
        entityId: order.id,
        correlationId: customer.conversationId,
        payload: {
          after: { orderNumber: order.number, totalQuoted: totals.price, items: expanded.length },
        },
      });

      return { orderId: order.id, number: order.number };
    });

    return {
      ok: true as const,
      draft: true as const,
      entity: "order" as const,
      orderId: result.orderId,
      number: result.number,
      status: "borrador" as const,
      items: expanded.length,
      ...quoteResponse(quote, resolved.product.minOrder),
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Borrador de pedido guardado en estado 'borrador' con precio del motor. Un humano debe revisarlo y confirmarlo: no está aprobado, no se cobró nada y la producción no avanzó.",
    };
  },
};

// ─── recordPaymentIntent ─────────────────────────────────────────────────────

const paymentIntentInput = z.object({
  orderNumber: z.number().int().positive().max(999999999).nullish()
    .describe("Número de pedido al que refiere el aviso de pago"),
  note: z.string().trim().max(1000).nullish()
    .describe("Detalle que dio el cliente (monto dicho, comprobante enviado, etc.)"),
});

export const recordPaymentIntentTool: AgentTool<z.infer<typeof paymentIntentInput>> = {
  id: "recordPaymentIntent",
  description:
    "Registra el AVISO de un pago o seña que el cliente dice haber hecho. NUNCA carga el pago — solo deja constancia para que el equipo lo verifique. Usá esto cuando el cliente avisa que pagó o transfirió.",
  effect: "draft",
  inputSchema: paymentIntentInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    await db.insert(auditEvents).values({
      actorKind: "agent",
      actorRef: "whatsapp-sales-agent",
      action: "whatsapp.payment.claim",
      entityType: "conversation",
      entityId: customer.conversationId,
      payload: {
        after: {
          contactId: customer.contactId,
          orderNumber: input.orderNumber ?? null,
          note: input.note?.slice(0, 500) ?? null,
        },
      },
    });
    return {
      ok: true as const,
      recorded: true as const,
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Aviso registrado para el equipo. El pago NO quedó cargado — un humano lo verifica y lo acredita. Decile al cliente que el equipo confirma la recepción.",
    };
  },
};

// ─── transferToHuman ─────────────────────────────────────────────────────────

const transferInput = z.object({
  reason: z.string().trim().min(1).max(500).describe("Motivo claro de la derivación"),
  category: z
    .enum(["reclamo", "pedido_complejo", "pago", "diseño", "plazo", "legal", "no_puede_resolver", "solicitud_cliente", "otro"])
    .nullish()
    .describe("Categoría de la derivación"),
  conversationSummary: z.string().trim().max(1000).nullish()
    .describe("Resumen breve de la conversación hasta ahora"),
});

export const transferToHumanTool: AgentTool<z.infer<typeof transferInput>> = {
  id: "transferToHuman",
  description:
    "Deriva la conversación a una persona del equipo. Usá esto cuando: no podés resolver, el cliente lo pide, hay reclamo grave, tema de pagos complejo, dudas de diseño/archivos, o cualquier situación que requiera intervención humana.",
  effect: "draft",
  inputSchema: transferInput,
  async handler(input, context) {
    const conversationId = context.conversationId;
    if (!conversationId) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }

    const session = await loadSessionState(conversationId);
    const episode = session?.episode ?? 0;
    const claims = await new HandoffEffectService(new DrizzleHandoffEffectRepository()).claimHandoffEffects({
      conversationId,
      episode,
      inboundMessageId: `tool-transfer:${conversationId}:${episode}`,
      aiEnabled: true,
    });

    if (claims.overrideClaimed) {
      await activateHumanOverride(conversationId, episode);
    }

    const customer = await resolveConversationCustomer(context);
    const customerName = "error" in customer ? undefined : (customer.customerName ?? undefined);

    let ownerNotified = false;
    if (claims.ownerNotificationClaimed) {
      const notified = await notifyHandoffOperators({
        conversationId,
        customerName,
        reason: input.reason.slice(0, 200),
        summary: input.conversationSummary?.slice(0, 400),
      });
      ownerNotified = notified.notified;
    }

    await db.insert(auditEvents).values({
      actorKind: "agent",
      actorRef: "whatsapp-sales-agent",
      action: "whatsapp.handoff.requested",
      entityType: "conversation",
      entityId: conversationId,
      payload: {
        after: {
          episode,
          reason: input.reason.slice(0, 200),
          category: input.category ?? null,
          ownerNotified,
          overrideClaimed: claims.overrideClaimed,
        },
      },
    });

    return {
      ok: true as const,
      handoff: true as const,
      ownerNotified,
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      message: ownerNotified
        ? "Ya avisé al equipo — en breve una persona te va a responder por acá."
        : "Anoté tu caso para que te atienda una persona del equipo a la brevedad. (IMPORTANTE: el canal de aviso no confirmó entrega — NO le digas al cliente que el equipo ya fue notificado; decile que lo van a contactar.)",
    };
  },
};

// ─── A-09 · Conversation cart (order context) ───────────────────────────────
//
// Transient cart the agent fills BEFORE formalizing. Rows live 30 minutes and
// belong to this conversation only — `context.conversationId` scopes every
// read/write, the model can never touch another customer's cart. No prices
// are stored or shown here: pricing stays server-authoritative at draft time.

const addCartItemInput = z.object({
  productName: z.string().trim().min(1).max(255).describe("Nombre del producto mencionado por el cliente"),
  quantity: z.number().int().min(1).max(100000).describe("Cantidad de prendas"),
  sizeLabel: z.string().trim().min(1).max(32).nullish().describe("Talle si el cliente lo indicó (S, M, L, XL...)"),
  techniqueName: z.string().trim().min(1).max(128).nullish().describe("Técnica si la indicó (sublimado, DTF, bordado...)"),
  notes: z.string().trim().max(500).nullish().describe("Aclaraciones del cliente para este ítem"),
});

export const addCartItemTool: AgentTool<z.infer<typeof addCartItemInput>> = {
  id: "addCartItem",
  description:
    "Agrega un producto al carrito de esta conversación (dura 30 minutos). Usá esto a medida que el cliente pide cosas para no perder el detalle. Después draftOrderFromCart formaliza todo junto.",
  effect: "draft",
  inputSchema: addCartItemInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    // Resolve on the server so the cart holds real catalog references; an
    // unresolved name is still storable (the draft step re-resolves and can
    // offer candidates) — but we flag it so the agent can fix it early.
    const product = await resolveProductByName(input.productName);
    const resolvedName = product.ok ? product.value.name : input.productName.trim();
    if (input.sizeLabel && product.ok) {
      const resolved = await resolveSizeQuantities(product.value.id, [{ label: input.sizeLabel, quantity: input.quantity }]);
      if (!resolved.ok) {
        return {
          ok: false as const,
          error: resolved.error,
          message: `El talle "${input.sizeLabel}" no existe para ${product.value.name}.`,
          availableSizes: resolved.candidates,
        };
      }
    }
    await addOrderContextItem({
      conversationId: customer.conversationId,
      phone: customer.phone ?? "",
      productId: product.ok ? product.value.id : null,
      productName: resolvedName,
      sizeLabel: input.sizeLabel?.trim() || null,
      techniqueName: input.techniqueName?.trim() || null,
      quantity: input.quantity,
      notes: input.notes ?? null,
    });
    const cart = await getOrderContextSummary(customer.conversationId);
    return {
      ok: true as const,
      added: `${input.quantity}x ${resolvedName}`,
      resolvedToCatalog: product.ok,
      cartSize: cart.length,
      note: product.ok
        ? "Item agregado al carrito. Cuando el cliente cierre, usá draftOrderFromCart."
        : "Guardado, pero no pude resolver el producto en el catálogo — verificá el nombre antes de formalizar.",
    };
  },
};

const getCartInput = z.object({});

export const getCartTool: AgentTool<z.infer<typeof getCartInput>> = {
  id: "getCart",
  description:
    "Muestra el carrito actual de esta conversación (ítems pendientes de formalizar, con su id para poder quitarlos).",
  effect: "read",
  inputSchema: getCartInput,
  async handler(_input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    const items = await getOrderContextSummary(customer.conversationId);
    return {
      ok: true as const,
      count: items.length,
      items: items.map((item) => ({
        itemId: item.id,
        productName: item.productName,
        quantity: item.quantity,
        sizeLabel: item.sizeLabel,
        techniqueName: item.techniqueName,
        notes: item.notes,
      })),
      note: items.length === 0 ? "El carrito está vacío." : "Para formalizar todo junto usá draftOrderFromCart; para quitar un ítem, removeCartItem.",
    };
  },
};

const removeCartItemInput = z.object({
  itemId: z.string().trim().min(1).max(64).describe("itemId devuelto por getCart"),
});

export const removeCartItemTool: AgentTool<z.infer<typeof removeCartItemInput>> = {
  id: "removeCartItem",
  description: "Quita un ítem del carrito de esta conversación por su itemId (lo devuelve getCart).",
  effect: "draft",
  inputSchema: removeCartItemInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    const removed = await removeOrderContextItem(customer.conversationId, input.itemId);
    return removed
      ? { ok: true as const, removed: true as const }
      : { ok: false as const, error: "item_not_found", message: "Ese ítem no está en el carrito o ya expiró." };
  },
};

const clearCartInput = z.object({});

export const clearCartTool: AgentTool<z.infer<typeof clearCartInput>> = {
  id: "clearCart",
  description: "Vacía el carrito de esta conversación cuando el cliente quiere empezar de nuevo.",
  effect: "draft",
  inputSchema: clearCartInput,
  async handler(_input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    const removed = await clearOrderContext(customer.conversationId);
    return { ok: true as const, removed };
  },
};

const draftFromCartInput = z.object({
  organizationName: z.string().trim().min(1).max(255).nullish()
    .describe("Club/colegio/empresa si el cliente lo mencionó"),
  notes: z.string().trim().max(4000).nullish(),
  urgent: z.boolean().optional(),
});

/**
 * Formalizes the live cart into ONE borrador order. Each cart row re-resolves
 * its product/technique/size server-side and the whole order re-prices through
 * quoteOrder() — the cart is a convenience, never a price source.
 */
export const draftOrderFromCartTool: AgentTool<z.infer<typeof draftFromCartInput>> = {
  id: "draftOrderFromCart",
  description:
    "Convierte el carrito completo de esta conversación en UN pedido BORRADOR con precio del motor. Requiere carrito no vacío. Requiere confirmación humana — no aprueba ni cobra.",
  effect: "draft",
  inputSchema: draftFromCartInput,
  async handler(input, context) {
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }
    const cart = await getOrderContextSummary(customer.conversationId);
    if (cart.length === 0) {
      return {
        ok: false as const,
        draft: false as const,
        error: "empty_cart" as const,
        message: "El carrito está vacío — primero agregá productos con addCartItem.",
      };
    }

    // Re-resolve every row server-side. A row that no longer resolves (or
    // never did) aborts the whole draft with a fixable list — a partial draft
    // would silently drop items the client believes are included.
    const resolvedLines: Array<{
      product: ResolvedProduct;
      techniqueId: string | null;
      quantity: number;
      sizeQuantities: SizeQuantity[];
      notes: string | null;
    }> = [];
    const failures: string[] = [];
    for (const item of cart) {
      const product = await resolveProductByName(item.productName);
      if (!product.ok) {
        failures.push(`${item.productName} (${product.error === "ambiguous" ? "ambiguë" : "no existe"})`);
        continue;
      }
      let techniqueId: string | null = null;
      if (item.techniqueName) {
        const technique = await resolveTechniqueByName(item.techniqueName);
        if (!technique.ok) {
          failures.push(`técnica "${item.techniqueName}" en ${item.productName}`);
          continue;
        }
        techniqueId = technique.value.id;
      }
      let sizeQuantities: SizeQuantity[] = [];
      if (item.sizeLabel) {
        const resolved = await resolveSizeQuantities(product.value.id, [{ label: item.sizeLabel, quantity: item.quantity }]);
        if (!resolved.ok) {
          failures.push(`talle "${item.sizeLabel}" en ${item.productName}`);
          continue;
        }
        sizeQuantities = resolved.sizeQuantities;
      }
      resolvedLines.push({
        product: product.value,
        techniqueId,
        quantity: item.quantity,
        sizeQuantities,
        notes: item.notes,
      });
    }
    if (failures.length > 0) {
      return {
        ok: false as const,
        draft: false as const,
        error: "unresolved_cart_items" as const,
        message: `No pude resolver: ${failures.join(", ")}. Corregí el carrito (getCart/removeCartItem/addCartItem) y reintentá.`,
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    let quote: QuoteResult;
    try {
      quote = await quoteOrder({
        urgent: input.urgent,
        lines: resolvedLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          techniqueId: line.techniqueId,
          sizeQuantities: line.sizeQuantities.length > 0 ? line.sizeQuantities : undefined,
        })),
      });
    } catch (error) {
      return {
        ok: false as const,
        draft: false as const,
        error: "quote_failed" as const,
        reason: quoteFailureReason(error),
        message: "No se pudo cotizar el carrito — probablemente falte receta/BOM o regla de precios. No se guardó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    const { totals } = quote;
    const result = await runInTransaction(async (tx) => {
      const bound = await ensureConversationContact(tx, customer);

      let organizationId = bound.organizationId;
      if (input.organizationName) {
        const [existingOrg] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(ilike(organizations.name, input.organizationName))
          .limit(1);
        if (existingOrg) {
          organizationId = existingOrg.id;
        } else {
          const [createdOrg] = await tx
            .insert(organizations)
            .values({ name: input.organizationName, kind: "club", notes: "Creada desde el agente de WhatsApp" })
            .returning({ id: organizations.id });
          if (!createdOrg) throw new OrderDraftDomainError("No se pudo crear la organización");
          organizationId = createdOrg.id;
        }
      }

      const publicToken = randomBytes(24).toString("base64url");
      const [order] = await tx
        .insert(orders)
        .values({
          publicToken,
          organizationId,
          contactId: bound.contactId,
          status: "borrador",
          urgent: input.urgent ?? false,
          notes: input.notes ?? null,
          pricingRuleId: quote.rule.id,
          snapshot: quote.snapshot,
          totalQuoted: money(totals.price),
          totalCost: money(totals.cost),
          marginPercent: money(totals.marginPercent),
        })
        .returning({ id: orders.id, number: orders.number });
      if (!order) throw new OrderDraftDomainError("No se pudo crear el pedido borrador");

      const insertedLines = await tx
        .insert(orderLines)
        .values(
          quote.lines.map((line, i) => ({
            orderId: order.id,
            productId: line.productId,
            techniqueId: resolvedLines[i]?.techniqueId ?? null,
            quantity: line.quantity,
            unitPrice: money(line.unitPrice),
            unitCost: money(line.unitCost),
            notes: resolvedLines[i]?.notes ?? null,
          })),
        )
        .returning({ id: orderLines.id });

      // Expand per-unit rows for sized lines (same shape draftOrder produces).
      const expandedItems: Array<{ orderLineId: string; sizeId: string | null }> = [];
      quote.lines.forEach((_line, i) => {
        const lineRow = insertedLines[i];
        const resolved = resolvedLines[i];
        if (!lineRow || !resolved) return;
        if (resolved.sizeQuantities.length > 0) {
          for (const sq of resolved.sizeQuantities) {
            for (let k = 0; k < sq.quantity; k++) expandedItems.push({ orderLineId: lineRow.id, sizeId: sq.sizeId });
          }
        }
      });
      if (expandedItems.length > 0) {
        await tx.insert(orderItems).values(
          expandedItems.map((item) => ({
            orderLineId: item.orderLineId,
            sizeId: item.sizeId,
            individualName: null,
            individualNumber: null,
          })),
        );
      }

      await tx.insert(auditEvents).values({
        actorKind: "agent",
        actorRef: "whatsapp-sales-agent",
        action: "whatsapp.draft_order.from_cart",
        entityType: "order",
        entityId: order.id,
        correlationId: customer.conversationId,
        payload: { after: { orderNumber: order.number, totalQuoted: totals.price, cartItems: cart.length } },
      });

      return { orderId: order.id, number: order.number };
    });

    await markOrderContextOrdered(customer.conversationId);

    const totalQuantity = resolvedLines.reduce((sum, line) => sum + line.quantity, 0);
    return {
      ok: true as const,
      draft: true as const,
      entity: "order" as const,
      orderId: result.orderId,
      number: result.number,
      status: "borrador" as const,
      cartItems: cart.length,
      totalQuantity,
      totalPrice: totals.price,
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Borrador creado desde el carrito con precio del motor (estado 'borrador'). El carrito quedó consumido. Un humano debe confirmarlo: no está aprobado ni se cobró nada.",
    };
  },
};

// ─── A-11 · Business info tools (settings-backed) ────────────────────────────
//
// Read-only business configuration the customer may ask about. Every value
// comes from the `settings` table — when a key is absent the tool says so
// plainly instead of inventing hours, deadlines or payment data.

async function readSetting<T>(key: string): Promise<T | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return (row?.value as T | undefined) ?? null;
}

type BusinessHourDay = { day: string; open: boolean; openTime: string; closeTime: string };

const AR_DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function argentinaNow(): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { dayIndex, minutes: hour * 60 + minute };
}

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

const businessHoursInput = z.object({});

export const getBusinessHoursTool: AgentTool<z.infer<typeof businessHoursInput>> = {
  id: "getBusinessHours",
  description:
    "Horarios de atención del taller y si está abierto ahora. Usar cuando el cliente pregunte por horarios, si atienden hoy, o cuándo pueden pasar.",
  effect: "read",
  inputSchema: businessHoursInput,
  async handler() {
    const hours = await readSetting<BusinessHourDay[]>("taller_horarios");
    if (!Array.isArray(hours) || hours.length === 0) {
      return {
        ok: true as const,
        configured: false as const,
        message: "No hay horarios configurados. Decile al cliente que el equipo confirma disponibilidad por este medio.",
      };
    }
    const { dayIndex, minutes } = argentinaNow();
    const todayName = AR_DAYS[dayIndex];
    const today = hours.find((h) => h.day === todayName);

    // Overnight shifts carry into early morning (same rule as SocialCRM).
    const yesterdayName = AR_DAYS[(dayIndex + 6) % 7];
    const yesterday = hours.find((h) => h.day === yesterdayName);
    let isOpenNow = false;
    if (yesterday?.open && toMin(yesterday.closeTime) < toMin(yesterday.openTime) && minutes < toMin(yesterday.closeTime)) {
      isOpenNow = true;
    }
    if (!isOpenNow && today?.open) {
      const openMin = toMin(today.openTime);
      const closeMin = toMin(today.closeTime);
      isOpenNow = closeMin < openMin ? minutes >= openMin : minutes >= openMin && minutes < closeMin;
    }

    return {
      ok: true as const,
      configured: true as const,
      isOpenNow,
      today: today?.open ? `${today.openTime}–${today.closeTime}` : "cerrado",
      schedule: hours.filter((h) => h.open).map((h) => `${h.day}: ${h.openTime}–${h.closeTime}`),
    };
  },
};

const checkAvailabilityInput = z.object({
  productName: z.string().trim().min(1).max(255).describe("Nombre del producto a consultar"),
});

export const checkAvailabilityTool: AgentTool<z.infer<typeof checkAvailabilityInput>> = {
  id: "checkAvailability",
  description:
    "Verifica si un producto del catálogo está activo para pedir y devuelve su pedido mínimo y el plazo de producción configurado. AH Sports fabrica a pedido — no hay stock físico.",
  effect: "read",
  inputSchema: checkAvailabilityInput,
  async handler(input) {
    const resolved = await resolveProductByName(input.productName);
    if (!resolved.ok) {
      return {
        ok: false as const,
        error: resolved.error === "ambiguous" ? "product_ambiguous" : "product_not_found",
        candidates: resolved.candidates,
        message: "No encontré ese producto activo en el catálogo.",
      };
    }
    const turnaround = await readSetting<string>("taller_plazo");
    return {
      ok: true as const,
      available: true as const,
      productName: resolved.value.name,
      productKind: resolved.value.productKind,
      minOrder: resolved.value.minOrder,
      zones: resolved.value.zones,
      productionTurnaround: typeof turnaround === "string" && turnaround.trim() ? turnaround.trim() : null,
      note:
        "El producto está activo y se fabrica a pedido. " +
        (turnaround
          ? "El plazo indicado es el configurado por el taller."
          : "No hay plazo de producción configurado — el equipo confirma el plazo al formalizar.") +
        " Para precio exacto usá quoteGarment.",
    };
  },
};

const paymentAliasInput = z.object({});

export const getPaymentAliasTool: AgentTool<z.infer<typeof paymentAliasInput>> = {
  id: "getPaymentAlias",
  description:
    "Datos de pago del taller (alias/CBU/banco) leídos de la configuración. Usar cuando el cliente pida cómo pagar la seña o el saldo. Si no hay datos configurados, decíselo y derivá.",
  effect: "read",
  inputSchema: paymentAliasInput,
  async handler() {
    const [alias, cbu, bank] = await Promise.all([
      readSetting<string>("taller_alias"),
      readSetting<string>("taller_cbu"),
      readSetting<string>("taller_banco"),
    ]);
    const data = {
      alias: typeof alias === "string" && alias.trim() ? alias.trim() : null,
      cbu: typeof cbu === "string" && cbu.trim() ? cbu.trim() : null,
      bank: typeof bank === "string" && bank.trim() ? bank.trim() : null,
    };
    if (!data.alias && !data.cbu) {
      return {
        ok: true as const,
        configured: false as const,
        message: "No hay datos de pago configurados. Derivá al cliente con el equipo (transferToHuman) para coordinar la seña.",
      };
    }
    return {
      ok: true as const,
      configured: true as const,
      ...data,
      note: "Estos son los datos configurados del taller. La acreditación la confirma siempre una persona — si el cliente avisa que pagó usá recordPaymentIntent.",
    };
  },
};

// ─── A-12 · Draft order management (customer, borrador-only) ────────────────
//
// The customer can modify or cancel THEIR OWN orders — but only while they
// are still `borrador`. Anything past that (presupuesto enviado, aprobado,
// señas, producción, entregado, cancelado) is rejected with a human-handoff
// hint. Ownership comes from the conversation's bound contact, never from
// model input. Re-pricing stays with quoteOrder().

type OwnedDraft =
  | {
      ok: true;
      order: {
        id: string;
        number: number;
        snapshot: (typeof orders.$inferSelect)["snapshot"];
        snapshotHistory: (typeof orders.$inferSelect)["snapshotHistory"];
      };
    }
  | { ok: false; response: Record<string, unknown> };

async function resolveOwnedDraft(context: AgentToolContext, orderNumber: number): Promise<OwnedDraft> {
  const customer = await resolveConversationCustomer(context);
  if ("error" in customer) {
    return { ok: false, response: { ok: false, error: "no_conversation", message: "No pude identificar la conversación." } };
  }
  if (!customer.contactId) {
    return { ok: false, response: { ok: false, error: "no_orders", message: "Este número todavía no tiene pedidos registrados." } };
  }
  const [order] = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      snapshot: orders.snapshot,
      snapshotHistory: orders.snapshotHistory,
    })
    .from(orders)
    .where(and(eq(orders.number, orderNumber), eq(orders.contactId, customer.contactId)))
    .limit(1);
  if (!order) {
    return {
      ok: false,
      response: { ok: false, error: "order_not_found", message: "No encontré ese número de pedido para este cliente." },
    };
  }
  if (order.status !== "borrador") {
    return {
      ok: false,
      response: {
        ok: false,
        error: "not_a_draft",
        status: order.status,
        message:
          "Ese pedido ya no es un borrador — ya fue enviado o confirmado y no puedo modificarlo. Si necesitás cambiarlo, derivo al equipo (transferToHuman).",
        requiresHumanConfirmation: true,
      },
    };
  }
  return {
    ok: true,
    order: { id: order.id, number: order.number, snapshot: order.snapshot, snapshotHistory: order.snapshotHistory },
  };
}

const draftLineInput = z.object({
  productName: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(1).max(100000).nullish(),
  sizeQuantities: z
    .array(z.object({ label: z.string().trim().min(1).max(32), quantity: z.number().int().min(1).max(10000) }))
    .max(32)
    .nullish(),
  techniqueName: z.string().trim().min(1).max(128).nullish(),
  notes: z.string().trim().max(500).nullish(),
});

const updateDraftLinesInput = z.object({
  orderNumber: z.number().int().positive().max(999999999).describe("Número de pedido borrador del cliente"),
  lines: z.array(draftLineInput).min(1).max(50).describe("Nuevo contenido COMPLETO del pedido (reemplaza las líneas actuales)"),
  urgent: z.boolean().optional(),
});

export const updateDraftLinesTool: AgentTool<z.infer<typeof updateDraftLinesInput>> = {
  id: "updateDraftLines",
  description:
    "Reemplaza las líneas de un pedido BORRADOR del cliente con un nuevo contenido completo y lo re-cotiza con el motor. Solo funciona en estado 'borrador' — pedidos ya confirmados no se tocan.",
  effect: "draft",
  inputSchema: updateDraftLinesInput,
  async handler(input, context) {
    const owned = await resolveOwnedDraft(context, input.orderNumber);
    if (!owned.ok) return owned.response;
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }

    // Resolve every new line server-side before touching anything.
    const resolvedLines: Array<{
      product: ResolvedProduct;
      techniqueId: string | null;
      quantity: number;
      sizeQuantities: SizeQuantity[];
      notes: string | null;
    }> = [];
    for (const line of input.lines) {
      const resolved = await resolveGarmentLine(line);
      if (!resolved.ok) return resolved.response;
      resolvedLines.push({
        product: resolved.product,
        techniqueId: resolved.techniqueId,
        quantity: resolved.quantity,
        sizeQuantities: resolved.sizeQuantities,
        notes: line.notes?.trim() || null,
      });
    }

    let quote: QuoteResult;
    try {
      quote = await quoteOrder({
        urgent: input.urgent,
        lines: resolvedLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          techniqueId: line.techniqueId,
          sizeQuantities: line.sizeQuantities.length > 0 ? line.sizeQuantities : undefined,
        })),
      });
    } catch (error) {
      return {
        ok: false as const,
        draft: false as const,
        error: "quote_failed" as const,
        reason: quoteFailureReason(error),
        message: "No se pudo re-cotizar el pedido — probablemente falte receta/BOM o regla de precios. No se modificó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    const { totals } = quote;
    await runInTransaction(async (tx) => {
      // Re-verify inside the transaction: status could have flipped between
      // the read and now.
      const [stillDraft] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, owned.order.id), eq(orders.status, "borrador")))
        .limit(1);
      if (!stillDraft) throw new OrderDraftDomainError("El pedido ya no está en borrador");

      const oldLines = await tx.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.orderId, owned.order.id));
      if (oldLines.length > 0) {
        await tx.delete(orderItems).where(inArray(orderItems.orderLineId, oldLines.map((l) => l.id)));
        await tx.delete(orderLines).where(eq(orderLines.orderId, owned.order.id));
      }

      const insertedLines = await tx
        .insert(orderLines)
        .values(
          quote.lines.map((line, i) => ({
            orderId: owned.order.id,
            productId: line.productId,
            techniqueId: resolvedLines[i]?.techniqueId ?? null,
            quantity: line.quantity,
            unitPrice: money(line.unitPrice),
            unitCost: money(line.unitCost),
            notes: resolvedLines[i]?.notes ?? null,
          })),
        )
        .returning({ id: orderLines.id });

      const expandedItems: Array<{ orderLineId: string; sizeId: string | null }> = [];
      quote.lines.forEach((_line, i) => {
        const lineRow = insertedLines[i];
        const resolved = resolvedLines[i];
        if (!lineRow || !resolved) return;
        for (const sq of resolved.sizeQuantities) {
          for (let k = 0; k < sq.quantity; k++) expandedItems.push({ orderLineId: lineRow.id, sizeId: sq.sizeId });
        }
      });
      if (expandedItems.length > 0) {
        await tx.insert(orderItems).values(
          expandedItems.map((item) => ({
            orderLineId: item.orderLineId,
            sizeId: item.sizeId,
            individualName: null,
            individualNumber: null,
          })),
        );
      }

      // Supersede the old snapshot into history — never lose the prior quote.
      const snapshotHistory = [...owned.order.snapshotHistory];
      if (owned.order.snapshot) {
        snapshotHistory.push({
          snapshot: owned.order.snapshot,
          supersededAt: new Date().toISOString(),
          reason: "re-quote",
        });
      }

      await tx
        .update(orders)
        .set({
          snapshot: quote.snapshot,
          snapshotHistory,
          pricingRuleId: quote.rule.id,
          urgent: input.urgent ?? false,
          totalQuoted: money(totals.price),
          totalCost: money(totals.cost),
          marginPercent: money(totals.marginPercent),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, owned.order.id));

      await tx.insert(auditEvents).values({
        actorKind: "agent",
        actorRef: "whatsapp-sales-agent",
        action: "whatsapp.draft.lines_updated",
        entityType: "order",
        entityId: owned.order.id,
        correlationId: customer.conversationId,
        payload: { after: { orderNumber: owned.order.number, totalQuoted: totals.price, lines: quote.lines.length } },
      });
    });

    const totalQuantity = resolvedLines.reduce((sum, line) => sum + line.quantity, 0);
    return {
      ok: true as const,
      draft: true as const,
      updated: true as const,
      orderId: owned.order.id,
      number: owned.order.number,
      status: "borrador" as const,
      lines: quote.lines.length,
      totalQuantity,
      totalPrice: totals.price,
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Borrador actualizado y re-cotizado con el motor. Sigue siendo borrador — un humano debe confirmar cualquier cambio antes de que valga.",
    };
  },
};

const cancelDraftInput = z.object({
  orderNumber: z.number().int().positive().max(999999999).describe("Número de pedido borrador a cancelar"),
  reason: z.string().trim().max(500).nullish(),
});

export const cancelDraftTool: AgentTool<z.infer<typeof cancelDraftInput>> = {
  id: "cancelDraft",
  description:
    "Cancela un pedido BORRADOR del cliente (pasa a estado 'cancelado'). Solo borradores — si ya fue enviado/confirmado, derivá al equipo. Confirmá con el cliente antes de usarla.",
  effect: "draft",
  inputSchema: cancelDraftInput,
  async handler(input, context) {
    const owned = await resolveOwnedDraft(context, input.orderNumber);
    if (!owned.ok) return owned.response;
    const customer = await resolveConversationCustomer(context);
    if ("error" in customer) {
      return { ok: false as const, error: "no_conversation", message: "No pude identificar la conversación." };
    }

    const cancelled = await runInTransaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({
          status: "cancelado",
          notes: input.reason ? `[Cancelado por el cliente: ${input.reason.trim().slice(0, 200)}]` : "[Cancelado por el cliente]",
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, owned.order.id), eq(orders.status, "borrador")))
        .returning({ id: orders.id });
      if (updated.length === 0) return false;
      await tx.insert(auditEvents).values({
        actorKind: "agent",
        actorRef: "whatsapp-sales-agent",
        action: "whatsapp.draft.cancelled",
        entityType: "order",
        entityId: owned.order.id,
        correlationId: customer.conversationId,
        payload: { after: { orderNumber: owned.order.number, reason: input.reason ?? null } },
      });
      return true;
    });

    if (!cancelled) {
      return {
        ok: false as const,
        error: "not_a_draft" as const,
        message: "El pedido ya no está en borrador — no pude cancelarlo. Derivá al equipo si el cliente insiste.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }
    return {
      ok: true as const,
      cancelled: true as const,
      number: owned.order.number,
      message: `Borrador #${owned.order.number} cancelado. No quedó ningún compromiso — el cliente puede armar uno nuevo cuando quiera.`,
    };
  },
};

// ─── A-14 · Promotions exposure ─────────────────────────────────────────────
//
// The catalog summary never carries prices and the pricing engine stays the
// only authority — promotions are offered as NAMES + content so the agent can
// mention them; `customPrice` is admin-configured (not model-invented) and is
// safe to surface as informational.

const getPromotionsInput = z.object({});

export const getPromotionsTool: AgentTool<z.infer<typeof getPromotionsInput>> = {
  id: "getPromotions",
  description:
    "Lista las promociones activas del taller (nombre, contenido, precio promocional si está configurado). Usar cuando el cliente pregunte por ofertas o promos.",
  effect: "read",
  inputSchema: getPromotionsInput,
  async handler() {
    const rows = await db
      .select({
        id: promotions.id,
        name: promotions.name,
        description: promotions.description,
        items: promotions.items,
        customPrice: promotions.customPrice,
      })
      .from(promotions)
      .where(eq(promotions.active, true))
      .orderBy(desc(promotions.createdAt))
      .limit(10);
    if (rows.length === 0) {
      return { ok: true as const, promotions: [] as const, message: "No hay promociones activas en este momento." };
    }
    return {
      ok: true as const,
      promotions: rows.map((row) => ({
        name: row.name,
        description: row.description?.slice(0, 300) ?? null,
        items: (row.items ?? []).map((item) => `${item.quantity}x ${item.productName}`),
        promotionalPrice: row.customPrice ? Number(row.customPrice) : null,
      })),
      note: "Los precios promocionales son configurados por el taller. Para cotizar un pedido normal usá siempre quoteGarment — no extrapoles precios de promo.",
    };
  },
};

// ─── Tool set ────────────────────────────────────────────────────────────────

/**
 * The closed, customer-safe tool set. NOT registered in ALL_AGENT_TOOLS yet —
 * wave 3 wires it; the dispatcher resolves it directly (optionally narrowed by
 * the scoped `enabledTools` allowlist).
 */
export const WHATSAPP_SALES_TOOLS: readonly AgentTool[] = [
  searchCatalogTool,
  getProductDetailTool,
  listTechniquesTool,
  quoteGarmentTool,
  getMyOrdersTool,
  getMyOrderStatusTool,
  addCartItemTool,
  getCartTool,
  removeCartItemTool,
  clearCartTool,
  draftOrderFromCartTool,
  getBusinessHoursTool,
  checkAvailabilityTool,
  getPaymentAliasTool,
  updateDraftLinesTool,
  cancelDraftTool,
  getPromotionsTool,
  draftQuoteWhatsAppTool,
  draftOrderWhatsAppTool,
  recordPaymentIntentTool,
  transferToHumanTool,
];

const salesToolIds = new Set(WHATSAPP_SALES_TOOLS.map((tool) => tool.id));

/**
 * Resolves the active tool set for a turn. When the scoped config lists
 * `enabledTools`, it narrows the set to the intersection (admin allowlist);
 * an empty/unset list means the full customer-safe set — these tools are the
 * agent's own hardened surface, all read/draft by construction.
 */
export function resolveWhatsAppSalesTools(enabledTools: readonly string[] | null | undefined): AgentTool[] {
  if (!enabledTools || enabledTools.length === 0) return [...WHATSAPP_SALES_TOOLS];
  const allowed = new Set(enabledTools);
  return WHATSAPP_SALES_TOOLS.filter((tool) => allowed.has(tool.id) && salesToolIds.has(tool.id));
}
