import "server-only";

import { TimerOff } from "lucide-react";
import { checkPublicGetRateLimit } from "@/lib/infra/public-rate-limit";

/**
 * G-02 — shared per-IP limit for the public wizard GET pages. All five steps
 * land in the same `public:presupuesto` bucket, so traversing the flow never
 * looks like a flood while repeated probing of any step still hits the limit.
 */
export async function wizardRateLimitReached(): Promise<boolean> {
  const rate = await checkPublicGetRateLimit("public:presupuesto", {
    limit: 30,
    bucketLimit: 300,
  });
  return !rate.success;
}

export function WizardRateLimitNotice() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-700">
        <TimerOff className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Demasiadas solicitudes</h1>
      <p className="text-sm text-on-surface-variant">Probá de nuevo en un minuto.</p>
    </div>
  );
}
