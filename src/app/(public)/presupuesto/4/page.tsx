import { Step4Form } from "./Step4Form";
import { StepIndicator } from "../_components/StepIndicator";
import { WizardEstimateChip } from "../_components/wizard-estimate";
import { getPublicEstimate, resolveWizardSizeQuantities } from "@/lib/public/estimate";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 4 · AH Sports" };

/**
 * F4-11 — Paso 4: carga de archivos (escudos/logos/sponsors/planillas).
 * Server wrapper que pasa los params del flujo al form client y mantiene
 * visible el estimado del motor de pricing.
 */
export default async function PresupuestoStep4({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const estimate = sp.productId
    ? await getPublicEstimate({
        productId: sp.productId,
        sizeQuantities: await resolveWizardSizeQuantities({
          productId: sp.productId,
          sq: sp.sq,
          sizeQuantities: sp.sizeQuantities,
          total: Number(sp.total || 0),
        }),
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <StepIndicator current={4} />
      <h1 className="mb-2 mt-6 text-balance text-center text-xl font-bold tracking-tight sm:text-2xl">Cargá tus archivos</h1>
      <p className="mb-4 text-center text-sm text-on-surface-variant">
        Escudos, sponsors, logos o planillas (opcional). Mínimo 0, podés seguir sin archivos.
      </p>
      {sp.productId && <WizardEstimateChip estimate={estimate} />}
      <Step4Form initialParams={sp} />
    </div>
  );
}
