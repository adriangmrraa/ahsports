import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { channelAccounts } from "@/db/schema";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import {
  connectStateCookieName,
  fetchZernioAccount,
  isZernioConnectPlatform,
} from "@/lib/messaging/providers/zernio-connect";

/**
 * GET /admin/canales/conectar/zernio — Zernio embedded-connect return URL.
 *
 * `startZernioConnect` sends the operator's browser to Zernio's authUrl; after
 * approval Zernio lands them back here with
 * `connected={platform}&accountId&username&profileId` appended to our
 * redirect_url — which already carried the `state` nonce (CSRF: Zernio
 * preserves our query string). The nonce cookie is per-platform and one-shot.
 *
 * On success the `channel_accounts` row is upserted (provider=zernio,
 * credentialsRef=env:ZERNIO_) and the browser lands on /admin/canales with a
 * flash param the view turns into a notice. The route lives under (admin) so
 * the whole connect surface stays inside the admin tree; route handlers are
 * not wrapped by layouts.
 */

const CANALES_PATH = "/admin/canales";

function backToCanales(req: NextRequest, params: Record<string, string>): NextResponse {
  // The browser is already on our origin — env config could be wrong or
  // absent; the request's own origin is the authoritative redirect base.
  const url = new URL(CANALES_PATH, req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const sp = req.nextUrl.searchParams;
  const platform = sp.get("connected") ?? sp.get("platform") ?? "";
  const accountId = sp.get("accountId") ?? "";
  const username = sp.get("username") ?? "";
  const state = sp.get("state") ?? "";

  // Platform first: it names the per-platform state cookie below.
  if (!isZernioConnectPlatform(platform)) {
    return backToCanales(req, { error: "connect-params" });
  }

  // CSRF: the state issued by startZernioConnect must match — Zernio keeps
  // our query string through the OAuth roundtrip. One-shot cookie, keyed
  // per platform so parallel connects don't overwrite each other.
  const cookieName = connectStateCookieName(platform);
  const cookieStore = await cookies();
  const expected = cookieStore.get(cookieName)?.value ?? "";
  cookieStore.delete(cookieName);
  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return backToCanales(req, { error: "oauth-state" });
  }

  if (!accountId) {
    return backToCanales(req, { error: "connect-params" });
  }

  const apiKey = process.env.ZERNIO_API_KEY?.trim();
  // Best-effort enrichment: the callback carries only username; the account
  // record adds phoneNumber (WhatsApp) / displayName. Never fatal.
  const detail = apiKey ? await fetchZernioAccount(apiKey, accountId) : null;

  const handle = detail?.username ?? username;
  const senderAddress =
    detail?.phoneNumber ??
    (handle ? `@${handle}` : undefined) ??
    detail?.platformUserId ??
    accountId;
  const displayName = detail?.displayName ?? detail?.username ?? username ?? null;

  try {
    await db
      .insert(channelAccounts)
      .values({
        provider: "zernio",
        channel: platform,
        providerAccountId: accountId,
        senderAddress,
        displayName,
        credentialsRef: "env:ZERNIO_",
        status: "active",
      })
      .onConflictDoUpdate({
        target: [channelAccounts.provider, channelAccounts.providerAccountId],
        set: {
          channel: platform,
          senderAddress,
          displayName,
          status: "active",
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("[zernio/callback] channel_accounts upsert failed", error);
    return backToCanales(req, { error: "persist-failed" });
  }

  return backToCanales(req, { connected: `zernio:${platform}` });
}
