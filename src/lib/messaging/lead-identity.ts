/**
 * Lead identity resolution for multi-channel installs (ported from SocialCRM;
 * adapted: AH ids are varchar uuids, the lead table is `contacts`, and the
 * `lead_identities` table belongs to the parallel `ah-channel-accounts` wave —
 * it is NOT statically imported here).
 *
 * Phone channels key contacts on `contacts.phone` (existing behavior).
 * Phone-less channels (instagram/facebook) key contacts through
 * `lead_identities(channel, externalId)` where `externalId` is the canonical
 * identity — the same value stored on `conversations.external_thread_id`.
 *
 * Resolution order (unchanged from source §2.4.1):
 *   1. `lead_identities(channel, externalId)` → link the existing contact.
 *   2. `contacts.phone` fallback → attach the new social identity to that
 *      contact.
 *   3. Neither → create a contact + its identity row.
 *
 * Wave-1 seam: steps 1 and the identity insert in step 3 go through
 * `LeadIdentityStore`; the default store resolves them against a schema that
 * has no identity table yet — `findContactIdByIdentity` returns null and
 * `linkIdentity` is a no-op — so today's effective behavior is
 * phone-fallback → create/link. The DB-backed resolver lands with the table
 * without touching this orchestration.
 *
 * Never throws: lead linking is best-effort bookkeeping — a failure must not
 * fail webhook processing.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { contacts, conversations } from "@/db/schema";

import { normalizePhone } from "./phone";
import type { ChannelKind } from "./types";

export interface LeadIdentityInput {
  channel: ChannelKind;
  /** Raw provider identity (as stored on conversations.external_thread_id). */
  externalUserId: string;
  /** Canonical key — canonicalExternalUserId() output; the identity dedup key. */
  externalUserIdNormalized: string;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Reserved for the account-stamped schema; unused until the column lands. */
  channelAccountId: string | null;
  conversationId: string;
}

/**
 * Storage seam over lead/identity persistence. The default implementation
 * uses `contacts` + `conversations.customer_id`; identity-table reads and
 * writes are present in the contract so the parallel wave can back them with
 * `lead_identities` without changing callers.
 */
export interface LeadIdentityStore {
  /** `lead_identities(channel, externalId)` lookup — null until that table exists. */
  findContactIdByIdentity(
    channel: ChannelKind,
    externalId: string
  ): Promise<string | null>;
  /** Phone fallback: `contacts.phone` equality on the normalized number. */
  findContactIdByPhone(phone: string): Promise<string | null>;
  /** Create a contact shell for an unmatched identity; returns its id. */
  createContact(input: {
    name: string;
    phone: string | null;
    channel: ChannelKind;
    externalUserId: string;
  }): Promise<string>;
  /**
   * Point a conversation at a contact, coalesce-style: never overwrite an
   * existing `customer_id` (mirrors the source's "lead lacks one" guard).
   */
  linkConversationToContact(
    contactId: string,
    conversationId: string
  ): Promise<void>;
  /**
   * Record `(channel, externalId) → contactId`. Returns "inserted" when the
   * identity row was created, "conflict" when a concurrent insert won (the
   * caller then re-reads the winner and links it instead). The wave-1
   * default has no table — it reports "inserted" so the orchestration
   * completes the same way it will once the table exists.
   */
  linkIdentity(
    contactId: string,
    channel: ChannelKind,
    externalId: string
  ): Promise<"inserted" | "conflict">;
  /**
   * Re-resolve an identity after a link conflict — the winning contact id.
   * Wave-1 default mirrors findContactIdByIdentity (always null today).
   */
  resolveIdentityWinner(
    channel: ChannelKind,
    externalId: string
  ): Promise<string | null>;
}

export const contactsLeadIdentityStore: LeadIdentityStore = {
  async findContactIdByIdentity() {
    // lead_identities does not exist in this schema wave — nothing to match.
    return null;
  },

  async findContactIdByPhone(phone) {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.phone, phone))
      .limit(1);
    return row?.id ?? null;
  },

  async createContact(input) {
    const [created] = await db
      .insert(contacts)
      .values({
        name: input.name,
        phone: input.phone,
        notes: `Canal: ${input.channel} · Id externo: ${input.externalUserId}`,
      })
      .returning({ id: contacts.id });
    if (!created) throw new Error("contact insert returned no row");
    return created.id;
  },

  async linkConversationToContact(contactId, conversationId) {
    await db
      .update(conversations)
      .set({ customerId: sql`coalesce(${conversations.customerId}, ${contactId})` })
      .where(eq(conversations.id, conversationId));
  },

  async linkIdentity() {
    // No identity table yet — behave as if the row was written so callers get
    // the post-table flow shape. The parallel wave swaps this implementation.
    return "inserted";
  },

  async resolveIdentityWinner() {
    return null;
  },
};

export async function ensureLeadIdentity(
  input: LeadIdentityInput,
  store: LeadIdentityStore = contactsLeadIdentityStore
): Promise<void> {
  const { channel, externalUserIdNormalized: externalId } = input;
  try {
    // 1. Known identity → link its contact to this conversation if needed.
    const linkedContactId = await store.findContactIdByIdentity(channel, externalId);
    if (linkedContactId) {
      await store.linkConversationToContact(linkedContactId, input.conversationId);
      return;
    }

    // 2. Phone fallback → attach the social identity to that existing contact.
    const phone = input.customerPhone
      ? normalizePhone(input.customerPhone)
      : "";
    let contactId: string | null = null;
    if (phone) {
      contactId = await store.findContactIdByPhone(phone);
    }

    // 3. No match anywhere → create the contact shell for this identity.
    if (contactId == null) {
      contactId = await store.createContact({
        name: input.customerName ?? input.externalUserIdNormalized,
        phone: phone || null,
        channel,
        externalUserId: input.externalUserId,
      });
      console.log(`[leads] Created contact ${contactId} for ${channel} identity`);
    } else {
      await store.linkConversationToContact(contactId, input.conversationId);
    }

    const link = await store.linkIdentity(contactId, channel, externalId);
    if (link === "conflict") {
      // (channel, externalId) race: a concurrent inbound won the identity
      // row. Re-link to the winning contact so the conversation never orphans.
      // The source also drops a freshly-created phone-less shell; contacts has
      // no soft-delete and row cleanup is owned by the schema wave — the
      // duplicate shell simply remains unlinked here.
      const winnerId = await store.resolveIdentityWinner(channel, externalId);
      if (winnerId && winnerId !== contactId) {
        await store.linkConversationToContact(winnerId, input.conversationId);
      }
    }
  } catch (err) {
    console.warn(
      `[leads] ensureLeadIdentity failed for ${channel}:${externalId}:`,
      err
    );
  }
}
