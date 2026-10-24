"use server";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { publicBaseUrl } from "@/app/(admin)/admin/canales/webhook-endpoints";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import {
  connectStateCookieName,
  getZernioConnectUrl,
  isZernioConnectPlatform,
  registerZernioWebhook,
  resolveZernioProfileId,
  ZERNIO_WHATSAPP_ONBOARDING,
} from "@/lib/messaging/providers/zernio-connect";

/**
 * Connect-flow server actions for /admin/canales.
 *
 * `startZernioConnect` starts the Zernio embedded connect (OAuth / WhatsApp
 * Embedded Signup): it mints a per-platform CSRF nonce into an httpOnly cookie,
 * embeds it in our own `redirect_url` query string (Zernio preserves it through
 * the roundtrip) and returns the provider `authUrl` the browser must visit.
 * The callback route at `/admin/canales/conectar/zernio` verifies the nonce and
 * upserts the `channel_accounts` row.
 *
 * `registerZernioWebhookAction` posts our unified ingress URL + the
 * caller-chosen `ZERNIO_WEBHOOK_SECRET` to Zernio's webhook settings. YCloud and
 * Kapso keep console-configured webhooks — the copyable URLs live on the page.
 *
 * Neither action ever sees or stores a credential itself: the API key comes
 * from `ZERNIO_API_KEY` (the same env the account row later references via
 * `env:ZERNIO_`). Every call is `requireAgentAdmin`-gated and Zod-validated.
 */

const ZERNIO_CALLBACK_PATH = "/admin/canales/conectar/zernio";

const startConnectSchema = z
  .object({
    platform: z.string().trim().min(1).max(32),
    onboarding: z.enum(ZERNIO_WHATSAPP_ONBOARDING).optional(),
  })
  .strict();

export async function startZernioConnect(input: unknown) {
  await requireAgentAdmin();
  const parsed = startConnectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos" };
  }
  const { platform, onboarding } = parsed.data;
  if (!isZernioConnectPlatform(platform)) {
    return { ok: false as const, error: `Conexión embebida no disponible para '${platform}'` };
  }

  const apiKey = process.env.ZERNIO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false as const, error: "Falta ZERNIO_API_KEY en las variables de entorno" };
  }
  const baseUrl = publicBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      error: "Falta la URL pública (NEXT_PUBLIC_APP_URL o RENDER_EXTERNAL_URL)",
    };
  }

  const profile = await resolveZernioProfileId(apiKey);
  if (!profile.ok) return { ok: false as const, error: profile.error };

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(connectStateCookieName(platform), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https"),
    path: "/",
    maxAge: 10 * 60,
  });

  const connect = await getZernioConnectUrl({
    platform,
    profileId: profile.profileId,
    redirectUrl: `${baseUrl}${ZERNIO_CALLBACK_PATH}?state=${state}`,
    apiKey,
    onboarding,
  });
  if (!connect.ok) {
    // No authUrl to return — drop the nonce instead of leaving a dead
    // one-shot cookie that could only ever fail verification later.
    cookieStore.delete(connectStateCookieName(platform));
    return { ok: false as const, error: connect.error };
  }
  return { ok: true as const, authUrl: connect.authUrl };
}

export async function registerZernioWebhookAction() {
  await requireAgentAdmin();
  const apiKey = process.env.ZERNIO_API_KEY?.trim();
  const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
  if (!apiKey || !secret) {
    return {
      ok: false as const,
      error: "Faltan ZERNIO_API_KEY y/o ZERNIO_WEBHOOK_SECRET en el entorno",
    };
  }
  const baseUrl = publicBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      error: "Falta la URL pública (NEXT_PUBLIC_APP_URL o RENDER_EXTERNAL_URL)",
    };
  }
  return registerZernioWebhook({
    url: `${baseUrl}/api/webhooks/ingress/zernio`,
    secret,
    apiKey,
  });
}
