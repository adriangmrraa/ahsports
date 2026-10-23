"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, conversations } from "@/db/schema";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { queryMessagesPage, type MessagePage } from "@/lib/agent/inbox";
import { channelSchema } from "@/lib/channels/types";
import { sendOperatorReply } from "@/lib/channels/operator-send";
import {
  activateHumanOverride,
  deactivateHumanOverride,
} from "@/lib/whatsapp/human-handoff";
import {
  normalizeAccountParam,
  type InboxConversationPage,
} from "@/app/(admin)/admin/agent/inbox/filters";
import { queryInboxConversationsPage } from "@/app/(admin)/admin/agent/inbox/queries";

/**
 * G3 — paginated reads for the agent inbox.
 *
 * Thin, authorization-gated wrappers around the cursor queries: the client
 * components call these to fetch the next page as the operator scrolls. Every
 * call re-checks `requireAgentAdmin()`; authorization is never weakened.
 *
 * `channel` accepts the full channel enum; `account` is `all` (default),
 * `unassigned` (legacy rows with channel_account_id IS NULL) or a
 * channel_accounts UUID — normalized to a filter before SQL, never coerced.
 */

const isoDateTime = z.string().datetime();

const conversationsInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  channel: channelSchema.optional(),
  account: z.string().trim().max(64).optional(),
  cursor: z
    .object({ lastMessageAt: isoDateTime.nullable(), id: z.string().min(1).max(64) })
    .nullable()
    .optional(),
});

const messagesInputSchema = z.object({
  conversationId: z.string().min(1).max(64),
  cursor: z.object({ createdAt: isoDateTime, id: z.string().min(1).max(64) }).nullable().optional(),
});

export async function loadConversations(input: unknown): Promise<InboxConversationPage> {
  await requireAgentAdmin();
  const parsed = conversationsInputSchema.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  return queryInboxConversationsPage({
    q: parsed.data.q,
    channel: parsed.data.channel,
    account: normalizeAccountParam(parsed.data.account),
    cursor: parsed.data.cursor,
  });
}

export async function loadMessages(input: unknown): Promise<MessagePage> {
  await requireAgentAdmin();
  const parsed = messagesInputSchema.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  return queryMessagesPage(parsed.data);
}

// ─── Operator handoff (E-01/E-02/E-03) ───────────────────────────────────────

const sendReplySchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  // Provider payloads cap far above this; 4000 keeps a sane operator bound.
  text: z.string().trim().min(1).max(4000),
});

const toggleOverrideSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  enabled: z.boolean(),
});

const resolveHandoffSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
});

async function conversationExists(conversationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return row !== undefined;
}

async function auditHandoffAction(
  actorRef: string,
  action: string,
  conversationId: string,
  after: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditEvents).values({
    actorKind: "user",
    actorRef,
    action,
    entityType: "conversation",
    entityId: conversationId,
    payload: { after },
  });
}

/**
 * E-01 — sends an operator reply into the conversation's own channel/account.
 * The outbound fact is persisted before delivery (senderKind "operator",
 * delivery queued → sent/failed); the same row also feeds the pipeline's
 * operator-active suppression window.
 */
export async function sendReply(input: unknown) {
  const user = await requireAgentAdmin();
  const parsed = sendReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Datos inválidos" };

  const result = await sendOperatorReply({
    conversationId: parsed.data.conversationId,
    text: parsed.data.text,
    operatorRef: user.id,
  });
  if (!result.ok) {
    if (result.error === "conversation_not_found") {
      return { ok: false as const, error: "La conversación no existe." };
    }
    if (result.error === "persistence_failed") {
      return { ok: false as const, error: "No se pudo registrar el mensaje. Reintentá." };
    }
    return {
      ok: false as const,
      error: result.retryable
        ? "No se pudo enviar la respuesta. Reintentá en unos segundos."
        : "No se pudo enviar la respuesta por este canal.",
    };
  }

  revalidatePath(`/admin/agent/inbox/${parsed.data.conversationId}`);
  return { ok: true as const };
}

/**
 * E-02 — toggles the human-override marker on the conversation. Enabled =
 * operator takes the thread (agent suppressed up to 24h, same marker and TTL
 * the agent's `transferToHuman` writes); disabled = control returns to the
 * agent immediately.
 */
export async function toggleHumanOverride(input: unknown) {
  const user = await requireAgentAdmin();
  const parsed = toggleOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Datos inválidos" };
  const { conversationId, enabled } = parsed.data;

  if (!(await conversationExists(conversationId))) {
    return { ok: false as const, error: "La conversación no existe." };
  }

  if (enabled) {
    // Manual takeover has no agent episode — episode 0 + origin "operator"
    // keeps the marker honest about who wrote it.
    await activateHumanOverride(conversationId, 0, "operator");
  } else {
    await deactivateHumanOverride(conversationId);
  }
  await auditHandoffAction(
    user.id,
    enabled ? "whatsapp.handoff.override_enabled" : "whatsapp.handoff.override_cleared",
    conversationId,
    { enabled },
  );

  revalidatePath(`/admin/agent/inbox/${conversationId}`);
  return { ok: true as const, enabled };
}

/**
 * E-03 — resolves the handoff: clears the override marker immediately so the
 * agent resumes on the next inbound, without waiting for the 24h TTL.
 */
export async function resolveHandoff(input: unknown) {
  const user = await requireAgentAdmin();
  const parsed = resolveHandoffSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Datos inválidos" };
  const { conversationId } = parsed.data;

  if (!(await conversationExists(conversationId))) {
    return { ok: false as const, error: "La conversación no existe." };
  }

  await deactivateHumanOverride(conversationId);
  await auditHandoffAction(user.id, "whatsapp.handoff.resolved", conversationId, {
    resolved: true,
  });

  revalidatePath(`/admin/agent/inbox/${conversationId}`);
  return { ok: true as const };
}
