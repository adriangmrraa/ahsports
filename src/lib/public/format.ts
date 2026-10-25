const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/**
 * Public-facing ARS price, shared by catálogo, the /presupuesto wizard and
 * /seguimiento. Numeric columns come back from the driver as strings — both
 * shapes are accepted. Non-numeric input renders an em dash, never "NaN".
 */
export function formatARS(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return arsFormatter.format(n);
}
