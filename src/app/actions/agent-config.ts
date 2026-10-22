"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentConfig, users } from "@/db/schema";
import { AGENT_ADMIN_ROLES, requireAgentAdmin, type AgentAdminRole } from "@/lib/agent/rbac";
import { bindOperatorIdentity, operatorBindingKey } from "@/lib/agent/identity";
import {
  findAgentConfigForScope,
  invalidateAgentConfigScopeCache,
  parseScopeKey,
  scopeColumnsForInsert,
  scopeKeyOf,
  type AgentConfigScope,
} from "@/lib/channels/agent-config-scope";
import { isSchemaNotReady } from "@/lib/channels/errors";
import { resolveSecretUpdate } from "@/lib/crypto/secret-box";
import { ALL_AGENT_TOOLS } from "@/lib/agents/tools/registry";
import { AGENT_CONFIG_ID } from "@/lib/ai/config";

/**
 * P4.1 / P4 — server actions for the agent admin surface.
 *
 * `saveAgentConfig` persists provider/model/prompt/tools + write-only secrets
 * for the scope the editor is on (`scope` key: "global" | "channel:<channel>" |
 * "account:<uuid>"). The existing row for that exact scope is updated;
 * otherwise a new scoped row is inserted (`scopeColumnsForInsert` derives the
 * account's channel). Secrets are write-only: an empty submission keeps the
 * stored value, the literal `CLEAR` wipes it, and anything else is encrypted
 * with `resolveSecretUpdate` before it touches the DB. No secret is ever
 * returned to the caller.
 *
 * `copyAgentConfig` clones one scope's row (encrypted secret blobs included —
 * the same SECRET_ENCRYPTION_KEY decrypts them) into another scope, creating
 * the target row when absent.
 *
 * `bindAgentOperator` wires the P1 `bindOperatorIdentity` contract so an
 * authorized admin can bind a channel transport id to an internal operator.
 */

const scopeKeySchema = z.string().trim().max(64);

const saveAgentConfigSchema = z
  .object({
    // Scope of the row being saved. Absent/invalid = global (legacy behavior).
    scope: z.string().trim().max(64).optional(),
    provider: z.string().max(64),
    model: z.string().max(128),
    systemPrompt: z.string().max(20_000),
    enabledTools: z.array(z.string().trim().min(1).max(64)).max(64),
    // Write-only secret fields. Empty = keep, `CLEAR` = wipe, otherwise set.
    botToken: z.string().max(4096),
    providerKey: z.string().max(4096),
    webhookSecret: z.string().max(512),
  })
  .strict();

export type SaveAgentConfigInput = z.input<typeof saveAgentConfigSchema>;

const copyAgentConfigSchema = z
  .object({ from: scopeKeySchema, to: scopeKeySchema })
  .strict();

const bindOperatorSchema = z
  .object({
    channel: z.enum(["telegram", "whatsapp"]),
    transportId: z.string().trim().min(1).max(255),
    userId: z.string().trim().min(1).max(36),
  })
  .strict();

export type BindAgentOperatorInput = z.input<typeof bindOperatorSchema>;

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/**
 * Inserts a fresh row for `scope`. Global keeps the singleton convention
 * (id = 1, conflict-tolerant upsert); scoped rows rely on the partial unique
 * indexes — a concurrent insert surfaces as 23505.
 */
async function insertConfigRow(
  scope: AgentConfigScope,
  values: Record<string, unknown>,
): Promise<void> {
  const isGlobal = scope.channelAccountId == null && scope.channel == null;
  if (isGlobal) {
    await db
      .insert(agentConfig)
      .values({ id: AGENT_CONFIG_ID, ...values })
      .onConflictDoUpdate({ target: agentConfig.id, set: values });
    return;
  }
  const scopeCols = await scopeColumnsForInsert(scope);
  await db.insert(agentConfig).values({ ...values, ...scopeCols });
}

/** Persists provider/model/prompt/tools + write-only secrets for `scope`. */
export async function saveAgentConfig(input: unknown) {
  const user = await requireAgentAdmin();
  const parsed = saveAgentConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const data = parsed.data;
  // An unparsable scope key must fail loudly — silently falling back to global
  // would overwrite the default config when the admin meant a scoped row.
  const scope = parseScopeKey(data.scope ?? "global");
  if (scope == null) {
    return { ok: false as const, error: "Ámbito de configuración inválido." };
  }

  // Only persist tool ids from the closed registry set; unknown ids are dropped
  // exactly like the runtime `resolveEnabledTools` filter does.
  const knownToolIds = new Set(ALL_AGENT_TOOLS.map((tool) => tool.id));
  const enabledTools = data.enabledTools.filter((id) => knownToolIds.has(id));

  try {
    // Exact-scope read (no account→channel→global fallback): editing a scoped
    // row must preserve THAT row's secrets, not inherit the broader scope's.
    const current = await findAgentConfigForScope(scope);

    const values = {
      provider: nullable(data.provider),
      model: nullable(data.model),
      systemPrompt: data.systemPrompt.trim() ? data.systemPrompt : null,
      enabledTools,
      botTokenEnc: resolveSecretUpdate(data.botToken, current?.botTokenEnc ?? null).stored,
      providerKeyEnc: resolveSecretUpdate(data.providerKey, current?.providerKeyEnc ?? null).stored,
      webhookSecretEnc: resolveSecretUpdate(data.webhookSecret, current?.webhookSecretEnc ?? null).stored,
      updatedById: user.id,
      updatedAt: new Date(),
    };

    if (current) {
      await db.update(agentConfig).set(values).where(eq(agentConfig.id, current.id));
    } else {
      await insertConfigRow(scope, values);
    }
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return {
        ok: false as const,
        error: "Los ámbitos de configuración todavía no están migrados.",
      };
    }
    if (isUniqueViolation(error)) {
      return { ok: false as const, error: "Ya existe una configuración para ese ámbito." };
    }
    // Encryption without SECRET_ENCRYPTION_KEY throws; never surface internals.
    return { ok: false as const, error: "No se pudo guardar la configuración del agente." };
  }

  invalidateAgentConfigScopeCache();
  revalidatePath("/admin/agent");
  return { ok: true as const, enabledTools };
}

/**
 * Clones the source scope's config row (provider/model/prompt/tools + the
 * encrypted secret blobs verbatim) into the target scope. Unimplemented in
 * the runtime today for per-account rows that resolve through a channel
 * binding — copy always writes a REAL scoped row, never an alias.
 */
export async function copyAgentConfig(input: unknown) {
  const user = await requireAgentAdmin();
  const parsed = copyAgentConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos" };
  }
  const from = parseScopeKey(parsed.data.from);
  const to = parseScopeKey(parsed.data.to);
  if (!from || !to) {
    return { ok: false as const, error: "Ámbito de configuración inválido." };
  }
  if (scopeKeyOf(from) === scopeKeyOf(to)) {
    return { ok: false as const, error: "Origen y destino son el mismo ámbito." };
  }

  try {
    const source = await findAgentConfigForScope(from);
    if (!source) {
      return {
        ok: false as const,
        error: "El ámbito origen no tiene una configuración propia para copiar.",
      };
    }

    // Explicit field pick (not an omit-destructure): scope/id/audit columns
    // can never leak into the copied row.
    const data: Record<string, unknown> = {
      provider: source.provider,
      model: source.model,
      systemPrompt: source.systemPrompt,
      enabledTools: source.enabledTools,
      botTokenEnc: source.botTokenEnc,
      providerKeyEnc: source.providerKeyEnc,
      webhookSecretEnc: source.webhookSecretEnc,
    };

    const target = await findAgentConfigForScope(to);
    const stamp = { updatedById: user.id, updatedAt: new Date() };
    if (target) {
      await db
        .update(agentConfig)
        .set({ ...data, ...stamp })
        .where(eq(agentConfig.id, target.id));
    } else {
      await insertConfigRow(to, { ...data, ...stamp });
    }
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return {
        ok: false as const,
        error: "Los ámbitos de configuración todavía no están migrados.",
      };
    }
    if (isUniqueViolation(error)) {
      return { ok: false as const, error: "Ya existe una configuración para ese ámbito." };
    }
    return { ok: false as const, error: "No se pudo copiar la configuración." };
  }

  invalidateAgentConfigScopeCache();
  revalidatePath("/admin/agent");
  return { ok: true as const };
}

/** Binds a channel transport id (e.g. a Telegram sender id) to an operator. */
export async function bindAgentOperator(input: unknown) {
  await requireAgentAdmin();
  const parsed = bindOperatorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { channel, transportId, userId } = parsed.data;

  const [target] = await db
    .select({ id: users.id, active: users.active, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) return { ok: false as const, error: "El usuario seleccionado no existe." };
  if (!target.active) return { ok: false as const, error: "El usuario seleccionado está inactivo." };
  if (!AGENT_ADMIN_ROLES.includes(target.role as AgentAdminRole)) {
    return { ok: false as const, error: "El usuario no tiene un rol autorizado (admin o gerencia)." };
  }

  try {
    await bindOperatorIdentity(channel, transportId, userId);
  } catch {
    return { ok: false as const, error: "No se pudo vincular el operador." };
  }

  revalidatePath("/admin/agent");
  return { ok: true as const, bindingKey: operatorBindingKey(channel, transportId) };
}
