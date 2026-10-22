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
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
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
  sizes,
  techniques,
} from "@/db/schema";
import type { DbTransaction } from "@/lib/db-transaction";
import { OrderDraftDomainError } from "@/lib/orders/draft-order";
import { fromCents, toCents } from "@/lib/payments";
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
