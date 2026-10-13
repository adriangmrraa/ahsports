"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentConfig, users } from "@/db/schema";
import { AGENT_ADMIN_ROLES, requireAgentAdmin, type AgentAdminRole } from "@/lib/agent/rbac";
import { bindOperatorIdentity, operatorBindingKey } from "@/lib/agent/identity";
import { resolveSecretUpdate } from "@/lib/crypto/secret-box";
import { ALL_AGENT_TOOLS } from "@/lib/agents/tools/registry";
import { AGENT_CONFIG_ID } from "@/lib/ai/config";

/**
 * P4.1 / P4 — server actions for the agent admin surface.
 *
 * `saveAgentConfig` upserts the singleton `agent_config` row and records the
 * acting administrator. Secrets are write-only: an empty submission keeps the
 * stored value, the literal `CLEAR` wipes it, and anything else is encrypted
 * with `resolveSecretUpdate` before it touches the DB. No secret is ever
 * returned to the caller.
 *
 * `bindAgentOperator` wires the P1 `bindOperatorIdentity` contract so an
 * authorized admin can bind a channel transport id to an internal operator.
 */

const saveAgentConfigSchema = z
  .object({
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

/** Persists provider/model/prompt/tools + write-only secrets for agent id 1. */
export async function saveAgentConfig(input: unknown) {
  const user = await requireAgentAdmin();
  const parsed = saveAgentConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const data = parsed.data;

  // Only persist tool ids from the closed registry set; unknown ids are dropped
  // exactly like the runtime `resolveEnabledTools` filter does.
  const knownToolIds = new Set(ALL_AGENT_TOOLS.map((tool) => tool.id));
  const enabledTools = data.enabledTools.filter((id) => knownToolIds.has(id));

  try {
    const [current] = await db
      .select({
        botTokenEnc: agentConfig.botTokenEnc,
        providerKeyEnc: agentConfig.providerKeyEnc,
        webhookSecretEnc: agentConfig.webhookSecretEnc,
      })
      .from(agentConfig)
      .where(eq(agentConfig.id, AGENT_CONFIG_ID))
      .limit(1);

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

    await db
      .insert(agentConfig)
      .values({ id: AGENT_CONFIG_ID, ...values })
      .onConflictDoUpdate({ target: agentConfig.id, set: values });
  } catch {
    // Encryption without SECRET_ENCRYPTION_KEY throws; never surface internals.
    return { ok: false as const, error: "No se pudo guardar la configuración del agente." };
  }

  revalidatePath("/admin/agent");
  return { ok: true as const, enabledTools };
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
