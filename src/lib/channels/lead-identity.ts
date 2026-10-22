import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { contacts, conversations, leadIdentities } from "@/db/schema";

import { normalizePhone } from "./phone";
import type { Channel } from "./types";

/**
 * Lead identity resolution for multi-channel installs.
 *
 * AH Sports has no `leads` table — the lead entity is `contacts` (status
 * `nuevo`…`convertido`). The phone-less channels (instagram/facebook/reddit)
 * key contacts through `lead_identities(channel, external_id)` where
 * `external_id` is the canonical identity — `canonicalExternalUserId()`
 * output, digits-normalized for phone-shaped values.
 *
 * Resolution order:
 *   1. `lead_identities(channel, external_id)` → link the existing contact.
 *   2. `contacts.phone` digits fallback → attach the new identity to it.
 *   3. Neither → create a phone-less contact + its identity row.
 *
 * The conversation is bound by `conversations.customer_id` — the AH link
 * between a thread and its contact. It is only ever SET, never re-pointed.
 *
 * Never throws: identity linking is best-effort bookkeeping — a failure must
 * not fail webhook processing.
 */

export interface LeadIdentityInput {
  channel: Channel;
  /** Raw provider identity (as stored on conversations.external_thread_id). */
  externalUserId: string;
  /** Canonical key — canonicalExternalUserId() output; the identity dedup key. */
  externalUserIdNormalized: string;
  customerName?: string | null;
  customerPhone?: string | null;
  channelAccountId: string | null;
  conversationId: string;
}

/** Stamps `customerId` onto a conversation that lacks one. Never rebinds. */
async function linkConversationToContact(
  conversationId: string,
  contactId: string
): Promise<void> {
  await db
    .update(conversations)
    .set({ customerId: contactId })
    .where(
      and(
        eq(conversations.id, conversationId),
        isNull(conversations.customerId)
      )
    );
}

export async function ensureLeadIdentity(
  input: LeadIdentityInput
): Promise<void> {
  const { channel, externalUserIdNormalized: externalId } = input;
  try {
    // 1. Known identity → link its contact to this conversation if needed.
    const [identity] = await db
      .select({ contactId: leadIdentities.contactId })
      .from(leadIdentities)
      .where(
        and(
          eq(leadIdentities.channel, channel),
          eq(leadIdentities.externalId, externalId)
        )
      )
      .limit(1);
    if (identity) {
      await linkConversationToContact(input.conversationId, identity.contactId);
      return;
    }

    // 2. Phone fallback → attach the new identity to that existing contact.
    // contacts.phone may carry punctuation; compare on digits only.
    const phone = input.customerPhone
      ? normalizePhone(input.customerPhone)
      : "";
    let contactId: string | undefined;
    if (phone) {
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          sql`regexp_replace(${contacts.phone}, '\D', '', 'g') = ${phone}`
        )
        .limit(1);
      contactId = contact?.id;
    }

    // 3. No match anywhere → create the (possibly phone-less) contact.
    let createdContactId: string | undefined;
    if (contactId == null) {
      const [created] = await db
        .insert(contacts)
        .values({
          name:
            input.customerName?.trim() ||
            input.externalUserId.trim() ||
            "Contacto",
          phone: phone ? `+${phone}` : null,
        })
        .returning({ id: contacts.id });
      contactId = created.id;
      createdContactId = created.id;
    }

    try {
      await db
        .insert(leadIdentities)
        .values({ contactId, channel, externalId });
      await linkConversationToContact(input.conversationId, contactId);
    } catch (err) {
      if ((err as { code?: string } | null)?.code !== "23505") throw err;
      // (channel, external_id) race: a concurrent inbound won the identity
      // row. Re-link to the winning contact so the conversation never orphans.
      const [winner] = await db
        .select({ contactId: leadIdentities.contactId })
        .from(leadIdentities)
        .where(
          and(
            eq(leadIdentities.channel, channel),
            eq(leadIdentities.externalId, externalId)
          )
        )
        .limit(1);
      if (winner) {
        await linkConversationToContact(input.conversationId, winner.contactId);
        if (
          createdContactId != null &&
          winner.contactId !== createdContactId &&
          !phone
        ) {
          // Phone-less shell created milliseconds ago: it can hold no
          // identities/orders/attachments yet, so drop it instead of leaving
          // a duplicate contact. A phone-bearing shell stays: it is a
          // matchable contact, not an orphan.
          await db.delete(contacts).where(eq(contacts.id, createdContactId));
        }
      }
    }
  } catch (err) {
    console.warn(
      `[contacts] ensureLeadIdentity failed for ${channel}:${externalId}:`,
      err
    );
  }
}
