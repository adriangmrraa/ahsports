import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentConfig } from "@/db/schema";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { AGENT_CONFIG_ID } from "@/lib/ai/config";
import { decryptIfEncrypted } from "@/lib/crypto/secret-box";
import { deriveWebhookPathToken, TELEGRAM_SECRET_HEADER } from "@/lib/channels/telegram";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { ArrowLeft } from "lucide-react";

/**
 * P4 / P4.3 — /admin/agent/telegram: Telegram channel status.
 *
 * Shows only channel readiness derived from stored config: whether the bot
 * token and webhook secret are configured, the secret header name and the
 * non-secret webhook path fingerprint. No secret is ever rendered.
 */
export default async function TelegramStatusPage() {
  await requireAgentAdmin();

  const [config] = await db
    .select({
      botTokenEnc: agentConfig.botTokenEnc,
      webhookSecretEnc: agentConfig.webhookSecretEnc,
      updatedAt: agentConfig.updatedAt,
    })
    .from(agentConfig)
    .where(eq(agentConfig.id, AGENT_CONFIG_ID))
    .limit(1);

  const botTokenConfigured = !!config?.botTokenEnc;
  const webhookSecretConfigured = !!config?.webhookSecretEnc;
  const webhookSecret = decryptIfEncrypted(config?.webhookSecretEnc);
  const webhookPath = webhookSecret ? `/api/telegram/webhook/${deriveWebhookPathToken(webhookSecret)}` : null;
  const ready = botTokenConfigured && webhookSecretConfigured;

  return (
    <div className="p-6">
      <PageHeader
        title="Telegram"
        subtitle="Estado del canal de Telegram del agente interno."
        action={
          <Link
            href="/admin/agent"
            className="text-primary hover:underline label-caps flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Configuración del agente
          </Link>
        }
      />

      <PageGuide
        what="Estado del canal de Telegram: sirve para que el equipo reciba avisos y operadores vinculados."
        whatFor="Necesita bot token y webhook secret guardados en la configuración del agente. La URL del webhook se muestra abajo."
        nextStep={{ href: "/admin/agent", label: "Configurar agente" }}
      />

      <div className="flex flex-col gap-6">
        <Card
          title="Estado del canal"
          action={<Badge tone={ready ? "success" : "warning"}>{ready ? "Operativo" : "Incompleto"}</Badge>}
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="label-caps text-on-surface-variant">Bot token</dt>
              <dd>
                <Badge tone={botTokenConfigured ? "success" : "muted"}>
                  {botTokenConfigured ? "Configurado" : "Sin configurar"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Webhook secret</dt>
              <dd>
                <Badge tone={webhookSecretConfigured ? "success" : "muted"}>
                  {webhookSecretConfigured ? "Configurado" : "Sin configurar"}
                </Badge>
              </dd>
            </div>
            <div className="md:col-span-2">
              <dt className="label-caps text-on-surface-variant">Header de verificación</dt>
              <dd className="data-mono text-on-surface">{TELEGRAM_SECRET_HEADER}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="label-caps text-on-surface-variant">Webhook</dt>
              <dd className="data-mono text-on-surface">
                {webhookPath ?? "Se habilita al guardar el webhook secret en la configuración del agente."}
              </dd>
            </div>
            {config?.updatedAt && (
              <div className="md:col-span-2">
                <dt className="label-caps text-on-surface-variant">Última actualización de config</dt>
                <dd className="data-mono text-on-surface">{formatDateTime(config.updatedAt)}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card title="Cómo activar el canal">
          <ol className="list-decimal list-inside text-sm text-on-surface-variant flex flex-col gap-1">
            <li>Creá un bot con @BotFather y copiá el token.</li>
            <li>En Configuración del agente, guardá el bot token y el webhook secret.</li>
            <li>Registrá el webhook de Telegram apuntando a la URL mostrada arriba.</li>
            <li>Vinculá el ID de Telegram de cada operador en la sección Operadores vinculados.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
