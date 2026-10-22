import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { channelAccounts, conversations } from "@/db/schema";

import { resolveChannelAccountByIdStrict } from "./accounts";
import { isRetryableDbError, isSchemaNotReady } from "./errors";
import { isChannelKind, isProviderId } from "./registry";
import type { Channel, ChannelAccount } from "./types";

/**
 * Send-account decision for thread-addressed outbound sends.
 *
 * Used by reply/cron/admin send paths so they agree on the fail-closed rules:
 * bound conversation → its account; unbound → exactly one active account;
 * ambiguous/not-found/unresolvable → drop; transient lookup errors → retry.
 * A legacy send (no account) is allowed ONLY when the channel is genuinely
 * unprovisioned or the schema is positively not ready.
 */

export type BoundAccountResolution =
  | { kind: "resolved"; account: ChannelAccount; conversationId: string }
  | { kind: "unbound" }
  | { kind: "ambiguous"; accountIds: string[] }
  | { kind: "unresolvable"; accountId: string; reason: string }
  | { kind: "error"; retryable: boolean; error: unknown };

export type DefaultAccountResolution =
  | { kind: "resolved"; account: ChannelAccount }
  | { kind: "unprovisioned" }
  | { kind: "not-found"; reason: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "db-error"; error: unknown };

export type SendAccountDecision =
  | {
      kind: "send";
      account?: ChannelAccount;
      conversationId?: string;
      channelAccountId: string | null;
    }
  | { kind: "retry"; reason: string; error?: unknown }
  | { kind: "drop"; reason: string };

/**
 * Resolves the account a conversation is bound to, if any. The conversation
 * is addressed by (channel, externalThreadId): a bound account never adopts a
 * legacy NULL-account row, and a row bound to a foreign account is never
 * served back as a fallback.
 */
export async function resolveConversationAccountBinding(
  channel: Channel,
  externalThreadId: string
): Promise<BoundAccountResolution> {
  let rows: { id: string; channelAccountId: string | null }[];
  try {
    rows = await db
      .select({
        id: conversations.id,
        channelAccountId: conversations.channelAccountId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.channel, channel),
          eq(conversations.externalThreadId, externalThreadId),
          isNotNull(conversations.channelAccountId)
        )
      );
  } catch (error) {
    if (isSchemaNotReady(error)) {
      // Scope columns absent: this install only knows legacy conversations.
      return { kind: "unbound" };
    }
    return { kind: "error", retryable: isRetryableDbError(error), error };
  }

  if (rows.length === 0) return { kind: "unbound" };
  if (rows.length > 1) {
    return {
      kind: "ambiguous",
      accountIds: rows.map((row) => row.channelAccountId as string),
    };
  }

  const row = rows[0];
  const resolution = await resolveChannelAccountByIdStrict(
    row.channelAccountId as string
  );
  switch (resolution.kind) {
    case "resolved":
      return {
        kind: "resolved",
        account: resolution.account,
        conversationId: row.id,
      };
    case "db-error":
      return { kind: "error", retryable: true, error: resolution.error };
    default:
      return {
        kind: "unresolvable",
        accountId: row.channelAccountId as string,
        reason:
          resolution.kind === "mismatch"
            ? resolution.reason
            : resolution.kind,
      };
  }
}

/**
 * The channel's implicit account: valid only when the channel provisions
 * EXACTLY one active account. Zero rows → unprovisioned legacy install; rows
 * but none active → not-found; several → ambiguous. Never guesses.
 */
export async function resolveDefaultChannelAccount(
  channel: Channel
): Promise<DefaultAccountResolution> {
  let rows: typeof channelAccounts.$inferSelect[];
  try {
    rows = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.channel, channel));
  } catch (error) {
    if (isSchemaNotReady(error)) return { kind: "unprovisioned" };
    return { kind: "db-error", error };
  }

  if (rows.length === 0) return { kind: "unprovisioned" };

  const active = rows.filter(
    (row) =>
      row.status === "active" &&
      isProviderId(row.provider) &&
      isChannelKind(row.channel)
  );
  if (active.length === 0) {
    return {
      kind: "not-found",
      reason: "provisioned channel has no active account",
    };
  }
  if (active.length > 1) {
    return {
      kind: "ambiguous",
      reason: "multiple active accounts and no binding",
    };
  }

  const resolution = await resolveChannelAccountByIdStrict(active[0].id);
  switch (resolution.kind) {
    case "resolved":
      return { kind: "resolved", account: resolution.account };
    case "db-error":
      return { kind: "db-error", error: resolution.error };
    default:
      return {
        kind: "not-found",
        reason:
          resolution.kind === "mismatch"
            ? resolution.reason
            : resolution.kind,
      };
  }
}

export interface SendAccountDeps {
  resolveBinding(
    channel: Channel,
    externalThreadId: string
  ): Promise<BoundAccountResolution>;
  resolveDefaultAccount(channel: Channel): Promise<DefaultAccountResolution>;
}

const defaultDeps: SendAccountDeps = {
  resolveBinding: resolveConversationAccountBinding,
  resolveDefaultAccount: resolveDefaultChannelAccount,
};

/**
 * Decides which account (if any) may send to a thread. Returns a typed
 * decision — the caller either sends through the account, retries later, or
 * drops the send. A `send` without `account` is the legacy env path and only
 * ever happens on a genuinely unprovisioned install.
 */
export async function decideSendAccount(
  channel: Channel,
  externalThreadId: string,
  deps: SendAccountDeps = defaultDeps
): Promise<SendAccountDecision> {
  const binding = await deps.resolveBinding(channel, externalThreadId);
  switch (binding.kind) {
    case "error":
      return binding.retryable
        ? { kind: "retry", reason: "binding lookup failed", error: binding.error }
        : { kind: "drop", reason: "binding lookup failed (permanent)" };
    case "ambiguous":
      return {
        kind: "drop",
        reason: `thread is bound to multiple accounts (${binding.accountIds.join(", ")})`,
      };
    case "unresolvable":
      return {
        kind: "drop",
        reason: `channel account '${binding.accountId}' is not resolvable (${binding.reason})`,
      };
    case "resolved":
      return {
        kind: "send",
        account: binding.account,
        conversationId: binding.conversationId,
        channelAccountId: binding.account.id,
      };
    case "unbound":
      break;
  }

  const fallback = await deps.resolveDefaultAccount(channel);
  switch (fallback.kind) {
    case "resolved":
      return {
        kind: "send",
        account: fallback.account,
        channelAccountId: fallback.account.id,
      };
    case "unprovisioned":
      // Genuine legacy install: no account exists to choose.
      return { kind: "send", channelAccountId: null };
    case "db-error":
      return { kind: "retry", reason: "default account lookup failed", error: fallback.error };
    case "ambiguous":
      return {
        kind: "drop",
        reason: `multiple active accounts and no binding (${fallback.reason})`,
      };
    case "not-found":
      return {
        kind: "drop",
        reason: `provisioned channel has no active account (${fallback.reason})`,
      };
  }
}
