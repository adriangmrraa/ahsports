"use server";

import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { channelAccounts } from "@/db/schema";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { invalidateAgentConfigScopeCache } from "@/lib/channels/agent-config-scope";
import { isSchemaNotReady } from "@/lib/channels/errors";
import {
  channelSchema,
  providerIdSchema,
} from "@/lib/channels/types";

/**
 * Channel account administration (Wave 1 of the multichannel port).
 *
 * Server actions expose metadata ONLY: provider/channel/ids/status/display
 * fields. No secret ever crosses this boundary — `credentialsRef` stores
 * WHERE credentials live (`env:PREFIX`, `agent_config`, future vault ref),
 * never the credential itself, and it is the only credential-shaped value
 * this surface accepts.
 *
 * Every mutation is admin-gated (`admin`/`gerencia`) and Zod-validated.
 * Un-migrated installs read/write nothing: schema absence is surfaced as a
 * safe "not ready" result instead of throwing into the admin UI.
 */

const CREDENTIALS_REF_RE = /^[a-z]+:[A-Za-z0-9_.-]+$/;
const CREDENTIALS_REF_AGENT_CONFIG = "agent_config";

const credentialsRefSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed || null;
  })
  .refine(
    (value) =>
      value === null ||
      value === CREDENTIALS_REF_AGENT_CONFIG ||
      CREDENTIALS_REF_RE.test(value),
    "credentialsRef debe ser 'agent_config' o tener formato 'prefix:VALUE' (ej. env:YCLOUD_MAIN)",
  );

const createChannelAccountSchema = z
  .object({
    provider: providerIdSchema,
    channel: channelSchema,
    providerAccountId: z.string().trim().min(1).max(255),
    senderAddress: z.string().trim().min(1).max(255),
    displayName: z.string().trim().max(255).optional(),
    credentialsRef: credentialsRefSchema,
  })
  .strict();

const updateChannelAccountSchema = z
  .object({
    id: z.string().trim().min(1).max(36),
    senderAddress: z.string().trim().min(1).max(255).optional(),
    displayName: z.string().trim().max(255).optional(),
    credentialsRef: credentialsRefSchema,
  })
  .strict();

const setChannelAccountStatusSchema = z
  .object({
    id: z.string().trim().min(1).max(36),
    status: z.enum(["active", "disconnected"]),
  })
  .strict();

export type ChannelAccountRow = {
  id: string;
  provider: string;
  channel: string;
  providerAccountId: string;
  senderAddress: string;
  displayName: string | null;
  credentialsRef: string | null;
  agentConfigId: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const SCHEMA_NOT_READY_ERROR =
  "La funcionalidad de cuentas de canal todavía no está migrada.";

/** Lists every channel account (metadata only, newest first). */
export async function listChannelAccounts() {
  await requireAgentAdmin();
  try {
    const rows = await db
      .select({
        id: channelAccounts.id,
        provider: channelAccounts.provider,
        channel: channelAccounts.channel,
        providerAccountId: channelAccounts.providerAccountId,
        senderAddress: channelAccounts.senderAddress,
        displayName: channelAccounts.displayName,
        credentialsRef: channelAccounts.credentialsRef,
        agentConfigId: channelAccounts.agentConfigId,
        status: channelAccounts.status,
        createdAt: channelAccounts.createdAt,
        updatedAt: channelAccounts.updatedAt,
      })
      .from(channelAccounts)
      .orderBy(asc(channelAccounts.channel), desc(channelAccounts.createdAt));
    return { ok: true as const, rows };
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return { ok: false as const, error: SCHEMA_NOT_READY_ERROR, rows: [] };
    }
    return { ok: false as const, error: "No se pudieron listar las cuentas.", rows: [] };
  }
}

/** Creates a channel account. Unique on (provider, providerAccountId). */
export async function createChannelAccount(input: unknown) {
  await requireAgentAdmin();
  const parsed = createChannelAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const data = parsed.data;

  try {
    const [created] = await db
      .insert(channelAccounts)
      .values({
        provider: data.provider,
        channel: data.channel,
        providerAccountId: data.providerAccountId,
        senderAddress: data.senderAddress,
        displayName: data.displayName?.trim() || null,
        credentialsRef: data.credentialsRef,
        status: "active",
      })
      .returning({ id: channelAccounts.id });
    invalidateAgentConfigScopeCache();
    revalidatePath("/admin/channels");
    return { ok: true as const, id: created.id };
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return { ok: false as const, error: SCHEMA_NOT_READY_ERROR };
    }
    if ((error as { code?: string } | null)?.code === "23505") {
      return {
        ok: false as const,
        error: `Ya existe una cuenta ${data.provider} con ese identificador de cuenta.`,
      };
    }
    return { ok: false as const, error: "No se pudo crear la cuenta." };
  }
}

/**
 * Edits non-identity fields: senderAddress, displayName, credentialsRef.
 * Provider/channel/providerAccountId are immutable at create time — changing
 * them would silently re-key delivery history, so they are intentionally not
 * updatable.
 */
export async function updateChannelAccount(input: unknown) {
  await requireAgentAdmin();
  const parsed = updateChannelAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { id, senderAddress, displayName, credentialsRef } = parsed.data;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (senderAddress !== undefined) updates.senderAddress = senderAddress;
  if (displayName !== undefined) updates.displayName = displayName.trim() || null;
  if (credentialsRef !== undefined) updates.credentialsRef = credentialsRef;

  try {
    const [updated] = await db
      .update(channelAccounts)
      .set(updates)
      .where(eq(channelAccounts.id, id))
      .returning({ id: channelAccounts.id });
    if (!updated) return { ok: false as const, error: "La cuenta no existe." };
    invalidateAgentConfigScopeCache();
    revalidatePath("/admin/channels");
    return { ok: true as const, id: updated.id };
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return { ok: false as const, error: SCHEMA_NOT_READY_ERROR };
    }
    return { ok: false as const, error: "No se pudo actualizar la cuenta." };
  }
}

/** Activates/disconnects an account. Disconnected accounts never resolve. */
export async function setChannelAccountStatus(input: unknown) {
  await requireAgentAdmin();
  const parsed = setChannelAccountStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { id, status } = parsed.data;

  try {
    const [updated] = await db
      .update(channelAccounts)
      .set({ status, updatedAt: new Date() })
      .where(eq(channelAccounts.id, id))
      .returning({ id: channelAccounts.id });
    if (!updated) return { ok: false as const, error: "La cuenta no existe." };
    invalidateAgentConfigScopeCache();
    revalidatePath("/admin/channels");
    return { ok: true as const, id: updated.id };
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return { ok: false as const, error: SCHEMA_NOT_READY_ERROR };
    }
    return { ok: false as const, error: "No se pudo actualizar el estado." };
  }
}
