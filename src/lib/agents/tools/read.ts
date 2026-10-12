import { and, asc, eq, gte, inArray, like, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { chatMessages, contacts, conversations, orderItems, orderLines, orders, payments } from "@/db/schema";
import { quoteOrder } from "@/lib/pricing";
import { sumActivePaymentsCents, toCents } from "@/lib/payments";
import type { AgentTool } from "@/lib/agents/tools/types";

/**
 * Read-only agent tools (P2).
 *
 * Every tool is `effect: 'read'`: it never writes, never creates a draft, never
 * charges and never advances production. Arguments are validated with Zod
 * before execution because they arrive from the model, which is processing
 * untrusted user content.
 */

const idLike = z.string().trim().min(1).max(64);

async function loadConversationMessages(conversationId: string, limit = 120) {
  return db
    .select({
      id: chatMessages.id,
      direction: chatMessages.direction,
      senderKind: chatMessages.senderKind,
      contentType: chatMessages.contentType,
      content: chatMessages.content,
      deliveryState: chatMessages.deliveryState,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
}

// ── getConversation ─────────────────────────────────────────────────────────

const getConversationInput = z.object({ conversationId: idLike });

export const getConversationTool: AgentTool<z.infer<typeof getConversationInput>> = {
  id: "getConversation",
  description:
    "Devuelve el encabezado y el timeline de una conversación de AH Sports (canal, estado, cliente y mensajes con su dirección/remitente). Solo lectura.",
  effect: "read",
  inputSchema: getConversationInput,
  async handler({ conversationId }) {
    const [conversation] = await db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        externalThreadId: conversations.externalThreadId,
        status: conversations.status,
        customerId: conversations.customerId,
        organizationId: conversations.organizationId,
        unreadCount: conversations.unreadCount,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) return { found: false as const, conversationId };

    const messages = await loadConversationMessages(conversationId);
    return { found: true as const, conversation, messages };
  },
};

// ── findMissingInfo ─────────────────────────────────────────────────────────

const findMissingInfoInput = z.object({ conversationId: idLike });

type Requirement = { key: string; label: string; pattern: RegExp };

const QUOTE_REQUIREMENTS: Requirement[] = [
  { key: "tipo_prenda", label: "Tipo de prenda", pattern: /\b(remera|chomba|camiseta|campera|pantalon|short|bermuda|conjunto|accesorio|buzo|musculosa)\b/i },
  { key: "cantidad", label: "Cantidad total", pattern: /\b\d{1,6}\b\s*(u|unidades|prendas|remeras|chombas|camisetas|camperas)?/i },
  { key: "talles", label: "Talles / curva", pattern: /\b(talle|talles|curva|xs|s\/m|l\/xl|xxl|xxxl)\b/i },
  { key: "tecnica", label: "Técnica de personalización", pattern: /\b(estampa|estampado|bordado|sublimad|serigraf|dtf|vinilo|flock|transfer)\b/i },
  { key: "diseno", label: "Diseño / arte", pattern: /\b(dise(ñ|n)o|arte|logo|escudo|colores|vector|mockup)\b/i },
  { key: "plazo", label: "Plazo de entrega", pattern: /\b(entrega|plazo|fecha|urgente|para el|cu(á|a)ndo)\b/i },
];

export const findMissingInfoTool: AgentTool<z.infer<typeof findMissingInfoInput>> = {
  id: "findMissingInfo",
  description:
    "Analiza una conversación y lista, de forma heurística y explícita, qué datos comerciales están presentes y cuáles faltan para cotizar (tipo de prenda, cantidad, talles, técnica, diseño y plazo). No inventa valores.",
  effect: "read",
  inputSchema: findMissingInfoInput,
  async handler({ conversationId }) {
    const messages = await loadConversationMessages(conversationId);
    if (messages.length === 0) {
      return { found: false as const, conversationId, missing: [], present: [], messageCount: 0 };
    }
    const customerText = messages
      .filter((message) => message.direction === "inbound" || message.senderKind === "customer")
      .map((message) => message.content)
      .join("\n")
      .slice(0, 20000);

    const present: string[] = [];
    const missing: string[] = [];
    for (const requirement of QUOTE_REQUIREMENTS) {
      if (requirement.pattern.test(customerText)) present.push(requirement.key);
      else missing.push(requirement.key);
    }

    return {
      found: true as const,
      conversationId,
      messageCount: messages.length,
      present,
      missing,
      note: "Análisis heurístico sobre el texto del cliente; verificá con la persona antes de cotizar.",
    };
  },
};

// ── salesPerformance ────────────────────────────────────────────────────────

const salesPerformanceInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const salesPerformanceTool: AgentTool<z.infer<typeof salesPerformanceInput>> = {
  id: "salesPerformance",
  description:
    "Resume performance de ventas en un rango opcional de fechas: cantidad de pedidos, total cotizado/costeado y margen, agrupado por estado. Solo lectura.",
  effect: "read",
  inputSchema: salesPerformanceInput,
  async handler({ from, to }) {
    const filters = [];
    if (from) filters.push(gte(orders.createdAt, new Date(from)));
    if (to) filters.push(lte(orders.createdAt, new Date(to)));

    const rows = await db
      .select({ id: orders.id, status: orders.status, totalQuoted: orders.totalQuoted, totalCost: orders.totalCost })
      .from(orders)
      .where(filters.length > 0 ? and(...filters) : undefined);

    const byStatus: Record<string, number> = {};
    let quotedCents = 0;
    let costCents = 0;
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      try {
        quotedCents += toCents(row.totalQuoted);
        costCents += toCents(row.totalCost);
      } catch {
        // Skip unparseable monetary values rather than failing the whole report.
      }
    }

    return {
      orders: rows.length,
      byStatus,
      quoted: quotedCents / 100,
      cost: costCents / 100,
      margin: (quotedCents - costCents) / 100,
      range: { from: from ?? null, to: to ?? null },
    };
  },
};

// ── lookupOrder ─────────────────────────────────────────────────────────────

const lookupOrderInput = z.object({
  orderId: idLike.optional(),
  number: z.number().int().positive().optional(),
  publicToken: idLike.optional(),
});

export const lookupOrderTool: AgentTool<z.infer<typeof lookupOrderInput>> = {
  id: "lookupOrder",
  description:
    "Busca un pedido por id, número o token público y devuelve sus datos, líneas, cantidad de prendas y situación financiera (cotizado, pagado, saldo). Solo lectura.",
  effect: "read",
  inputSchema: lookupOrderInput,
  async handler({ orderId, number, publicToken }) {
    const conditions = [];
    if (orderId) conditions.push(eq(orders.id, orderId));
    if (typeof number === "number") conditions.push(eq(orders.number, number));
    if (publicToken) conditions.push(eq(orders.publicToken, publicToken));
    if (conditions.length === 0) {
      return { found: false as const, error: "missing_criteria" as const };
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .limit(1);
    if (!order) return { found: false as const, error: "not_found" as const };

    const lines = await db
      .select({
        id: orderLines.id,
        productId: orderLines.productId,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id));

    const lineIds = lines.map((line) => line.id);
    const items = lineIds.length > 0
      ? await db
          .select({ id: orderItems.id, status: orderItems.status })
          .from(orderItems)
          .where(inArray(orderItems.orderLineId, lineIds))
      : [];

    const paymentRows = await db
      .select({ amount: payments.amount, cancelled: payments.cancelled })
      .from(payments)
      .where(eq(payments.orderId, order.id));
    const paidCents = sumActivePaymentsCents(paymentRows);
    const quotedCents = toCents(order.totalQuoted);

    return {
      found: true as const,
      order: {
        id: order.id,
        number: order.number,
        publicToken: order.publicToken,
        status: order.status,
        urgent: order.urgent,
        organizationId: order.organizationId,
        contactId: order.contactId,
        createdAt: order.createdAt,
      },
      lines,
      garments: items.length,
      financials: {
        quoted: quotedCents / 100,
        paid: paidCents / 100,
        balance: (quotedCents - paidCents) / 100,
      },
    };
  },
};

// ── lookupCustomer ──────────────────────────────────────────────────────────

const lookupCustomerInput = z.object({
  customerId: idLike.optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(3).max(64).optional(),
  name: z.string().trim().min(2).max(255).optional(),
});

export const lookupCustomerTool: AgentTool<z.infer<typeof lookupCustomerInput>> = {
  id: "lookupCustomer",
  description:
    "Busca contactos/clientes por id, email, teléfono o nombre (coincidencia parcial). Devuelve hasta 20 resultados con su organización y estado de lead. Solo lectura.",
  effect: "read",
  inputSchema: lookupCustomerInput,
  async handler({ customerId, email, phone, name }) {
    const conditions = [];
    if (customerId) conditions.push(eq(contacts.id, customerId));
    if (email) conditions.push(eq(contacts.email, email));
    if (phone) conditions.push(eq(contacts.phone, phone));
    if (name) conditions.push(like(contacts.name, `%${name}%`));
    if (conditions.length === 0) {
      return { found: false as const, error: "missing_criteria" as const };
    }

    const rows = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        organizationId: contacts.organizationId,
        status: contacts.status,
      })
      .from(contacts)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .limit(20);

    return { found: rows.length > 0, count: rows.length, customers: rows };
  },
};

// ── quotePreview ────────────────────────────────────────────────────────────

const quotePreviewInput = z.object({
  lines: z
    .array(
      z.object({
        productId: idLike,
        quantity: z.number().int().positive().max(100000),
        techniqueId: idLike.nullish(),
        sizeId: idLike.nullish(),
      }),
    )
    .min(1)
    .max(20),
  urgent: z.boolean().optional(),
});

export const quotePreviewTool: AgentTool<z.infer<typeof quotePreviewInput>> = {
  id: "quotePreview",
  description:
    "Genera una VISTA PREVIA de cotización reutilizando el motor de precios (no crea pedido ni guarda nada). Devuelve precio unitario y subtotal por línea, totales y margen. Requiere confirmación humana para convertirse en pedido.",
  effect: "read",
  inputSchema: quotePreviewInput,
  async handler({ lines, urgent }) {
    try {
      const quote = await quoteOrder({
        urgent,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          techniqueId: line.techniqueId ?? null,
          sizeId: line.sizeId ?? null,
        })),
      });
      return {
        ok: true as const,
        preview: true as const,
        lines: quote.lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
        })),
        totals: quote.totals,
        rule: { name: quote.rule.name, marginPercent: quote.rule.marginPercent, minAdvancePercent: quote.rule.minAdvancePercent },
        note: "Vista previa de solo lectura. No se creó ningún pedido; requiere confirmación humana.",
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "quote_failed",
      };
    }
  },
};

export const readTools = [
  getConversationTool,
  findMissingInfoTool,
  salesPerformanceTool,
  lookupOrderTool,
  lookupCustomerTool,
  quotePreviewTool,
] as const;
