/**
 * Postgres 23505 (unique_violation) — neon-http surfaces it on `code`, but
 * match the message too so wrapped errors still classify correctly.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /23505|duplicate key|unique constraint/i.test(message);
}
