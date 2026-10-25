import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Step3Form } from "./Step3Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import { WizardEstimateChip } from "../_components/wizard-estimate";
import { getPublicEstimate, resolveWizardSizeQuantities } from "@/lib/public/estimate";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 3 · AH Sports" };

/** Parsea 'S:2,M:3' → [{label:'S',qty:2}] */
function parseSizes(raw: string | undefined): { label: string; qty: number }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => {
      const [label, q] = x.split(":");
      return { label, qty: Number(q || 0) };
    })
    .filter((x) => x.qty > 0);
}

/**
 * F4-10 — Paso 3: personalizaciones individuales (nombre/número por prenda).
 * Server component: lee productId/total del paso 2, deja que el form genere
 * filas y muestra el estimado del motor de pricing cuando puede cotizar.
 */
export default async function PresupuestoStep3({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; sizeQuantities?: string; sq?: string; total?: string }>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  if (!sp.productId) redirect("/presupuesto/2");

  const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, sp.productId)).limit(1);
  if (!product) redirect("/presupuesto/2");

  const sizes = parseSizes(sp.sizeQuantities);
  const total = Number(sp.total || sizes.reduce((a, s) => a + s.qty, 0)) || 0;

  const quantities = await resolveWizardSizeQuantities({
    productId: sp.productId,
    sq: sp.sq,
    sizeQuantities: sp.sizeQuantities,
    total,
  });
  const estimate = await getPublicEstimate({ productId: sp.productId, sizeQuantities: quantities });

  return (
    <>
      <PageHero
        crumb="Presupuesto"
        eyebrow="Paso 3 de 5 · Personalización"
        title={
          <>
            Nombre y número <span className="text-accent">por prenda.</span>
          </>
        }
        lead={`${product.name} · ${total} ${total === 1 ? "prenda" : "prendas"} — completá solo lo que necesites, todo es opcional.`}
      >
        <StepIndicator current={3} />
        <WizardEstimateChip estimate={estimate} />
      </PageHero>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Step3Form productName={product.name} sizes={sizes} total={total} noSize={sizes.length === 0} />
      </div>
    </>
  );
}
