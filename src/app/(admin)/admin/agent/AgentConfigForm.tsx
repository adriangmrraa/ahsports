"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyAgentConfig, listAiProviderModels, saveAgentConfig } from "@/app/actions/agent-config";
import type { AgentConfigScopeOption } from "@/lib/channels/agent-config-scope";
import { AI_PROVIDERS, findAiProvider, type AiProviderCatalogEntry } from "@/lib/ai/providers-catalog";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";

/**
 * Mirrors `SECRET_CLEAR` in `src/lib/crypto/secret-box.ts`. That module is
 * server-only, so the literal is duplicated here; both sides must agree.
 */
const SECRET_CLEAR = "CLEAR";
const CUSTOM_PROVIDER = "__custom__";
const CUSTOM_MODEL = "__other__";

export type AgentToolOption = {
  id: string;
  description: string;
  effect: "read" | "draft";
};

export type AgentConfigInitial = {
  provider: string;
  model: string;
  providerEndpointUrl: string;
  systemPrompt: string;
  enabledTools: string[];
  enabled: boolean;
  autoReply24h: boolean;
  autoReply24hMessage: string;
  webOrderRedirectEnabled: boolean;
  webOrderRedirectMessage: string;
};

export type AgentSecretStatus = {
  botToken: boolean;
  providerKey: boolean;
  webhookSecret: boolean;
  ycloudApiKey: boolean;
  ycloudWebhookSecret: boolean;
  kapsoApiKey: boolean;
  kapsoWebhookSecret: boolean;
  zernioApiKey: boolean;
  zernioWebhookSecret: boolean;
};

type SecretFieldKey = keyof AgentSecretStatus;

const SECRET_FIELDS: Array<{ key: SecretFieldKey; label: string; hint: string }> = [
  { key: "botToken", label: "Bot token de Telegram", hint: "Lo entrega @BotFather. Se guarda cifrado." },
  { key: "providerKey", label: "API key del proveedor de IA", hint: "Clave del proveedor configurado arriba." },
  { key: "webhookSecret", label: "Webhook secret de Telegram", hint: "Secret token del webhook (header X-Telegram-Bot-Api-Secret-Token)." },
];

/** A-15 — per-scope provider credentials for `credentialsRef: "agent_config"`. */
const PROVIDER_SECRET_FIELDS: Array<{ key: SecretFieldKey; label: string; hint: string }> = [
  { key: "ycloudApiKey", label: "YCloud API key", hint: "Credencial de envío YCloud de este ámbito (reemplaza YCLOUD_API_KEY)." },
  { key: "ycloudWebhookSecret", label: "YCloud webhook secret", hint: "Secret de verificación del webhook YCloud." },
  { key: "kapsoApiKey", label: "Kapso API key", hint: "Credencial de envío Kapso de este ámbito (reemplaza KAPSO_API_KEY)." },
  { key: "kapsoWebhookSecret", label: "Kapso webhook secret", hint: "Secret de verificación del webhook Kapso." },
  { key: "zernioApiKey", label: "Zernio API key", hint: "Credencial de Zernio de este ámbito (reemplaza ZERNIO_API_KEY)." },
  { key: "zernioWebhookSecret", label: "Zernio webhook secret", hint: "Secret de verificación del webhook Zernio." },
];

export function AgentConfigForm({
  initial,
  tools,
  secretStatus,
  scopeKey,
  scopeOptions,
  scopeExists,
}: {
  initial: AgentConfigInitial;
  tools: AgentToolOption[];
  secretStatus: AgentSecretStatus;
  /** Key of the scope this form edits — sent back verbatim on save. */
  scopeKey: string;
  scopeOptions: AgentConfigScopeOption[];
  /** False = this scope has no row yet; first save creates it. */
  scopeExists: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");

  const [provider, setProvider] = useState(initial.provider);
  const [providerChoice, setProviderChoice] = useState(() =>
    initial.provider === "" ? "" : findAiProvider(initial.provider) ? initial.provider : CUSTOM_PROVIDER,
  );
  const [customProvider, setCustomProvider] = useState(
    () => (initial.provider && !findAiProvider(initial.provider) ? initial.provider : ""),
  );
  const [endpointUrl, setEndpointUrl] = useState(initial.providerEndpointUrl);
  const [model, setModel] = useState(initial.model);
  const [modelCustom, setModelCustom] = useState(false);
  const [modelList, setModelList] = useState<{ source: "live" | "static"; models: string[] }>({
    source: "static",
    models: findAiProvider(initial.provider)?.staticModels ?? [],
  });
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt);
  const [enabledTools, setEnabledTools] = useState<string[]>(initial.enabledTools);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [autoReply24h, setAutoReply24h] = useState(initial.autoReply24h);
  const [autoReply24hMessage, setAutoReply24hMessage] = useState(initial.autoReply24hMessage);
  const [webOrderRedirectEnabled, setWebOrderRedirectEnabled] = useState(initial.webOrderRedirectEnabled);
  const [webOrderRedirectMessage, setWebOrderRedirectMessage] = useState(initial.webOrderRedirectMessage);
  const [secrets, setSecrets] = useState<Record<SecretFieldKey, string>>({
    botToken: "",
    providerKey: "",
    webhookSecret: "",
    ycloudApiKey: "",
    ycloudWebhookSecret: "",
    kapsoApiKey: "",
    kapsoWebhookSecret: "",
    zernioApiKey: "",
    zernioWebhookSecret: "",
  });

  const copyableScopes = scopeOptions.filter((o) => o.exists && o.key !== scopeKey);

  const readTools = tools.filter((tool) => tool.effect === "read");
  const draftTools = tools.filter((tool) => tool.effect === "draft");

  const catalogEntry: AiProviderCatalogEntry | undefined =
    providerChoice === CUSTOM_PROVIDER ? undefined : findAiProvider(provider);
  const isCatalogDefaultEndpoint = (value: string) =>
    AI_PROVIDERS.some((entry) => entry.defaultBaseUrl.toLowerCase() === value.trim().replace(/\/+$/, "").toLowerCase());

  // Live model listing — refetches when provider/endpoint/key change (debounced).
  // The action resolves the key server-side: typed value → scope's stored key → env.
  const providerKeyValue = secrets.providerKey;
  useEffect(() => {
    const p = provider.trim();
    if (!p) {
      setModelList({ source: "static", models: [] });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await listAiProviderModels({
        provider: p,
        endpointUrl: endpointUrl.trim() || undefined,
        apiKey: providerKeyValue.trim() || undefined,
        scope: scopeKey,
      });
      if (cancelled) return;
      setModelList(
        res.ok
          ? { source: res.source, models: res.models }
          : { source: "static", models: findAiProvider(p)?.staticModels ?? [] },
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [provider, endpointUrl, providerKeyValue, scopeKey]);

  function onProviderSelect(value: string) {
    setProviderChoice(value);
    if (value === CUSTOM_PROVIDER) {
      setProvider(customProvider);
      return;
    }
    if (value === "") {
      setProvider("");
      return;
    }
    const entry = findAiProvider(value);
    setProvider(value);
    // Auto-fill the endpoint only when the field is empty or still holds
    // another catalog default — never clobber a manual URL.
    if (entry && (!endpointUrl.trim() || isCatalogDefaultEndpoint(endpointUrl))) {
      setEndpointUrl(entry.defaultBaseUrl);
    }
    if (entry && (!model.trim() || modelList.models.includes(model))) {
      setModel(entry.defaultModel);
      setModelCustom(false);
    }
  }

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
        scope: scopeKey,
        provider,
        model,
        providerEndpointUrl: endpointUrl,
        systemPrompt,
        enabledTools,
        botToken: secrets.botToken,
        providerKey: secrets.providerKey,
        webhookSecret: secrets.webhookSecret,
        ycloudApiKey: secrets.ycloudApiKey,
        ycloudWebhookSecret: secrets.ycloudWebhookSecret,
        kapsoApiKey: secrets.kapsoApiKey,
        kapsoWebhookSecret: secrets.kapsoWebhookSecret,
        zernioApiKey: secrets.zernioApiKey,
        zernioWebhookSecret: secrets.zernioWebhookSecret,
        enabled,
        autoReply24h,
        autoReply24hMessage,
        webOrderRedirectEnabled,
        webOrderRedirectMessage,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Secrets are write-only: clear the inputs after a successful save.
      setSecrets({
        botToken: "",
        providerKey: "",
        webhookSecret: "",
        ycloudApiKey: "",
        ycloudWebhookSecret: "",
        kapsoApiKey: "",
        kapsoWebhookSecret: "",
        zernioApiKey: "",
        zernioWebhookSecret: "",
      });
      setSaved(true);
      router.refresh();
    });
  }

  function copyFromScope() {
    if (!copyFrom) return;
    setError(null);
    startTransition(async () => {
      const res = await copyAgentConfig({ from: copyFrom, to: scopeKey });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Ámbito de la configuración" variant="subtle">
        <p className="text-xs text-on-surface-variant mb-3">
          La resolución es cuenta → canal → global: una conversación usa la fila de su cuenta si existe, si
          no la del canal, si no la global. Editar un ámbito sin fila muestra el formulario en blanco y la
          crea al guardar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Ámbito a editar"
            hint={
              scopeExists
                ? undefined
                : "Este ámbito todavía no tiene fila propia — se crea al guardar."
            }
          >
            <Select
              value={scopeKey}
              onChange={(e) => router.push(`/admin/agent?scope=${encodeURIComponent(e.target.value)}`)}
            >
              {scopeOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                  {o.exists ? "" : " (sin configurar)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Copiar desde" hint="Clona la configuración de otro ámbito (incluye credenciales).">
            <div className="flex items-center gap-2">
              <Select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} disabled={pending}>
                <option value="">Elegir origen…</option>
                {copyableScopes.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending || !copyFrom}
                onClick={copyFromScope}
              >
                Copiar
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Proveedor"
            hint={
              providerChoice === CUSTOM_PROVIDER
                ? "Id libre del proveedor (ej. chat-completions, ollama). Vacío = sin configurar."
                : "Proveedor del catálogo — completa el endpoint y los modelos."
            }
          >
            <div className="flex flex-col gap-2">
              <Select value={providerChoice} onChange={(e) => onProviderSelect(e.target.value)}>
                <option value="">Sin configurar</option>
                {AI_PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
                <option value={CUSTOM_PROVIDER}>Otro (personalizado)</option>
              </Select>
              {providerChoice === CUSTOM_PROVIDER && (
                <Input
                  value={customProvider}
                  onChange={(e) => {
                    setCustomProvider(e.target.value);
                    setProvider(e.target.value);
                  }}
                  placeholder="chat-completions"
                />
              )}
            </div>
          </Field>
          <Field
            label="Endpoint URL"
            hint={
              catalogEntry
                ? `Base del proveedor. Por defecto: ${catalogEntry.defaultBaseUrl}`
                : "Base del proveedor o endpoint completo (…/chat/completions)."
            }
          >
            <Input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder={catalogEntry?.defaultBaseUrl ?? "https://api.ejemplo.com/v1"}
            />
          </Field>
          <Field
            label="Modelo"
            hint={
              modelList.source === "live"
                ? "Lista obtenida en vivo del proveedor."
                : "Lista del catálogo — se actualiza en vivo con la API key."
            }
          >
            {(() => {
              const listed = model !== "" && modelList.models.includes(model);
              const showInput = modelCustom || (model !== "" && !listed) || modelList.models.length === 0;
              if (showInput) {
                return (
                  <div className="flex items-center gap-2">
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={catalogEntry?.defaultModel || "nombre del modelo"}
                    />
                    {modelList.models.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setModelCustom(false)}>
                        Lista
                      </Button>
                    )}
                  </div>
                );
              }
              return (
                <Select
                  value={model}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === CUSTOM_MODEL) {
                      setModelCustom(true);
                      return;
                    }
                    setModel(value);
                  }}
                >
                  <option value="">Elegir modelo…</option>
                  {modelList.models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL}>Otro…</option>
                </Select>
              );
            })()}
          </Field>
        </div>

        <Field label="Prompt de sistema" hint="Si se deja vacío se usa el prompt del dominio AH Sports.">
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Prompt del agente de ventas..."
          />
        </Field>

        <Card title="Comportamiento del agente" variant="subtle">
          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="text-on-surface">Agente habilitado en este ámbito</span>
                <span className="block text-xs text-on-surface-variant">
                  Kill-switch: desactivado, los mensajes entrantes se guardan igual pero el agente no responde.
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoReply24h}
                  onChange={(e) => setAutoReply24h(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="text-on-surface">Respuesta automática de primer contacto</span>
                  <span className="block text-xs text-on-surface-variant">
                    Se envía una sola vez por conversación (durable). No aplica si el redirect web está activo.
                  </span>
                </span>
              </label>
              {autoReply24h && (
                <Field label="Mensaje de respuesta automática" hint="Texto plano, estilo WhatsApp.">
                  <Textarea
                    value={autoReply24hMessage}
                    onChange={(e) => setAutoReply24hMessage(e.target.value)}
                    placeholder="¡Hola! Gracias por escribir a AH Sports. En breve te responde el equipo."
                  />
                </Field>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={webOrderRedirectEnabled}
                  onChange={(e) => setWebOrderRedirectEnabled(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="text-on-surface">Ofrecer pedido por la web (/presupuesto)</span>
                  <span className="block text-xs text-on-surface-variant">
                    El agente puede ofrecer el wizard público para pedidos complejos. Requiere NEXT_PUBLIC_APP_URL
                    configurada (o el mensaje con link propio).
                  </span>
                </span>
              </label>
              {webOrderRedirectEnabled && (
                <Field label="Mensaje del redirect" hint="Opcional — si queda vacío se usa el texto por defecto con el link.">
                  <Textarea
                    value={webOrderRedirectMessage}
                    onChange={(e) => setWebOrderRedirectMessage(e.target.value)}
                    placeholder="Armá tu pedido desde la web: https://…"
                  />
                </Field>
              )}
            </div>

            <p className="border-t border-outline-variant pt-4 text-xs text-on-surface-variant">
              La identidad del negocio (nombre, teléfono público, horarios) se edita en{" "}
              <Link href="/admin/configuracion" className="text-primary underline">
                /admin/configuracion
              </Link>
              .
            </p>
          </div>
        </Card>

        <Card title="Credenciales (solo escritura)" variant="subtle">
          <p className="text-xs text-on-surface-variant mb-3">
            Dejá un campo vacío para mantener el valor guardado. Escribí <code className="data-mono">CLEAR</code> para
            borrarlo. Los valores nunca se muestran una vez guardados.
          </p>
          <div className="flex flex-col gap-3">
            {SECRET_FIELDS.map((field) => (
              <SecretField
                key={field.key}
                field={field}
                configured={secretStatus[field.key]}
                value={secrets[field.key]}
                pending={pending}
                onChange={(value) => setSecrets((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
          </div>
        </Card>

        <Card title="Credenciales de canal por proveedor (solo escritura)" variant="subtle">
          <p className="text-xs text-on-surface-variant mb-3">
            Las cuentas de canal con <code className="data-mono">credentialsRef = agent_config</code> resuelven estas
            claves cifradas para este ámbito — conectan un proveedor nuevo sin tocar variables de entorno.
          </p>
          <div className="flex flex-col gap-3">
            {PROVIDER_SECRET_FIELDS.map((field) => (
              <SecretField
                key={field.key}
                field={field}
                configured={secretStatus[field.key]}
                value={secrets[field.key]}
                pending={pending}
                onChange={(value) => setSecrets((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
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
    </div>
  );
}

function SecretField({
  field,
  configured,
  value,
  pending,
  onChange,
}: {
  field: { key: SecretFieldKey; label: string; hint: string };
  configured: boolean;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
}) {
  const markedForClear = value === SECRET_CLEAR;
  return (
    <Field
      label={field.label}
      hint={field.hint}
      error={markedForClear ? "Se borrará al guardar." : undefined}
    >
      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={markedForClear ? "" : value}
          disabled={markedForClear}
          placeholder={configured ? "••••••••  (configurado)" : "Sin configurar"}
          onChange={(e) => onChange(e.target.value)}
        />
        <Badge tone={configured ? "success" : "muted"}>{configured ? "Configurado" : "Sin configurar"}</Badge>
        {configured && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onChange(markedForClear ? "" : SECRET_CLEAR)}
          >
            {markedForClear ? "Cancelar" : "Borrar"}
          </Button>
        )}
      </div>
    </Field>
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
