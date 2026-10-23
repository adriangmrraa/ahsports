import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, settings } from "@/db/schema";

/**
 * WhatsApp 24h customer-service window (F-02).
 *
 * Meta only accepts free-form text within 24 hours of the customer's last
 * inbound message. Outside that window the only deliverable message is an
 * approved template. This module is the single send-decision seam for that
 * rule:
 *
 * - inside the window → normal text reply;
 * - outside → template from the `wa_template_fallback` settings key;
 * - outside with no template configured → keep the text send (the caller may
 *   still attempt it) but report the decision truthfully so the delivery row
 *   and logs never pretend the window was handled.
 */

export const WHATSAPP_CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TEMPLATE_FALLBACK_SETTING_KEY = "wa_template_fallback";
export const DEFAULT_TEMPLATE_LANGUAGE = "es_AR";

export type TemplateFallback = { name: string; language: string };

export type WindowSendDecision =
  | { kind: "text"; windowOpen: true }
  | { kind: "text"; windowOpen: false; reason: "no_template" }
  | {
      kind: "template";
      template: TemplateFallback;
      lastInboundAt: Date | null;
    };

/** Latest customer-authored inbound for the conversation, or null. */
export async function lastCustomerInboundAt(
  conversationId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.direction, "inbound"),
        eq(chatMessages.senderKind, "customer"),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/** A thread without any customer inbound has no open window. */
export function isCustomerWindowOpen(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < WHATSAPP_CUSTOMER_WINDOW_MS;
}

function parseTemplateFallback(value: unknown): TemplateFallback | null {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name, language: DEFAULT_TEMPLATE_LANGUAGE } : null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return null;
    const language =
      typeof record.language === "string" && record.language.trim()
        ? record.language.trim()
        : DEFAULT_TEMPLATE_LANGUAGE;
    return { name, language };
  }
  return null;
}

/**
 * Reads the configured fallback template. Supports a plain string
 * (`"order_update"`, default language) or `{ name, language }`. Any read
 * failure degrades to "not configured" — a settings hiccup must never break
 * the reply path.
 */
export async function resolveTemplateFallback(): Promise<TemplateFallback | null> {
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, TEMPLATE_FALLBACK_SETTING_KEY))
      .limit(1);
    return row ? parseTemplateFallback(row.value) : null;
  } catch {
    return null;
  }
}

/**
 * Decides how a customer-facing reply may be sent. Outside the window the
 * caller routes the reply through `messenger.sendTemplate` when a template is
 * configured; otherwise it keeps the text send and records the honest
 * `no_template` outcome.
 */
export async function decideCustomerWindowSend(
  conversationId: string,
  now: Date = new Date(),
): Promise<WindowSendDecision> {
  const lastInbound = await lastCustomerInboundAt(conversationId);
  if (isCustomerWindowOpen(lastInbound, now)) {
    return { kind: "text", windowOpen: true };
  }
  const template = await resolveTemplateFallback();
  if (template) {
    return { kind: "template", template, lastInboundAt: lastInbound };
  }
  return { kind: "text", windowOpen: false, reason: "no_template" };
}
