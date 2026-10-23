/**
 * Web-order redirect (A-08 — port of SocialCRM `web-order-redirect.ts`,
 * adapted: AH's public wizard lives at /presupuesto, not /carta-digital).
 *
 * The sales agent learns the wizard URL through a prompt directive; this
 * module builds both the URL and the owner-configured message the agent may
 * offer when a customer wants to order through the web flow.
 */
type WebOrderRedirectConfig = {
  webOrderRedirectMessage?: string | null;
};

const DEFAULT_MESSAGE =
  "Si preferís, podés armar tu pedido desde nuestra web y el equipo lo toma desde ahí:";

/**
 * Absolute URL of the public /presupuesto wizard, or null when the deploy
 * URL is not configured (`NEXT_PUBLIC_APP_URL` overrides
 * `RENDER_EXTERNAL_URL`, same order as webhook-endpoints).
 */
export function buildWebOrderUrl(): string | null {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim();
  if (!baseUrl) return null;
  try {
    return new URL("/presupuesto", baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * The owner-configured redirect message, or a safe default carrying the
 * wizard URL when one can be built.
 */
export function buildWebOrderRedirectMessage(
  config: WebOrderRedirectConfig
): string {
  const custom = config.webOrderRedirectMessage?.trim();
  if (custom) return custom;

  const url = buildWebOrderUrl();
  return url
    ? `${DEFAULT_MESSAGE}\n${url}`
    : `${DEFAULT_MESSAGE}\nIngresá desde nuestra web para continuar.`;
}
