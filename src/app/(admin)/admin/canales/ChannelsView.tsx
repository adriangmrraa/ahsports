"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Plug, Power, PowerOff, Webhook } from "lucide-react";

import {
  createChannelAccount,
  setChannelAccountStatus,
  type ChannelAccountRow,
} from "@/app/actions/channel-accounts";
import {
  registerZernioWebhookAction,
  startZernioConnect,
} from "@/app/actions/channel-connect";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Table, TD, TH, THead, TR } from "@/components/ui/Table";
import type { WebhookEndpoint } from "./webhook-endpoints";

const PROVIDERS = [
  { value: "ycloud", label: "YCloud" },
  { value: "zernio", label: "Zernio" },
  { value: "kapso", label: "Kapso" },
  { value: "telegram", label: "Telegram (bot)" },
];

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "sms", label: "SMS" },
  { value: "reddit", label: "Reddit" },
];

const PROVIDER_HINTS: Record<string, string> = {
  ycloud: "Número E.164 del remitente (ej. 5493704…)",
  zernio: "accountId de Zernio (24 hex) — visible en el dashboard",
  kapso: "phone_number_id de Meta asignado por Kapso",
  telegram: "Bot id de Telegram (parte numérica del token, antes de ':')",
};

/**
 * Credential pointers per provider. Selecting a provider pre-fills the
 * reference (never a secret): `env:PREFIX` resolves PREFIX_API_KEY /
 * PREFIX_ACCESS_TOKEN / PREFIX_WEBHOOK_SECRET at send/webhook time.
 */
const CREDENTIALS_DEFAULTS: Record<string, string> = {
  ycloud: "env:YCLOUD_",
  zernio: "env:ZERNIO_",
  kapso: "env:KAPSO_",
  telegram: "agent_config",
};

/**
 * Kapso exposes no embedded-signup/partner flow (verified against the
 * provider adapter and the SocialCRM reference), so its connect path is
 * manual: phone_number_id + an `env:KAPSO_` credential reference + the
 * webhook URL pasted in Kapso's dashboard.
 */
const MANUAL_PROVIDER_NOTES: Record<string, string> = {
  kapso:
    "Kapso no ofrece conexión embebida. Cargá el phone_number_id de Meta, apuntá la referencia a env:KAPSO_ y pegá la URL de webhook en el dashboard de Kapso.",
};

/** Zernio embedded-connect buttons (OAuth / WhatsApp Embedded Signup). */
const ZERNIO_CONNECT: { platform: string; action: string }[] = [
  { platform: "whatsapp", action: "Conectar WhatsApp (Zernio)" },
  { platform: "instagram", action: "Conectar Instagram (Zernio)" },
  { platform: "facebook", action: "Conectar Facebook (Zernio)" },
];

const ZERNIO_PLATFORMS = ZERNIO_CONNECT.map((c) => c.platform);

const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.value, c.label]),
);

const FLASH_ERRORS: Record<string, string> = {
  "oauth-state": "Estado OAuth inválido — reintentá la conexión",
  "connect-params": "Zernio no devolvió plataforma/cuenta válidas",
  "persist-failed": "No se pudo guardar la cuenta — revisá el log del servidor",
};

const PROVIDER_LABELS: Record<string, string> = {
  ycloud: "YCloud",
  zernio: "Zernio",
  kapso: "Kapso",
};

type Notice = { kind: "success" | "error"; text: string };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setFailed(false);
          timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
          setFailed(true);
        }
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copiado" : failed ? "Copiá a mano" : "Copiar"}
    </Button>
  );
}

/**
 * Channel account provisioning surface (S16 port). Local state only holds
 * optimistic status overrides — rows derive from server props so a refresh
 * after create can't leave the table stale. Secrets never cross the client:
 * `credentialsRef` is a pointer (`env:PREFIX`, `agent_config`), never a value.
 */
export function ChannelsView({
  initialAccounts,
  webhooks,
  baseUrlMissing,
  zernioConfigured,
  schemaError,
  flashConnected,
  flashError,
}: {
  initialAccounts: ChannelAccountRow[];
  webhooks: WebhookEndpoint[];
  baseUrlMissing: boolean;
  zernioConfigured: boolean;
  schemaError: string | null;
  flashConnected?: string;
  flashError?: string;
}) {
  const router = useRouter();
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const accounts = initialAccounts.map((row) =>
    statusOverrides[row.id] ? { ...row, status: statusOverrides[row.id] } : row,
  );
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(
    schemaError ? { kind: "error", text: schemaError } : null,
  );

  const [provider, setProvider] = useState("zernio");
  const [channel, setChannel] = useState("instagram");
  const [providerAccountId, setProviderAccountId] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [credentialsRef, setCredentialsRef] = useState(CREDENTIALS_DEFAULTS.zernio);
  const embeddedReady = zernioConfigured && !baseUrlMissing;
  const manualZernioPlatform = provider === "zernio" && ZERNIO_PLATFORMS.includes(channel);

  // Flash from the zernio connect callback (?connected=zernio:ig | ?error=…)
  useEffect(() => {
    if (flashConnected) {
      setNotice({ kind: "success", text: `Cuenta conectada (${flashConnected})` });
    } else if (flashError) {
      setNotice({ kind: "error", text: FLASH_ERRORS[flashError] ?? "Error al conectar la cuenta" });
    }
    if (flashConnected || flashError) router.replace("/admin/canales");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeProvider(next: string) {
    setProvider(next);
    // Only replace the reference when it is still empty or an untouched
    // provider default — never overwrite something the operator typed.
    setCredentialsRef((current) =>
      current === "" || Object.values(CREDENTIALS_DEFAULTS).includes(current)
        ? (CREDENTIALS_DEFAULTS[next] ?? "")
        : current,
    );
  }

  function connectZernio(platform: string) {
    startTransition(async () => {
      const res = await startZernioConnect({ platform });
      if (!res.ok || !res.authUrl) {
        setNotice({ kind: "error", text: res.error ?? "No se pudo iniciar la conexión" });
        return;
      }
      // Same tab: the callback lands on /admin/canales with a flash param.
      window.location.href = res.authUrl;
    });
  }

  function registerZernioHook() {
    startTransition(async () => {
      const res = await registerZernioWebhookAction();
      setNotice(
        res.ok
          ? { kind: "success", text: "Webhook registrado en Zernio" }
          : { kind: "error", text: res.error ?? "No se pudo registrar el webhook" },
      );
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createChannelAccount({
        provider,
        channel,
        providerAccountId,
        senderAddress,
        displayName: displayName || undefined,
        credentialsRef: credentialsRef || undefined,
      });
      if (!res.ok) {
        setNotice({ kind: "error", text: res.error ?? "No se pudo crear la cuenta" });
        return;
      }
      setNotice({ kind: "success", text: "Cuenta conectada" });
      setProviderAccountId("");
      setSenderAddress("");
      setDisplayName("");
      setCredentialsRef(CREDENTIALS_DEFAULTS[provider] ?? "");
      router.refresh();
    });
  }

  function toggleStatus(row: ChannelAccountRow) {
    const next = row.status === "active" ? "disconnected" : "active";
    startTransition(async () => {
      const res = await setChannelAccountStatus({ id: row.id, status: next });
      if (!res.ok) {
        setNotice({ kind: "error", text: res.error ?? "No se pudo actualizar" });
        return;
      }
      setStatusOverrides((overrides) => ({ ...overrides, [row.id]: next }));
      setNotice({
        kind: "success",
        text: next === "active" ? "Cuenta activada" : "Cuenta desconectada",
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p
          className={`rounded-md border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-status-success/40 bg-status-success/10 text-status-success"
              : "border-status-danger/40 bg-status-danger/10 text-status-danger"
          }`}
        >
          {notice.text}
        </p>
      )}

      <Card title="Conexión rápida con Zernio">
        <p className="mb-4 text-sm text-on-surface-variant">
          OAuth / WhatsApp Embedded Signup: cada botón te lleva directo al flujo de autorización de Zernio.
          Al volver se crea la fila automáticamente con credenciales vía{" "}
          <code className="data-mono text-xs">env:ZERNIO_</code>. Facebook incluye la selección de página
          dentro del flujo.
        </p>
        {!zernioConfigured && (
          <p className="mb-3 text-xs text-status-warning">
            Faltan <code className="data-mono">ZERNIO_API_KEY</code> y/o{" "}
            <code className="data-mono">ZERNIO_WEBHOOK_SECRET</code> en el entorno — la conexión
            embebida queda deshabilitada hasta configurar ambos.
          </p>
        )}
        {baseUrlMissing && (
          <p className="mb-3 text-xs text-status-warning">
            Falta <code className="data-mono">NEXT_PUBLIC_APP_URL</code> o{" "}
            <code className="data-mono">RENDER_EXTERNAL_URL</code> para armar la URL de retorno.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {ZERNIO_CONNECT.map((c) => (
            <Button
              key={c.platform}
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || !embeddedReady}
              onClick={() => connectZernio(c.platform)}
            >
              <Plug className="w-3.5 h-3.5" />
              {c.action}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          ¿Preferís API key propia? Usá el formulario manual de abajo con{" "}
          <code className="data-mono text-xs">env:ZERNIO_</code>: ambos caminos conviven y actualizan la
          misma cuenta.
        </p>
        <p className="mt-3 text-xs text-status-warning">
          Ojo: las cuentas conectadas por Zernio o Kapso guardan los mensajes, pero el agente todavía no
          responde automáticamente en esos canales — hoy el auto-reply solo funciona con WhatsApp vía YCloud
          y Telegram.
        </p>
      </Card>

      <Card title="Conectar cuenta manual (API key)">
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Proveedor">
              <Select value={provider} onChange={(e) => changeProvider(e.target.value)}>
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Canal">
              <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ID de cuenta del proveedor" hint={PROVIDER_HINTS[provider]}>
              <Input
                value={providerAccountId}
                onChange={(e) => setProviderAccountId(e.target.value)}
                placeholder={PROVIDER_HINTS[provider]}
                required
              />
            </Field>

            <Field label="Dirección del remitente" hint="Lo que ve el cliente: número, @usuario o id de página.">
              <Input
                value={senderAddress}
                onChange={(e) => setSenderAddress(e.target.value)}
                placeholder="+5493704… o @usuario"
                required
              />
            </Field>

            <Field label="Nombre visible (opcional)">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="WhatsApp principal"
              />
            </Field>

            <Field
              label="Referencia de credenciales"
              hint="'agent_config' usa las credenciales cifradas del scope (cuenta → canal → global) configurables en /admin/agent — sin redeploy. env:PREFIX resuelve PREFIX_API_KEY/ACCESS_TOKEN/WEBHOOK_SECRET del entorno (env:ZERNIO_ → ZERNIO_API_KEY). Vacío = fail-closed."
            >
              <Input
                value={credentialsRef}
                onChange={(e) => setCredentialsRef(e.target.value)}
                placeholder={CREDENTIALS_DEFAULTS[provider] ?? "env:PREFIX"}
              />
            </Field>
          </div>

          {MANUAL_PROVIDER_NOTES[provider] && (
            <p className="mt-3 text-xs text-on-surface-variant">
              {MANUAL_PROVIDER_NOTES[provider]}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {manualZernioPlatform && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => connectZernio(channel)}
                disabled={pending || !embeddedReady}
              >
                <Plug className="w-4 h-4" />
                Usar conexión embebida de {CHANNEL_LABELS[channel] ?? channel}
              </Button>
            )}
            <Button
              type="submit"
              variant={manualZernioPlatform ? "ghost" : "primary"}
              disabled={pending || !providerAccountId.trim() || !senderAddress.trim()}
            >
              <Plug className="w-4 h-4" />{" "}
              {pending ? "Conectando..." : manualZernioPlatform ? "Guardar cuenta manual" : "Conectar"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Webhooks entrantes" action={<Webhook className="w-4 h-4 text-on-surface-variant" />}>
        {baseUrlMissing ? (
          <p className="text-sm text-on-surface-variant">
            Configurá <code className="data-mono text-xs">NEXT_PUBLIC_APP_URL</code> o{" "}
            <code className="data-mono text-xs">RENDER_EXTERNAL_URL</code> para ver las URLs de webhook de
            este deploy.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {webhooks.map((w) => (
              <div
                key={w.provider}
                className="flex flex-col gap-2 rounded-md border border-outline-variant p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="label-caps text-on-surface-variant">
                    {PROVIDER_LABELS[w.provider] ?? w.provider}
                  </div>
                  <div className="truncate data-mono text-xs text-on-surface">{w.url}</div>
                  {w.note && <div className="text-xs text-on-surface-variant">{w.note}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton text={w.url} />
                  {w.provider === "zernio" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={registerZernioHook}
                    >
                      <Link2 className="w-3.5 h-3.5" /> Registrar en Zernio
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-on-surface-variant">
              En Zernio el secret es <code className="data-mono">ZERNIO_WEBHOOK_SECRET</code>; en Kapso, el
              de su dashboard; en YCloud, el token de verificación habitual. El webhook de Telegram se
              muestra en <code className="data-mono">/admin/agent/telegram</code>.
            </p>
          </div>
        )}
      </Card>

      <Card title={`Cuentas conectadas (${accounts.length})`}>
        {accounts.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No hay cuentas conectadas. Conectá la primera arriba.
          </p>
        ) : (
          <Table variant="plain">
            <THead>
              <tr>
                <TH>Proveedor</TH>
                <TH>Canal</TH>
                <TH>Cuenta</TH>
                <TH>Remitente</TH>
                <TH>Credenciales</TH>
                <TH>Estado</TH>
                <TH align="right">Acción</TH>
              </tr>
            </THead>
            <tbody>
              {accounts.map((row) => (
                <TR key={row.id}>
                  <TD className="capitalize">{PROVIDER_LABELS[row.provider] ?? row.provider}</TD>
                  <TD className="capitalize">{row.channel}</TD>
                  <TD>
                    <div className="data-mono text-xs text-on-surface">{row.providerAccountId}</div>
                    {row.displayName && (
                      <div className="text-xs text-on-surface-variant">{row.displayName}</div>
                    )}
                  </TD>
                  <TD className="data-mono text-xs">{row.senderAddress}</TD>
                  <TD className="data-mono text-xs text-on-surface-variant">
                    {row.credentialsRef ?? "—"}
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        row.status === "active"
                          ? "success"
                          : row.status === "error"
                            ? "error"
                            : "muted"
                      }
                    >
                      {row.status === "active"
                        ? "Activa"
                        : row.status === "error"
                          ? "Error"
                          : "Desconectada"}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => toggleStatus(row)}
                    >
                      {row.status === "active" ? (
                        <>
                          <PowerOff className="w-3.5 h-3.5" /> Desconectar
                        </>
                      ) : (
                        <>
                          <Power className="w-3.5 h-3.5" /> Activar
                        </>
                      )}
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
