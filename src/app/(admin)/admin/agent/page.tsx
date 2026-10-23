import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentMemories, users } from "@/db/schema";
import { AGENT_ADMIN_ROLES, requireAgentAdmin, type AgentAdminRole } from "@/lib/agent/rbac";
import { OPERATOR_BINDING_SCOPE } from "@/lib/agent/identity";
import { ALL_AGENT_TOOLS } from "@/lib/agents/tools/registry";
import {
  findAgentConfigForScope,
  listAgentConfigScopes,
  parseScopeKey,
  scopeKeyOf,
} from "@/lib/channels/agent-config-scope";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { AgentConfigForm, type AgentToolOption } from "./AgentConfigForm";
import { OperatorBindingForm } from "./OperatorBindingForm";

/**
 * P4.1 / P4 + S13 — /admin/agent: agent configuration surface.
 *
 * Server component guarded by `requireAgentAdmin()` (admin/gerencia only). It
 * loads the config row for the `?scope=` key (`global` | `channel:<channel>` |
 * `account:<uuid>` — exact-scope read via `findAgentConfigForScope`, never the
 * resolved fallback), the selectable scopes, the closed tool set, the
 * authorized operator users and the current sender bindings, then hands a
 * plain, secret-free view model to the client forms. Stored secrets are never
 * sent to the client: only a boolean "configured" status leaves the server.
 * Scoped rows are created on first save (scopeExists=false renders blank).
 */
export default async function AgentConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  await requireAgentAdmin();
  const sp = await searchParams;
  // Malformed keys degrade to the global editor; the save action re-validates.
  const scope = parseScopeKey(sp.scope) ?? {};
  const scopeKey = scopeKeyOf(scope);

  const [config, bindingRows, userRows, scopeOptions] = await Promise.all([
    findAgentConfigForScope(scope),
    db.select().from(agentMemories).where(eq(agentMemories.scope, OPERATOR_BINDING_SCOPE)),
    db
      .select({ id: users.id, name: users.name, role: users.role, active: users.active })
      .from(users)
      .orderBy(asc(users.name)),
    listAgentConfigScopes(),
  ]);
  const operators = userRows.filter(
    (user) => user.active && AGENT_ADMIN_ROLES.includes(user.role as AgentAdminRole),
  );
  const nameById = new Map(userRows.map((user) => [user.id, user.name]));

  const bindings = bindingRows
    .map((binding) => {
      const boundUserId = typeof binding.value.userId === "string" ? binding.value.userId : null;
      return { key: binding.key, userId: boundUserId, createdAt: binding.createdAt };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const tools: AgentToolOption[] = ALL_AGENT_TOOLS.map((tool) => ({
    id: tool.id,
    description: tool.description,
    effect: tool.effect,
  }));

  const secretStatus = {
    botToken: !!config?.botTokenEnc,
    providerKey: !!config?.providerKeyEnc,
    webhookSecret: !!config?.webhookSecretEnc,
    ycloudApiKey: !!config?.ycloudApiKeyEnc,
    ycloudWebhookSecret: !!config?.ycloudWebhookSecretEnc,
    kapsoApiKey: !!config?.kapsoApiKeyEnc,
    kapsoWebhookSecret: !!config?.kapsoWebhookSecretEnc,
    zernioApiKey: !!config?.zernioApiKeyEnc,
    zernioWebhookSecret: !!config?.zernioWebhookSecretEnc,
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Agente IA"
        subtitle="Proveedor, modelo, herramientas y credenciales del canal. Solo admin y gerencia."
      />

      <div className="flex flex-col gap-6">
        <Card title="Configuración del modelo">
          <AgentConfigForm
            key={`${scopeKey}:${config?.updatedAt ? new Date(config.updatedAt).getTime() : "empty"}`}
            initial={{
              provider: config?.provider ?? "",
              model: config?.model ?? "",
              systemPrompt: config?.systemPrompt ?? "",
              enabledTools: config?.enabledTools ?? [],
              // G-01: undefined on a pre-migration row means enabled (default true).
              enabled: config?.enabled !== false,
              autoReply24h: config?.autoReply24h === true,
              autoReply24hMessage: config?.autoReply24hMessage ?? "",
              webOrderRedirectEnabled: config?.webOrderRedirectEnabled === true,
              webOrderRedirectMessage: config?.webOrderRedirectMessage ?? "",
            }}
            tools={tools}
            secretStatus={secretStatus}
            scopeKey={scopeKey}
            scopeOptions={scopeOptions}
            scopeExists={config != null}
          />
        </Card>

        <Card
          title={`Operadores vinculados (${bindings.length})`}
          action={
            config?.updatedAt ? (
              <Badge tone="muted">Config actualizada {formatDateTime(config.updatedAt)}</Badge>
            ) : (
              <Badge tone="warning">Sin configurar</Badge>
            )
          }
        >
          {bindings.length === 0 ? (
            <p className="text-sm text-on-surface-variant mb-4">
              Ningún operador vinculado todavía. Sin vínculo, el agente interno rechaza los mensajes entrantes.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 mb-4">
              {bindings.map((binding) => (
                <li key={binding.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="data-mono text-on-surface">{binding.key}</span>
                  <span className="text-on-surface-variant">
                    {binding.userId ? nameById.get(binding.userId) ?? "Usuario desconocido" : "Vínculo inválido"} ·{" "}
                    {formatDateTime(binding.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-outline-variant pt-4">
            <OperatorBindingForm
              users={operators.map((user) => ({ id: user.id, name: user.name, role: user.role }))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
