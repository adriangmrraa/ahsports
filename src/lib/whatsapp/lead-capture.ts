/**
 * Auto-capture of marketing leads on inbound contact (port of SocialCRM
 * `src/lib/whatsapp/lead-capture.ts`, adapted: AH ids are varchar uuids,
 * status uses the existing `lead_status` enum, and ref-code attribution is
 * resolved/verified through `lib/attribution`).
 *
 * First-attribution semantics: an existing lead is only stamped on fields
 * that are still EMPTY (channelAccountId, refCode, campaign/adset/ad ids,
 * contactId, name) — arbitrary inbound traffic on another account or a later
 * link click must never migrate the original attribution. `lastMessage`/
 * `lastMessageAt` are activity fields and always update.
 *
 * Phone-keyed only: callers pass a phone-shaped sender identity (checked via
 * `looksLikePhone`); social/phoneless identities live in `lead_identities` +
 * `contacts` through `ensureLeadIdentity`, not here.
 *
 * Never throws inside the pipeline contract — callers wrap it anyway, but a
 * failure here must not kill webhook processing.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { extractRefCode } from "@/lib/attribution/ref-code";
import { resolveAttributionFromRef } from "@/lib/attribution/ref-code-sign";
import { looksLikePhone, normalizePhone } from "@/lib/messaging/phone";
import type { ChannelKind } from "@/lib/messaging/types";

export interface CaptureLeadInput {
  /** Raw sender phone (normalized inside). */
  phone: string;
  name?: string | null;
  /** First-message text — `ref:CODE` is extracted from it. */
  firstMessage: string;
  channel: ChannelKind;
  /** First-attribution account — filled once, never overwritten. */
  channelAccountId?: string | null;
  /** Linked contact row from ensureLeadIdentity — filled once. */
  contactId?: string | null;
}

export async function captureLeadIfNew(
  input: CaptureLeadInput
): Promise<{ isNew: boolean; leadId?: string }> {
  if (!looksLikePhone(input.phone)) return { isNew: false };

  const phone = normalizePhone(input.phone);
  const refCode = extractRefCode(input.firstMessage);
  const attribution = resolveAttributionFromRef(refCode);
  const now = new Date();

  const [created] = await db
    .insert(leads)
    .values({
      phone,
      name: input.name ?? null,
      channel: input.channel,
      channelAccountId: input.channelAccountId ?? null,
      contactId: input.contactId ?? null,
      firstMessage: input.firstMessage,
      lastMessage: input.firstMessage,
      lastMessageAt: now,
      refCode,
      utmSource: attribution ? "meta" : null,
      campaignId: attribution?.campaignId ?? null,
      adsetId: attribution?.adsetId ?? null,
      adId: attribution?.adId ?? null,
      platform: attribution ? "meta" : input.channel,
      status: "nuevo",
    })
    .onConflictDoNothing({ target: leads.phone })
    .returning({ id: leads.id });

  if (created) return { isNew: true, leadId: created.id };

  // Existing lead: fill EMPTY first-attribution fields only (coalesce never
  // overwrites), refresh activity. Returns the lead id for callers that link.
  const [existing] = await db
    .update(leads)
    .set({
      name: sql`coalesce(${leads.name}, ${input.name ?? null})`,
      channelAccountId: sql`coalesce(${leads.channelAccountId}, ${input.channelAccountId ?? null})`,
      contactId: sql`coalesce(${leads.contactId}, ${input.contactId ?? null})`,
      refCode: sql`coalesce(${leads.refCode}, ${refCode})`,
      utmSource: sql`coalesce(${leads.utmSource}, ${attribution ? "meta" : null})`,
      campaignId: sql`coalesce(${leads.campaignId}, ${attribution?.campaignId ?? null})`,
      adsetId: sql`coalesce(${leads.adsetId}, ${attribution?.adsetId ?? null})`,
      adId: sql`coalesce(${leads.adId}, ${attribution?.adId ?? null})`,
      lastMessage: input.firstMessage,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(leads.phone, phone))
    .returning({ id: leads.id });

  return { isNew: false, leadId: existing?.id };
}
