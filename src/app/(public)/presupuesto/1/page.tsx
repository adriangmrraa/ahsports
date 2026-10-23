import { Step1Form } from "./Step1Form";
import { StepIndicator } from "../_components/StepIndicator";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 1 · AH Sports" };

/**
 * F4-08 — Paso 1: tipo de cliente + datos del contacto.
 *
 * R4-LOW-5 — the old `?type=returning&email=<x>` prefill queried `contacts`
 * and returned name + phone for any address typed in the URL (a PII oracle).
 * The prefill is gone; the "returning" toggle stays purely cosmetic and the
 * step never reads customer data from the query string.
 */
export default async function PresupuestoStep1({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; name?: string; phone?: string }>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const initialType = sp.type === "returning" ? "returning" : "new";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <StepIndicator current={1} />
      <h1 className="mb-6 mt-6 text-balance text-center text-xl font-bold tracking-tight sm:text-2xl">Pedí tu presupuesto</h1>
      <Step1Form initialType={initialType} />
    </div>
  );
}
