/**
 * Next.js instrumentation hook (App Router, stable since Next 15 — no flag
 * needed). `register()` runs once per Node.js server process at startup.
 *
 * A-02 durable inbound queue — SECONDARY drain trigger. The primary trigger
 * lives in the inbound pipeline itself (`handleNormalizedEvent` kicks a
 * throttled drain on every webhook, so any live traffic self-heals). This
 * hook covers what the pipeline trigger cannot:
 *
 *  1. Startup drain — jobs left `queued`/`running` by the previous process
 *     (deploy, crash) are claimed and dispatched immediately on boot.
 *  2. Periodic sweep — a slow interval re-drains so orphaned work still
 *     resolves when inbound webhooks go quiet (e.g. provider redelivery
 *     never arrived).
 *
 * Both are fire-and-forget, and both are no-ops on un-migrated installs — the
 * queue layer swallows SQLSTATE 42P01 and warns once.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { drainPendingInboundTurns } = await import(
    "@/lib/messaging/inbound-pipeline"
  );

  const sweep = () =>
    drainPendingInboundTurns().catch((err) =>
      console.error("[instrumentation] inbound queue drain failed:", err)
    );

  void sweep();

  const timer = setInterval(sweep, 120_000);
  timer.unref();
}
