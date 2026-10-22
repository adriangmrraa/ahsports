/**
 * Shared phone-addressed send-account decision.
 * Port of SocialCRM `src/lib/messaging/send-account.ts`, adapted to AH:
 * `BoundAccountResolution`/`DefaultAccountResolution` are declared locally
 * (AH's `src/lib/channels/router.ts` doesn't own them yet — the parallel
 * channel-accounts wave provides the real resolvers) and all account /
 * conversation ids are `string`, matching AH's varchar uuid keys.
 *
 * Used by send paths so they agree on the fail-closed rules:
 * bound conversation → its account; unbound → exactly one active account;
 * ambiguous/not-found/unresolvable → drop; transient lookup errors → retry.
 * A legacy send (no account) is allowed ONLY when the channel is genuinely
 * unprovisioned or the schema is positively not ready.
 */

import type { ChannelAccount } from "./types";

export type BoundAccountResolution =
  /** No conversation, or conversation without a channel account binding. */
  | { kind: "unbound" }
  /** Conversation is bound and the account resolved cleanly. */
  | { kind: "resolved"; account: ChannelAccount; conversationId: string }
  /** Bound but missing/inactive/unregistered — callers must fail closed. */
  | { kind: "unresolvable"; accountId: string; reason: string }
  /** The same phone has conversations on several accounts — no safe sender. */
  | { kind: "ambiguous"; accountIds: string[] }
  /** Transient lookup failure — caller must surface a retryable error. */
  | { kind: "error"; error: unknown; retryable: boolean };

export type DefaultAccountResolution =
  | { kind: "unprovisioned" }
  | { kind: "resolved"; account: ChannelAccount }
  | { kind: "ambiguous"; reason: string }
  /** Rows exist but no active provider account — hard fail, not legacy. */
  | { kind: "not-found"; reason: string }
  | { kind: "db-error"; error: unknown };

export interface SendAccountDeps {
  resolveBinding(phone: string): Promise<BoundAccountResolution>;
  resolveDefaultAccount(): Promise<DefaultAccountResolution>;
}

export type SendAccountDecision =
  | {
      kind: "send";
      account?: ChannelAccount;
      conversationId?: string;
      channelAccountId: string | null;
    }
  | { kind: "retry"; reason: string; error?: unknown }
  | { kind: "drop"; reason: string };

/** Non-symbolic account row id (a real `channel_accounts` uuid), else null. */
function accountIdOf(account: ChannelAccount | undefined): string | null {
  if (!account) return null;
  const id = account.id;
  return id &&
    !id.startsWith("env:") &&
    !id.endsWith(":agent-config") &&
    !id.endsWith(":caller-resolved")
    ? id
    : null;
}

export async function decideSendAccount(
  phone: string,
  deps: SendAccountDeps
): Promise<SendAccountDecision> {
  const binding = await deps.resolveBinding(phone);
  switch (binding.kind) {
    case "error":
      return binding.retryable
        ? { kind: "retry", reason: "binding lookup failed", error: binding.error }
        : { kind: "drop", reason: "binding lookup failed (permanent)" };
    case "ambiguous":
      return {
        kind: "drop",
        reason: `phone is bound to multiple accounts (${binding.accountIds.join(", ")})`,
      };
    case "unresolvable":
      return {
        kind: "drop",
        reason: `channel account ${binding.accountId} is not resolvable (${binding.reason})`,
      };
    case "resolved":
      return {
        kind: "send",
        account: binding.account,
        conversationId: binding.conversationId,
        channelAccountId: accountIdOf(binding.account),
      };
    case "unbound":
      break;
  }

  const fallback = await deps.resolveDefaultAccount();
  switch (fallback.kind) {
    case "resolved":
      return {
        kind: "send",
        account: fallback.account,
        channelAccountId: accountIdOf(fallback.account),
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
