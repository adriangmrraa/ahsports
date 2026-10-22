import "server-only";

import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { contacts, conversations, leadIdentities, orders, organizations, payments } from "@/db/schema";
import { sumActivePaymentsCents, toCents } from "@/lib/payments";
import type { AgentTool } from "@/lib/agents/tools/types";
import { withAuditLog } from "@/lib/telegram/confirmations";

/**
 * Operator client tools — textile mapping of SocialCRM `toolsClient.ts`:
 * clients → contacts + organizations; client aliases → contacts.role/notes;
 * lead lifecycle → contacts.status (nuevo→…→convertido/perdido).
 */

const idLike = z.string().trim().min(1).max(64);
const LEAD_STATUSES = ["nuevo", "contactado", "calificado", "convertido", "perdido"] as const;

// ── Contacts ────────────────────────────────────────────────────────────────

const searchContactsInput = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(30).optional(),
});

export const searchContactsTool: AgentTool<z.infer<typeof searchContactsInput>> = {
  id: "searchContacts",
  description: "Busca contactos por nombre, email o teléfono (coincidencia parcial, dígitos para teléfono). Solo lectura.",
  effect: "read",
  inputSchema: searchContactsInput,
  async handler({ query, limit }) {
    const digits = query.replace(/\D/g, "");
    const filters = [ilike(contacts.name, `%${query}%`), ilike(contacts.email, `%${query}%`)];
    if (digits.length >= 3) filters.push(sql`${contacts.phone} ilike ${"%" + digits + "%"}`);
    const rows = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        status: contacts.status,
        role: contacts.role,
        organization: organizations.name,
      })
      .from(contacts)
      .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
      .where(or(...filters))
      .limit(limit ?? 10);
    return { ok: true as const, count: rows.length, contacts: rows };
  },
};

const getContactDetailInput = z.object({ contactId: idLike });

export const getContactDetailTool: AgentTool<z.infer<typeof getContactDetailInput>> = {
  id: "getContactDetail",
  description:
    "Perfil completo de un contacto: datos, organización, identidades de canal, pedidos recientes y saldo pendiente total. Solo lectura.",
  effect: "read",
  inputSchema: getContactDetailInput,
  async handler({ contactId }) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) return { found: false as const, error: "not_found" as const };

    const [org] = contact.organizationId
      ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, contact.organizationId)).limit(1)
      : [null];

    const identities = await db
      .select({ channel: leadIdentities.channel, externalId: leadIdentities.externalId })
      .from(leadIdentities)
      .where(eq(leadIdentities.contactId, contactId));

    const orderRows = await db
      .select({ id: orders.id, number: orders.number, status: orders.status, totalQuoted: orders.totalQuoted, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.contactId, contactId))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    let balanceCents = 0;
    for (const order of orderRows) {
      if (order.status === "cancelado") continue;
      const paymentRows = await db
        .select({ amount: payments.amount, cancelled: payments.cancelled })
        .from(payments)
        .where(eq(payments.orderId, order.id));
      balanceCents += toCents(order.totalQuoted) - sumActivePaymentsCents(paymentRows);
    }

    const convs = await db
      .select({ id: conversations.id, channel: conversations.channel, lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .where(eq(conversations.customerId, contactId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(5);

    return {
      found: true as const,
      contact,
      organization: org,
      identities,
      recentOrders: orderRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      pendingBalance: balanceCents / 100,
      conversations: convs.map((row) => ({ ...row, lastMessageAt: row.lastMessageAt?.toISOString() ?? null })),
    };
  },
};

const updateContactInput = z.object({
  contactId: idLike,
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).nullish(),
  phone: z.string().trim().min(3).max(64).optional(),
  role: z.string().trim().min(1).max(128).optional(),
  notes: z.string().trim().max(4000).optional(),
  organizationId: idLike.nullish(),
});

export const updateContactTool = withAuditLog({
  id: "updateContact",
  description: "Actualiza datos de un contacto (nombre, email, teléfono, rol, notas, organización). Reversible, queda auditado.",
  effect: "draft",
  inputSchema: updateContactInput,
  async handler(input) {
    const { contactId, ...fields } = input;
    const updates = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    if (Object.keys(updates).length === 0) return { ok: false as const, error: "nothing_to_update" as const };
    if (fields.organizationId) {
      const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, fields.organizationId)).limit(1);
      if (!org) return { ok: false as const, error: "organization_not_found" as const };
    }
    const [updated] = await db.update(contacts).set(updates).where(eq(contacts.id, contactId)).returning({ id: contacts.id });
    if (!updated) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, contactId: updated.id };
  },
} satisfies AgentTool<z.infer<typeof updateContactInput>>);

const setContactStatusInput = z.object({
  contactId: idLike,
  status: z.enum(LEAD_STATUSES),
});

export const setContactStatusTool = withAuditLog({
  id: "setContactStatus",
  description: "Mueve un contacto en el pipeline de lead (nuevo → contactado → calificado → convertido | perdido). Reversible, queda auditado.",
  effect: "draft",
  inputSchema: setContactStatusInput,
  async handler({ contactId, status }) {
    const [updated] = await db.update(contacts).set({ status }).where(eq(contacts.id, contactId)).returning({ id: contacts.id, status: contacts.status });
    if (!updated) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, contactId: updated.id, status: updated.status };
  },
} satisfies AgentTool<z.infer<typeof setContactStatusInput>>);

// ── Organizations ───────────────────────────────────────────────────────────

const searchOrganizationsInput = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(30).optional(),
});

export const searchOrganizationsTool: AgentTool<z.infer<typeof searchOrganizationsInput>> = {
  id: "searchOrganizations",
  description: "Busca organizaciones (clubes, colegios, empresas, instituciones, particulares) por nombre. Solo lectura.",
  effect: "read",
  inputSchema: searchOrganizationsInput,
  async handler({ query, limit }) {
    const rows = await db
      .select({ id: organizations.id, name: organizations.name, kind: organizations.kind, taxId: organizations.taxId })
      .from(organizations)
      .where(ilike(organizations.name, `%${query}%`))
      .limit(limit ?? 10);
    return { ok: true as const, count: rows.length, organizations: rows };
  },
};

const getOrganizationDetailInput = z.object({ organizationId: idLike });

export const getOrganizationDetailTool: AgentTool<z.infer<typeof getOrganizationDetailInput>> = {
  id: "getOrganizationDetail",
  description: "Detalle de una organización: datos, contactos vinculados y pedidos recientes con totales. Solo lectura.",
  effect: "read",
  inputSchema: getOrganizationDetailInput,
  async handler({ organizationId }) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!org) return { found: false as const, error: "not_found" as const };

    const contactRows = await db
      .select({ id: contacts.id, name: contacts.name, phone: contacts.phone, role: contacts.role, status: contacts.status })
      .from(contacts)
      .where(eq(contacts.organizationId, organizationId))
      .limit(20);

    const orderRows = await db
      .select({ id: orders.id, number: orders.number, status: orders.status, totalQuoted: orders.totalQuoted, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.organizationId, organizationId))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    let balanceCents = 0;
    for (const order of orderRows) {
      if (order.status === "cancelado") continue;
      const paymentRows = await db
        .select({ amount: payments.amount, cancelled: payments.cancelled })
        .from(payments)
        .where(eq(payments.orderId, order.id));
      balanceCents += toCents(order.totalQuoted) - sumActivePaymentsCents(paymentRows);
    }

    return {
      found: true as const,
      organization: org,
      contacts: contactRows,
      recentOrders: orderRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      pendingBalance: balanceCents / 100,
    };
  },
};

export const clientTools = [
  searchContactsTool,
  getContactDetailTool,
  updateContactTool,
  setContactStatusTool,
  searchOrganizationsTool,
  getOrganizationDetailTool,
] as const;
