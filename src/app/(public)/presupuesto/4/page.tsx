import { Step4Form } from "./Step4Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
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
    <>
      <PageHero
        crumb="Presupuesto"
        eyebrow="Paso 4 de 5 · Archivos"
        title={
          <>
            Cargá tus <span className="text-accent">archivos.</span>
          </>
        }
        lead="Escudos, sponsors, logos o planillas (opcional). Podés seguir sin archivos — el diseño lo trabajamos juntos."
      >
        <StepIndicator current={4} />
        {sp.productId && <WizardEstimateChip estimate={estimate} />}
      </PageHero>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Step4Form initialParams={sp} />
      </div>
    </>
  );
}
