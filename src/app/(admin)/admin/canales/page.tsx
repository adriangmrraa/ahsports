import { listChannelAccounts } from "@/app/actions/channel-accounts";
import { PageHeader } from "@/components/ui/Card";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { publicBaseUrl, webhookEndpoints } from "./webhook-endpoints";
import { ChannelsView } from "./ChannelsView";

/**
 * /admin/canales — channel account provisioning.
 *
 * Lists `channel_accounts` (provider ↔ physical-account rows), creates manual
 * accounts, toggles status, and shows the inbound webhook URLs each provider
 * console needs. Zernio platforms also get an embedded-connect flow:
 * `startZernioConnect` (action) → Zernio authUrl → back to
 * `/admin/canales/conectar/zernio` (route handler) → `?connected=zernio:<plat>`
 * or `?error=<code>` flash consumed by the view.
 */
export default async function CanalesPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireAgentAdmin();
  const sp = await searchParams;

  const [accountsResult] = await Promise.all([listChannelAccounts()]);
  const baseUrl = publicBaseUrl();

  return (
    <>
      <PageHeader
        title="Canales"
        subtitle="Cuentas físicas por proveedor: cómo se envía y por dónde entran los webhooks."
      />
      <ChannelsView
        initialAccounts={accountsResult.ok ? accountsResult.rows : []}
        schemaError={accountsResult.ok ? null : accountsResult.error}
        webhooks={baseUrl ? webhookEndpoints(baseUrl) : []}
        baseUrlMissing={!baseUrl}
        flashConnected={sp.connected}
        flashError={sp.error}
      />
    </>
  );
}
