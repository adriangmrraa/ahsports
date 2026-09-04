import { Step4Form } from "./Step4Form";
import { StepIndicator } from "../_components/StepIndicator";

export const metadata = { title: "Presupuesto · Paso 4 · AH Sports" };

/**
 * F4-11 — Paso 4: carga de archivos (escudos/logos/sponsors/planillas).
 * Server wrapper que pasa los params del flujo al form client.
 */
export default async function PresupuestoStep4({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <div className="px-4 py-10">
      <StepIndicator current={4} />
      <h1 className="mb-2 mt-6 text-center text-2xl font-bold tracking-tight">Cargá tus archivos</h1>
      <p className="mb-6 text-center text-sm text-on-surface-variant">
        Escudos, sponsors, logos o planillas (opcional). Mínimo 0, podés seguir sin archivos.
      </p>
      <Step4Form initialParams={sp} />
    </div>
  );
}