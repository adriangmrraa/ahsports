/**
 * Temporal context helpers for the AH Sports customer WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/temporal-context.ts`, adapted from the
 * food domain to the textile factory:
 *  - "order" here means a quote/order draft (`orders` rows in open statuses);
 *    AH drafts are durable commercial artifacts, so there is NO 4-hour
 *    auto-close — recency is measured in Argentina local days instead.
 *  - `planOrderCreation` returns `create` (never `auto_close_then_create`):
 *    the agent may NEVER mutate or close an order, so a stale draft is simply
 *    left alone and a fresh draft is created on explicit intent.
 *
 * All helpers are pure and unit-testable.
 */

export const ARGENTINA_TIMEZONE = "America/Argentina/Buenos_Aires";

export type TemporalHistoryEntry = {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  /** Canonical `chat_messages.id` — matches `BufferedMessage.messageId`. */
  messageId?: string;
  platformMessageId?: string;
};

export function toArgentinaDate(date: Date): Date {
  const s = date.toLocaleString("en-US", { timeZone: ARGENTINA_TIMEZONE });
  return new Date(s);
}

export function getArgentinaHour(date = new Date()): number {
  return toArgentinaDate(date).getHours();
}

export function formatArgentinaTimestamp(date: Date): string {
  const arg = toArgentinaDate(date);
  const dd = String(arg.getDate()).padStart(2, "0");
  const mm = String(arg.getMonth() + 1).padStart(2, "0");
  const hh = String(arg.getHours()).padStart(2, "0");
  const min = String(arg.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

export function dayKeyArgentina(date: Date): string {
  const arg = toArgentinaDate(date);
  return `${arg.getFullYear()}-${String(arg.getMonth() + 1).padStart(2, "0")}-${String(
    arg.getDate(),
  ).padStart(2, "0")}`;
}

export function isSameArgentinaDay(a: Date, b: Date): boolean {
  return dayKeyArgentina(a) === dayKeyArgentina(b);
}

export type SegmentedMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/**
 * Segments conversation history by Argentina day boundaries. When messages
 * span multiple days, injects a system message marking the boundary so the
 * model does not mix old purchase intents with the current turn.
 *
 * Previous-day messages are prefixed with [DD/MM HH:mm] so the model sees
 * they are historical context, not current requests.
 */
export function segmentHistoryByDay(entries: TemporalHistoryEntry[]): SegmentedMessage[] {
  const result: SegmentedMessage[] = [];
  const today = new Date();
  const todayKey = dayKeyArgentina(today);
  let lastDayKey = "";

  for (const entry of entries) {
    const entryDayKey = dayKeyArgentina(entry.createdAt);
    const isFromToday = entryDayKey === todayKey;

    if (entryDayKey !== lastDayKey && !isFromToday) {
      const arg = toArgentinaDate(entry.createdAt);
      const dayName = arg.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      result.push({
        role: "system",
        content: `── Mensajes del día ${dayName} (histórico, solo contexto) ──`,
      });
      lastDayKey = entryDayKey;
    }

    const timestamp = formatArgentinaTimestamp(entry.createdAt);
    const prefix = isFromToday ? "" : `[${timestamp}] `;
    result.push({ role: entry.role, content: prefix + entry.content });
  }

  return result;
}

export type OrderLike = {
  id: string;
  status: string;
  createdAt: Date | string;
};

/**
 * Statuses where an existing order row is still commercially open — a new
 * purchase intent should first ask "same order or a new one?" rather than
 * silently opening a second draft. Terminal rows (entregado, cancelado)
 * never block a fresh draft.
 */
export const OPEN_ORDER_STATUSES = [
  "borrador",
  "presupuesto_enviado",
  "aprobado",
  "seniado",
  "en_produccion",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "bloqueado_pago",
] as const;

export function isOpenOrderStatus(status: string | null | undefined): boolean {
  return status != null && (OPEN_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Draft-life evaluation — AH adaptation of SocialCRM's 4h lifecycle.
 * A textile draft does not expire after hours; an open order counts as
 * "recent" while it belongs to the current Argentina day. Anything older is
 * simply stale context (no auto-close, ever).
 */
export type OrderRecency = "none" | "recent" | "stale";

export function evaluateOrderRecency(input: {
  activeOrder: OrderLike | null | undefined;
  now?: Date;
}): OrderRecency {
  const order = input.activeOrder;
  if (!order) return "none";
  if (!isOpenOrderStatus(order.status)) return "none";
  const now = input.now ?? new Date();
  const createdAt = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
  if (!Number.isFinite(createdAt.getTime())) return "none";
  return isSameArgentinaDay(createdAt, now) ? "recent" : "stale";
}

export type OrderCreationPlan =
  | { kind: "keep_active"; orderId: string }
  | { kind: "create"; reason: "no_active_order" | "new_business_day" }
  | { kind: "blocked"; reason: string };

/** Keywords that signal the user is affirming an existing proposal. */
const AFFIRM_PATTERN =
  /(dale|bueno|ok|listo|va|anda|perfecto|sí|si|esos|ese|esa|así|adelante|de una|joya|genial)/i;

/** Keywords that signal negation/cancellation. */
const NEGATIVE_PATTERN =
  /(no|nada|cancel|nope|nah|paso|todavía no|todavia no|aún no|aun no)/i;

/** Keywords that signal a NEW purchase intent (fresh draft). */
const NEW_ORDER_PATTERN =
  /(quiero|dame|necesito|pedime|haceme|encarg|armame|armá|cotiz|presupuest|mandame|vendeme|traeme|pedir|pedido|encargo)/i;

/**
 * Determines whether the current text represents an affirmation of an
 * existing draft, a new draft request, or neither.
 */
export type TurnIntent = "affirm_existing" | "new_order" | "non_ordering";

export function classifyTurnIntent(text: string): TurnIntent {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length === 0) return "non_ordering";
  if (trimmed.length <= 3 && /^(si|sí|ok|va|no)$/i.test(trimmed)) {
    return trimmed === "no" ? "non_ordering" : "affirm_existing";
  }
  if (NEW_ORDER_PATTERN.test(trimmed)) return "new_order";
  if (AFFIRM_PATTERN.test(trimmed) && !NEGATIVE_PATTERN.test(trimmed)) return "affirm_existing";
  return "non_ordering";
}

/** Status-notification texts that a customer might reply to. */
const NOTIFICATION_PATTERN = /pedido\s*#?\s*\d+|order\s*#?\s*\d+|ah sports/i;

/**
 * The material guard for quote/order-draft creation, adapted to AH:
 * creates a draft ONLY on explicit commercial intent, never on greetings,
 * reactions, acknowledgements, or replies to status notifications.
 */
export function planOrderCreation(input: {
  activeOrder: OrderLike | null | undefined;
  text: string;
  replyToNotification?: boolean;
  notificationText?: string;
  now?: Date;
}): OrderCreationPlan {
  const text = (input.text ?? "").trim();
  const notificationText = input.notificationText ?? "";

  if (input.replyToNotification === true || NOTIFICATION_PATTERN.test(notificationText)) {
    return { kind: "blocked", reason: "customer_replied_to_notification" };
  }
  const intent = classifyTurnIntent(text);
  if (intent === "non_ordering") {
    return { kind: "blocked", reason: "non_ordering_turn" };
  }

  const recency = evaluateOrderRecency({
    activeOrder: input.activeOrder,
    now: input.now,
  });
  if (recency === "recent" && input.activeOrder) {
    return { kind: "keep_active", orderId: input.activeOrder.id };
  }
  if (recency === "stale") {
    return { kind: "create", reason: "new_business_day" };
  }
  return { kind: "create", reason: "no_active_order" };
}
