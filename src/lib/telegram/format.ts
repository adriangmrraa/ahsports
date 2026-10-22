/**
 * es-AR formatting helpers for the Telegram operator bot.
 *
 * All money is decimal-string safe: numeric columns arrive as strings and are
 * formatted through integer cents, never floats. Dates render in the
 * America/Argentina/Buenos_Aires timezone, matching the factory's locale.
 */

export const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "$1.234,56" — accepts numeric strings ("1234.56") or plain numbers. */
export function formatMoneyAr(value: string | number | null | undefined): string {
  if (value == null) return moneyFormatter.format(0);
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return moneyFormatter.format(0);
  return moneyFormatter.format(num);
}

export function formatDateAr(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormatter.format(date);
}

export function formatDateTimeAr(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateTimeFormatter.format(date);
}

/**
 * UTC bounds [from, to) of the Argentina calendar day containing `now`.
 * Used by "hoy"-style queries so the day boundary is AR-local, not UTC.
 */
export function arDayRange(now: Date = new Date()): { from: Date; to: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  // Argentina is permanently UTC-3: local midnight == 03:00 UTC.
  const from = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Compact masked display for a phone-like value: keeps the last 4 digits.
 * Used for broadcast previews; operator chats may see full numbers through
 * the contact tools — the mask exists so mass previews stay compact.
 */
export function maskTail(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "····";
  return `···${digits.slice(-4)}`;
}
