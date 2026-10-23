import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { extractRefCode } from "@/lib/attribution/ref-code";
import { resolveAttributionFromRef } from "@/lib/attribution/ref-code-sign";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { normalizePhone } from "@/lib/messaging/phone";
import { sendMetaConversion } from "@/lib/meta/conversions";

import { isUniqueViolation } from "./helpers";

// ─── POST /api/leads ──────────────────────────────────────────────────────────
// Public lead-capture endpoint (B-02, port of SocialCRM `api/leads` POST).
// Creates a `leads` row with UTM/ad attribution fields from the body; a
// `ref:CODE` inside `firstMessage` resolves signed ad attribution. Rate
// limited per-IP inside its own bucket so public-API abuse can never consume
// the inbound messaging allowance.

const CreateLeadSchema = z.object({
  phone: z.string().min(1, "phone is required").max(30),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  firstMessage: z.string().max(2000).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  utmContent: z.string().max(120).optional(),
  platform: z.string().max(40).optional(),
  adId: z.string().max(120).optional(),
  campaignId: z.string().max(120).optional(),
  adsetId: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rate = await checkRateLimit(`leads:${clientIpFromRequest(req)}`, {
      bucket: "leads",
    });
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Reject oversized bodies before parsing — the endpoint is public. The
    // header is only a fast path: content-length is client-supplied and may
    // be absent (chunked), so the actual body is measured too.
    if (Number(req.headers.get("content-length")) > 8000) {
      return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > 8000) {
      return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const parsed = CreateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    data.phone = normalizePhone(data.phone);
    // normalizePhone strips non-digits — "abc" becomes "". Re-validate after
    // normalization or empty phones slip past zod's min(1) and collide on
    // leads.phone's unique index (second "" → unhandled 23505).
    if (!/^\d{7,15}$/.test(data.phone)) {
      return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
    }

    const refCode = data.firstMessage ? extractRefCode(data.firstMessage) : null;

    // Attribution resolution — fail-open: errors must never block lead
    // creation. Signed codes that fail HMAC verification keep the raw refCode
    // but drop the ad ids they carried.
    const refAttribution = resolveAttributionFromRef(refCode);

    const resolvedCampaignId = refAttribution?.campaignId ?? data.campaignId ?? null;
    const resolvedAdsetId = refAttribution?.adsetId ?? data.adsetId ?? null;
    const resolvedAdId = refAttribution?.adId ?? data.adId ?? null;
    const resolvedPlatform = refAttribution ? "meta" : data.platform ?? (refCode ? "unknown" : "organic");
    const resolvedUtmSource = data.utmSource ?? (refAttribution ? "meta" : null);

    let lead: typeof leads.$inferSelect | undefined;
    try {
      [lead] = await db
        .insert(leads)
        .values({
          phone: data.phone,
          name: data.name ?? null,
          email: data.email || null,
          firstMessage: data.firstMessage ?? null,
          refCode: refCode ?? null,
          utmSource: resolvedUtmSource,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmContent: data.utmContent ?? null,
          platform: resolvedPlatform,
          campaignId: resolvedCampaignId,
          adsetId: resolvedAdsetId,
          adId: resolvedAdId,
        })
        .returning();
    } catch (insertErr) {
      // A repeat signup (or a retry) hits leads.phone's unique index. That is
      // a conflict, not a server fault: return the existing lead so the
      // caller can reconcile instead of a 500.
      if (!isUniqueViolation(insertErr)) throw insertErr;
      const [existing] = await db
        .select({
          id: leads.id,
          phone: leads.phone,
          name: leads.name,
          status: leads.status,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(eq(leads.phone, data.phone))
        .limit(1);
      return NextResponse.json(
        { error: "El teléfono ya está registrado", lead: existing ?? null },
        { status: 409 }
      );
    }

    // Server-side conversion signal (H-04): deterministic event_id dedups
    // against a pixel-side Lead event for the same signup. Fire-and-forget —
    // a CAPI failure must not fail lead capture.
    const capi = await sendMetaConversion({
      eventName: "Lead",
      eventId: `lead_${lead.id}`,
      userData: { phone: data.phone, email: data.email || null },
    });
    if (!capi.ok && capi.reason !== "not_configured") {
      console.warn("[POST /api/leads] meta capi lead event failed:", capi.reason);
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
