import "server-only";

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
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Demasiadas solicitudes</h1>
      <p className="mt-2 text-sm text-on-surface-variant">Probá de nuevo en un minuto.</p>
    </div>
  );
}
