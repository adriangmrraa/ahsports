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

import { corsHeaders } from "./cors";
import { isUniqueViolation } from "./helpers";

// ─── POST /api/leads ──────────────────────────────────────────────────────────
// Public lead-capture endpoint (B-02, port of SocialCRM `api/leads` POST).
// Creates a `leads` row with UTM/ad attribution fields from the body; a
// `ref:CODE` inside `firstMessage` resolves signed ad attribution. Rate
// limited per-IP inside its own bucket so public-API abuse can never consume
// the inbound messaging allowance.

/** Optional text: blank input is normalized to NULL so coalesce-healing works. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : null));

const CreateLeadSchema = z.object({
  phone: z.string().min(1, "phone is required").max(30),
  name: optionalText(120),
  email: z.string().email().max(200).optional().or(z.literal("")),
  firstMessage: z.string().max(2000).optional(),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(120),
  utmContent: optionalText(120),
  platform: optionalText(40),
  adId: optionalText(120),
  campaignId: optionalText(120),
  adsetId: optionalText(120),
});

function json(req: NextRequest, body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

/** CORS preflight — without this, cross-origin JSON POSTs die at 405. */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  try {
    const rate = await checkRateLimit(`leads:${clientIpFromRequest(req)}`, {
      bucket: "leads",
    });
    if (!rate.success) {
      return json(req, { error: "Too many requests" }, 429);
    }

    // Reject oversized bodies before parsing — the endpoint is public. The
    // header is only a fast path: content-length is client-supplied and may
    // be absent (chunked), so the actual body is measured too.
    if (Number(req.headers.get("content-length")) > 8000) {
      return json(req, { error: "Payload demasiado grande" }, 413);
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > 8000) {
      return json(req, { error: "Payload demasiado grande" }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(req, { error: "JSON inválido" }, 400);
    }
    const parsed = CreateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return json(
        req,
        { error: "Validation error", details: parsed.error.flatten() },
        400
      );
    }

    const data = parsed.data;
    data.phone = normalizePhone(data.phone);
    // normalizePhone strips non-digits — "abc" becomes "". Re-validate after
    // normalization or empty phones slip past zod's min(1) and collide on
    // leads.phone's unique index (second "" → unhandled 23505).
    if (!/^\d{7,15}$/.test(data.phone)) {
      return json(req, { error: "Teléfono inválido" }, 400);
    }

    const refCode = data.firstMessage ? extractRefCode(data.firstMessage) : null;

    // Attribution resolution — fail-open: errors must never block lead
    // creation. Only HMAC-verified ref codes yield ad ids; unsigned/tampered
    // codes keep the raw refCode but drop the ids they carried.
    const refAttribution = resolveAttributionFromRef(refCode);

    // Trust levels: ids from a verified ref are signed; ids from the request
    // body are unverified claims (Meta lead forms do send them). Rows carry
    // both today; with no `attribution_source` column (code-only wave, no
    // migration) analytics can tell them apart by `refCode` presence until
    // that discriminator lands.
    const resolvedCampaignId = refAttribution?.campaignId ?? data.campaignId;
    const resolvedAdsetId = refAttribution?.adsetId ?? data.adsetId;
    const resolvedAdId = refAttribution?.adId ?? data.adId;
    const resolvedPlatform = refAttribution ? "meta" : data.platform ?? (refCode ? "unknown" : "organic");
    const resolvedUtmSource = data.utmSource ?? (refAttribution ? "meta" : null);

    let lead: typeof leads.$inferSelect | undefined;
    try {
      [lead] = await db
        .insert(leads)
        .values({
          phone: data.phone,
          name: data.name,
          email: data.email || null,
          firstMessage: data.firstMessage ?? null,
          refCode: refCode ?? null,
          utmSource: resolvedUtmSource,
          utmMedium: data.utmMedium,
          utmCampaign: data.utmCampaign,
          utmContent: data.utmContent,
          platform: resolvedPlatform,
          campaignId: resolvedCampaignId,
          adsetId: resolvedAdsetId,
          adId: resolvedAdId,
        })
        .returning();
    } catch (insertErr) {
      // A repeat signup (or a retry) hits leads.phone's unique index. That is
      // a conflict, not a server fault: return only the existing id so the
      // caller can reconcile without leaking the lead's status/PII.
      if (!isUniqueViolation(insertErr)) throw insertErr;
      const [existing] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.phone, data.phone))
        .limit(1);
      return json(
        req,
        { error: "El teléfono ya está registrado", lead: existing ?? null },
        409
      );
    }

    // Server-side conversion signal (H-04): deterministic event_id dedups
    // against a pixel-side Lead event for the same signup. Fire-and-forget —
    // a slow/unavailable Meta must not add latency to public lead capture.
    // The sender logs its own failures without PII.
    void sendMetaConversion({
      eventName: "Lead",
      eventId: `lead_${lead.id}`,
      userData: { phone: data.phone, email: data.email || null },
    });

    return json(req, lead, 201);
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return json(req, { error: "Internal server error" }, 500);
  }
}
