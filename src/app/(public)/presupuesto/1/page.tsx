import { Step1Form } from "./Step1Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import { resolveWizardDraft } from "../_components/wizard-draft";
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
 * The prefill stays server-side now: flow state lives on the configurator
 * draft (`?d=`), never on the query string.
 */
export default async function PresupuestoStep1({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const { token, payload } = await resolveWizardDraft(1, sp);

  return (
    <>
      <PageHero
        crumb="Presupuesto"
        eyebrow="Paso 1 de 5 · Contacto"
        title={
          <>
            Pedí tu <span className="text-accent">presupuesto.</span>
          </>
        }
        lead="Contanos quién sos y para quién es el pedido. Después elegís producto, talles, diseño y archivos."
      >
        <StepIndicator current={1} />
      </PageHero>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Step1Form
          draftToken={token}
          initialType={payload.type === "returning" ? "returning" : "new"}
          initial={{
            name: payload.name ?? "",
            email: payload.email ?? "",
            phone: payload.phone ?? "",
            organizationName: payload.organizationName ?? "",
            notes: payload.notes ?? "",
          }}
        />
      </div>
    </>
  );
}
