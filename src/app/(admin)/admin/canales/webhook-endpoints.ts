import "server-only";

/**
 * Public webhook endpoints shown on /admin/canales for provider consoles.
 *
 * The public URL must be reachable from the internet. Render provides it as
 * `RENDER_EXTERNAL_URL`; `NEXT_PUBLIC_APP_URL` overrides it on custom domains
 * and `VERCEL_URL` covers Vercel previews. When none is set the view renders a
 * hint instead of fabricating URLs. Values are derived per-request, never
 * persisted.
 */
export function publicBaseUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return raw ? raw.replace(/\/+$/, "") : null;
}

export interface WebhookEndpoint {
  provider: "ycloud" | "zernio" | "kapso";
  url: string;
  note?: string;
}

/** Inbound webhook URLs to paste into each provider's console. */
export function webhookEndpoints(baseUrl: string): WebhookEndpoint[] {
  return [
    {
      provider: "ycloud",
      url: `${baseUrl}/api/webhooks/ingress/ycloud`,
      note: "El webhook legado /api/whatsapp/webhook/<token> sigue activo.",
    },
    { provider: "zernio", url: `${baseUrl}/api/webhooks/ingress/zernio` },
    { provider: "kapso", url: `${baseUrl}/api/webhooks/ingress/kapso` },
  ];
}
