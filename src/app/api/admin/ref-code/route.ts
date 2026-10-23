import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAgentApi } from "@/lib/agent/rbac";
import { signRefCode } from "@/lib/attribution/ref-code-sign";

const BodySchema = z.object({
  campaignId: z.string().min(1).max(120).regex(/^[A-Za-z0-9-]+$/, "Solo letras, números y guiones"),
  adsetId: z.string().max(120).regex(/^[A-Za-z0-9-]*$/).default("general"),
  adId: z.string().max(120).regex(/^[A-Za-z0-9-]*$/).default("general"),
});

/**
 * B-04 — Mints an HMAC-signed attribution ref code (port of SocialCRM
 * `api/admin/ref-code`). Signing happens server-side because the secret must
 * never reach the client bundle.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: auth.status });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const minted = {
    campaignId: parsed.data.campaignId,
    adsetId: parsed.data.adsetId || "general",
    adId: parsed.data.adId || "general",
    timestamp: Date.now(),
  };
  const code = signRefCode(minted);

  // Minting is stateless — this log is the only audit trail of who minted
  // which code. Never log the signature itself, only the payload.
  console.info("[admin/ref-code] minted", {
    userId: auth.user.id,
    campaignId: minted.campaignId,
    adsetId: minted.adsetId,
    adId: minted.adId,
    timestamp: minted.timestamp,
  });

  return NextResponse.json({ code });
}
