import type { ConversationCursor, ConversationListItem } from "@/lib/agent/inbox";
import { channelValues, type Channel } from "@/lib/channels/types";

/**
 * Filter + presentation helpers for /admin/agent/inbox.
 *
 * Pure module — no server-only imports — so both the server page and the
 * client table share the same URL-param normalization and label maps. The
 * channel set is the full DB enum (whatsapp, telegram, instagram, facebook,
 * sms, reddit); `@/lib/agent/inbox-labels` still only covers the legacy pair.
 */

export const INBOX_CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook: "Facebook",
  sms: "SMS",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
  pinterest: "Pinterest",
  discord: "Discord",
  slack: "Slack",
};

/** Badge tone per channel — telegram keeps its pre-scope color. */
export function channelBadgeTone(
  channel: string,
): "primary" | "secondary" | "tertiary" | "success" | "warning" | "muted" {
  switch (channel) {
    case "telegram":
      return "primary";
    case "whatsapp":
      return "success";
    case "instagram":
      return "tertiary";
    case "facebook":
      return "secondary";
    case "sms":
      return "warning";
    default:
      return "muted";
  }
}

/** Undefined = no channel filter. Malformed values never reach SQL. */
export function normalizeChannelParam(raw: string | undefined): Channel | undefined {
  return raw && (channelValues as readonly string[]).includes(raw)
    ? (raw as Channel)
    : undefined;
}

export type InboxAccountFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "id"; id: string };

/**
 * `account` URL param: absent/"all" = every account; "unassigned" = legacy
 * conversations with `channel_account_id IS NULL`; otherwise the raw
 * channel_accounts UUID (validated, never coerced).
 */
export function normalizeAccountParam(raw: string | undefined): InboxAccountFilter {
  if (!raw || raw === "all") return { kind: "all" };
  if (raw === "unassigned") return { kind: "unassigned" };
  const id = raw.trim();
  return id.length > 0 && id.length <= 36 ? { kind: "id", id } : { kind: "all" };
}

export interface InboxAccountOption {
  id: string;
  channel: string;
  provider: string;
  senderAddress: string;
  displayName: string | null;
  status: string;
}

export function accountOptionLabel(account: InboxAccountOption): string {
  const name = account.displayName || account.senderAddress;
  return `${name} (${INBOX_CHANNEL_LABEL[account.channel] ?? account.channel} · ${account.provider})`;
}

export type InboxConversationItem = ConversationListItem & {
  channelAccountId: string | null;
  /** displayName ?? senderAddress of the bound account; null when unassigned. */
  accountLabel: string | null;
  accountProvider: string | null;
};

export type InboxConversationPage = {
  items: InboxConversationItem[];
  nextCursor: ConversationCursor | null;
};
