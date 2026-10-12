import { randomBytes } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import type { DbTransaction } from "@/lib/db-transaction";
import { contacts, orderLines, orders, organizations } from "@/db/schema";
import { createOrderDraftTx, OrderDraftDomainError } from "@/lib/orders/draft-order";
import { fromCents, toCents } from "@/lib/payments";
import { quoteOrder, type QuoteResult } from "@/lib/pricing";
import type { AgentTool } from "@/lib/agents/tools/types";

/**
 * Guarded draft-only commerce tools (P3).
 *
 * Every tool is `effect: 'draft'`: it MAY persist a reviewable draft, but the
 * only state it ever writes is reversible and non-authoritative —
 * `contacts.status='nuevo'` and `orders.status='borrador'`. No handler
 * finalizes an order, registers a payment, advances production or performs any
 * irreversible action. Every result states that human confirmation is required.
 *
 * Arguments come from the model (which is reading untrusted content), so they
 * are validated with Zod before execution.
 *
 * `withDbTransaction` is imported lazily (same pattern as `src/lib/ai/config.ts`)
 * so this module stays importable without a server-only runtime, which the
 * DB-free behavioral check relies on.
 */

const idLike = z.string().trim().min(1).max(64);

async function runInTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  const { withDbTransaction } = await import("@/lib/db-transaction");
  return withDbTransaction(fn);
}

/** Decimal-safe money: number → integer cents → canonical "d.dd" string. */
function money(value: number): string {
  return fromCents(toCents(value));
}

const HUMAN_CONFIRMATION_REQUIRED = true as const;

// ── draftLead ───────────────────────────────────────────────────────────────

// NOTE: keep this a plain `z.object`. A `.refine(...)` would turn it into a
// `ZodEffects` (no `.shape`), which the registry's Zod→JSON projection cannot
// walk. The "at least one contact method" rule is enforced in the handler below
// instead, with the same message.
const draftLeadInput = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).nullish(),
  phone: z.string().trim().min(3).max(64).nullish(),
  organizationName: z.string().trim().min(1).max(255).nullish(),
  role: z.string().trim().max(128).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});

export const draftLeadTool: AgentTool<z.infer<typeof draftLeadInput>> = {
  id: "draftLead",
  description:
    "Crea un BORRADOR de lead en contactos (estado 'nuevo'), resolviendo o creando la organización por nombre. No convierte el lead en cliente ni dispara ninguna acción. Requiere confirmación humana.",
  effect: "draft",
  inputSchema: draftLeadInput,
  async handler(input) {
    if (!input.email && !input.phone) {
      return {
        ok: false as const,
        draft: false as const,
        error: "invalid_input" as const,
        message: "Indicá al menos un email o un teléfono de contacto. No se guardó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    const result = await runInTransaction(async (tx) => {
      let organizationId: string | null = null;
      if (input.organizationName) {
        const [existingOrg] = await tx.select({ id: organizations.id }).from(organizations)
          .where(eq(organizations.name, input.organizationName)).limit(1);
        if (existingOrg) organizationId = existingOrg.id;
        else {
          const [createdOrg] = await tx.insert(organizations).values({
            name: input.organizationName, kind: "club", notes: "Creada desde borrador del agente",
          }).returning({ id: organizations.id });
          if (!createdOrg) throw new OrderDraftDomainError("No se pudo crear la organización");
          organizationId = createdOrg.id;
        }
      }

      const conditions = [];
      if (input.email) conditions.push(eq(contacts.email, input.email));
      if (input.phone) conditions.push(eq(contacts.phone, input.phone));
      const [existingContact] = await tx
        .select({ id: contacts.id, organizationId: contacts.organizationId })
        .from(contacts)
        .where(conditions.length === 1 ? conditions[0] : or(...conditions))
        .limit(1);

      if (existingContact) {
        return {
          contactId: existingContact.id,
          organizationId: organizationId ?? existingContact.organizationId,
          existing: true as const,
        };
      }

      const [created] = await tx.insert(contacts).values({
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        organizationId,
        role: input.role ?? "cliente",
        notes: input.notes ?? null,
        status: "nuevo",
      }).returning({ id: contacts.id, organizationId: contacts.organizationId });
      if (!created) throw new OrderDraftDomainError("No se pudo crear el contacto");
      return { contactId: created.id, organizationId: created.organizationId, existing: false as const };
    });

    return {
      ok: true as const,
      draft: true as const,
      entity: "lead" as const,
      contactId: result.contactId,
      organizationId: result.organizationId,
      existing: result.existing,
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Borrador de lead guardado en estado 'nuevo'. Requiere revisión y confirmación humana antes de convertirlo en cliente u operar con él.",
    };
  },
};

// ── draftQuote ──────────────────────────────────────────────────────────────

const draftQuoteInput = z.object({
  contactId: idLike.nullish(),
  organizationId: idLike.nullish(),
  urgent: z.boolean().optional(),
  pricingRuleId: idLike.nullish(),
  notes: z.string().trim().max(4000).nullish(),
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
});

/** Maps a `quoteOrder` failure to a stable, non-leaking reason code. */
function quoteFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("regla de pricing activa")) return "no_active_pricing_rule";
  if (message.includes("no tiene receta")) return "recipe_missing";
  if (message.includes("no tiene insumos")) return "recipe_empty";
  if (message.includes("no coinciden con la cantidad")) return "quantity_mismatch";
  if (message.includes("no pertenece")) return "size_mismatch";
  if (message.includes("metros/kilo")) return "material_yield_missing";
  if (message.includes("por m") || message.includes("aplicaciones")) return "application_measure_required";
  if (message.includes("no encontrad")) return "not_found";
  return "quote_failed";
}

export const draftQuoteTool: AgentTool<z.infer<typeof draftQuoteInput>> = {
  id: "draftQuote",
  description:
    "Genera una cotización con el motor de precios autoritativo y la guarda como pedido en estado 'borrador' (con snapshot). Nunca aprueba, envía ni cobra. Requiere confirmación humana.",
  effect: "draft",
  inputSchema: draftQuoteInput,
  async handler({ contactId, organizationId, urgent, pricingRuleId, notes, lines }) {
    let quote: QuoteResult;
    try {
      quote = await quoteOrder({
        urgent,
        pricingRuleId: pricingRuleId ?? undefined,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          techniqueId: line.techniqueId ?? null,
          sizeId: line.sizeId ?? null,
        })),
      });
    } catch (error) {
      return {
        ok: false as const,
        draft: false as const,
        error: "quote_failed" as const,
        reason: quoteFailureReason(error),
        message:
          "No se pudo generar el borrador de cotización. Verificá producto, receta/BOM, talles y regla de precios activa. No se guardó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }

    const { totals } = quote;
    const result = await runInTransaction(async (tx) => {
      const publicToken = randomBytes(24).toString("base64url");
      const [order] = await tx.insert(orders).values({
        publicToken,
        organizationId: organizationId ?? null,
        contactId: contactId ?? null,
        status: "borrador",
        urgent: urgent ?? false,
        notes: notes ?? null,
        pricingRuleId: quote.rule.id,
        snapshot: quote.snapshot,
        totalQuoted: money(totals.price),
        totalCost: money(totals.cost),
        marginPercent: money(totals.marginPercent),
      }).returning({ id: orders.id, number: orders.number });
      if (!order) throw new OrderDraftDomainError("No se pudo crear el pedido borrador");

      await tx.insert(orderLines).values(
        quote.lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: money(line.unitPrice),
          unitCost: money(line.unitCost),
        })),
      );

      return { orderId: order.id, number: order.number, publicToken };
    });

    return {
      ok: true as const,
      draft: true as const,
      entity: "quote" as const,
      orderId: result.orderId,
      number: result.number,
      status: "borrador" as const,
      lines: quote.lines.length,
      totals: { price: totals.price, cost: totals.cost, margin: totals.margin, marginPercent: totals.marginPercent },
      requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      note: "Borrador de cotización guardado con snapshot en estado 'borrador'. Requiere revisión y confirmación humana: no está aprobado, no se envió y no se registró ningún pago.",
    };
  },
};

// ── draftOrder ──────────────────────────────────────────────────────────────

const draftOrderInput = z.object({
  type: z.enum(["new", "returning"]).optional(),
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(3).max(64),
  organizationName: z.string().trim().min(1).max(255).optional(),
  notes: z.string().trim().max(4000).optional(),
  productId: idLike,
  sizeQuantities: z
    .array(z.object({ sizeId: idLike.nullable(), quantity: z.number().int().min(1).max(1000) }))
    .min(1)
    .max(32),
  items: z
    .array(
      z.object({
        sizeId: idLike.nullish(),
        individualName: z.string().trim().max(128).nullish(),
        individualNumber: z.string().trim().max(32).nullish(),
      }),
    )
    .min(1)
    .max(1000),
});

export const draftOrderTool: AgentTool<z.infer<typeof draftOrderInput>> = {
  id: "draftOrder",
  description:
    "Crea un BORRADOR de pedido reutilizando la misma lógica de la solicitud pública (organización, contacto, línea y prendas) en estado 'borrador'. No aprueba, no cobra ni avanza la producción. Requiere confirmación humana.",
  effect: "draft",
  inputSchema: draftOrderInput,
  async handler(input) {
    try {
      const result = await runInTransaction((tx) =>
        createOrderDraftTx(tx, {
          type: input.type ?? "new",
          name: input.name,
          email: input.email,
          phone: input.phone,
          organizationName: input.organizationName,
          organizationNotes: "Creada desde borrador del agente",
          notes: input.notes,
          productId: input.productId,
          sizeQuantities: input.sizeQuantities.map((entry) => ({ sizeId: entry.sizeId ?? null, quantity: entry.quantity })),
          items: input.items.map((item) => ({
            sizeId: item.sizeId ?? null,
            individualName: item.individualName ?? null,
            individualNumber: item.individualNumber ?? null,
          })),
        }),
      );

      return {
        ok: true as const,
        draft: true as const,
        entity: "order" as const,
        orderId: result.orderId,
        number: result.number,
        publicToken: result.publicToken,
        status: "borrador" as const,
        contactId: result.contactId,
        organizationId: result.organizationId,
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
        note: "Borrador de pedido guardado en estado 'borrador'. Requiere revisión y confirmación humana: no está aprobado, no se registró ningún pago y la producción no avanzó.",
      };
    } catch (error) {
      if (error instanceof OrderDraftDomainError) {
        return {
          ok: false as const,
          draft: false as const,
          error: "draft_rejected" as const,
          message: error.message,
          requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
        };
      }
      return {
        ok: false as const,
        draft: false as const,
        error: "draft_failed" as const,
        message: "No se pudo crear el borrador de pedido. Verificá los datos y reintentá. No se guardó nada.",
        requiresHumanConfirmation: HUMAN_CONFIRMATION_REQUIRED,
      };
    }
  },
};

export const draftTools = [draftLeadTool, draftQuoteTool, draftOrderTool] as const;
