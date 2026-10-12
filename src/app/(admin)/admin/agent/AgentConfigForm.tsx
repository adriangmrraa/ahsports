"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAgentConfig } from "@/app/actions/agent-config";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";

/**
 * Mirrors `SECRET_CLEAR` in `src/lib/crypto/secret-box.ts`. That module is
 * server-only, so the literal is duplicated here; both sides must agree.
 */
const SECRET_CLEAR = "CLEAR";

export type AgentToolOption = {
  id: string;
  description: string;
  effect: "read" | "draft";
};

export type AgentConfigInitial = {
  provider: string;
  model: string;
  systemPrompt: string;
  enabledTools: string[];
};

export type AgentSecretStatus = {
  botToken: boolean;
  providerKey: boolean;
  webhookSecret: boolean;
};

type SecretFieldKey = "botToken" | "providerKey" | "webhookSecret";

const SECRET_FIELDS: Array<{ key: SecretFieldKey; label: string; hint: string }> = [
  { key: "botToken", label: "Bot token de Telegram", hint: "Lo entrega @BotFather. Se guarda cifrado." },
  { key: "providerKey", label: "API key del proveedor de IA", hint: "Clave del proveedor configurado arriba." },
  { key: "webhookSecret", label: "Webhook secret de Telegram", hint: "Secret token del webhook (header X-Telegram-Bot-Api-Secret-Token)." },
];

export function AgentConfigForm({
  initial,
  tools,
  secretStatus,
}: {
  initial: AgentConfigInitial;
  tools: AgentToolOption[];
  secretStatus: AgentSecretStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt);
  const [enabledTools, setEnabledTools] = useState<string[]>(initial.enabledTools);
  const [secrets, setSecrets] = useState<Record<SecretFieldKey, string>>({
    botToken: "",
    providerKey: "",
    webhookSecret: "",
  });

  const readTools = tools.filter((tool) => tool.effect === "read");
  const draftTools = tools.filter((tool) => tool.effect === "draft");

  function toggleTool(id: string) {
    setEnabledTools((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveAgentConfig({
        provider,
        model,
        systemPrompt,
        enabledTools,
        botToken: secrets.botToken,
        providerKey: secrets.providerKey,
        webhookSecret: secrets.webhookSecret,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Secrets are write-only: clear the inputs after a successful save.
      setSecrets({ botToken: "", providerKey: "", webhookSecret: "" });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Proveedor" hint="Identificador del proveedor (ej. openai, deepseek). Vacío = sin configurar.">
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="openai" />
        </Field>
        <Field label="Modelo" hint="Nombre del modelo tal como lo espera el proveedor.">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
        </Field>
      </div>

      <Field label="Prompt de sistema" hint="Si se deja vacío se usa el prompt del dominio AH Sports.">
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Prompt del agente de ventas..."
        />
      </Field>

      <Card title="Credenciales (solo escritura)" variant="subtle">
        <p className="text-xs text-on-surface-variant mb-3">
          Dejá un campo vacío para mantener el valor guardado. Escribí <code className="data-mono">CLEAR</code> para
          borrarlo. Los valores nunca se muestran una vez guardados.
        </p>
        <div className="flex flex-col gap-3">
          {SECRET_FIELDS.map((field) => {
            const configured = secretStatus[field.key];
            const markedForClear = secrets[field.key] === SECRET_CLEAR;
            return (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                error={markedForClear ? "Se borrará al guardar." : undefined}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={markedForClear ? "" : secrets[field.key]}
                    disabled={markedForClear}
                    placeholder={configured ? "••••••••  (configurado)" : "Sin configurar"}
                    onChange={(e) => setSecrets((current) => ({ ...current, [field.key]: e.target.value }))}
                  />
                  <Badge tone={configured ? "success" : "muted"}>{configured ? "Configurado" : "Sin configurar"}</Badge>
                  {configured && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        setSecrets((current) => ({
                          ...current,
                          [field.key]: markedForClear ? "" : SECRET_CLEAR,
                        }))
                      }
                    >
                      {markedForClear ? "Cancelar" : "Borrar"}
                    </Button>
                  )}
                </div>
              </Field>
            );
          })}
        </div>
      </Card>

      <Card title="Herramientas habilitadas" variant="subtle">
        <p className="text-xs text-on-surface-variant mb-3">
          Solo se ejecutan herramientas de lectura y borrador (reversibles). Ninguna finaliza pedidos, cobra ni avanza
          producción.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ToolGroup title="Lectura" tools={readTools} enabled={enabledTools} onToggle={toggleTool} />
          <ToolGroup title="Borrador" tools={draftTools} enabled={enabledTools} onToggle={toggleTool} />
        </div>
      </Card>

      {error && <p className="text-sm text-error">{error}</p>}
      {saved && <p className="text-sm text-success">Configuración del agente guardada.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}

function ToolGroup({
  title,
  tools,
  enabled,
  onToggle,
}: {
  title: string;
  tools: AgentToolOption[];
  enabled: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps text-on-surface-variant">{title}</span>
      {tools.length === 0 && <p className="text-xs text-on-surface-variant">Sin herramientas.</p>}
      {tools.map((tool) => (
        <label key={tool.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled.includes(tool.id)}
            onChange={() => onToggle(tool.id)}
            className="mt-1"
          />
          <span>
            <span className="data-mono text-on-surface">{tool.id}</span>
            <span className="block text-xs text-on-surface-variant">{tool.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
