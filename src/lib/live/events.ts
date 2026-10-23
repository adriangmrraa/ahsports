/**
 * Wire protocol shared by the /api/events/* SSE endpoints and their client
 * subscribers. Pure module — no server-only imports — so route handlers,
 * hooks and components all see the same payload shapes.
 */

import type { ChatMessageItem } from "@/lib/agent/inbox";

export type { ChatMessageItem };

/**
 * Composite stream cursor `<isoTimestamp>~<rowId>`. `~` survives ISO-8601
 * punctuation and row ids never contain it. The same value is emitted as the
 * SSE `id:` field, so `Last-Event-ID` on reconnect resumes exactly.
 */
export function encodeStreamCursor(at: string | Date, id: string): string {
  const iso = at instanceof Date ? at.toISOString() : at;
  return `${iso}~${id}`;
}

export function parseStreamCursor(raw: string): { at: Date; id: string } | null {
  const sep = raw.lastIndexOf("~");
  if (sep <= 0 || sep === raw.length - 1) return null;
  const at = new Date(raw.slice(0, sep));
  if (Number.isNaN(at.getTime())) return null;
  return { at, id: raw.slice(sep + 1) };
}

/** Payload of /api/events/inbox — a conversation whose activity changed. */
export type InboxActivityEvent = {
  id: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
};

/** Payload of /api/events/orders — an order row updated since the cursor. */
export type OrderChangedEvent = {
  id: string;
  number: number;
  status: string;
  totalQuoted: string | number;
  notes: string | null;
  urgent: boolean;
  updatedAt: string;
};

/** Payload of /api/events/leads — a lead created since the cursor. */
export type LeadCreatedEvent = {
  id: string;
  status: string;
  channel: string | null;
  createdAt: string;
};
