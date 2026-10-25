import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products, sizes as sizesTable } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Step3Form } from "./Step3Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import { WizardEstimateChip } from "../_components/wizard-estimate";
import { resolveWizardDraft } from "../_components/wizard-draft";
import { getPublicEstimate } from "@/lib/public/estimate";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 3 · AH Sports" };

/**
 * F4-10 — Paso 3: personalizaciones individuales (nombre/número por prenda).
 * Server component: lee producto/talles del draft (`?d=`), deja que el form
 * genere filas y muestra el estimado del motor de pricing cuando puede cotizar.
 */
export default async function PresupuestoStep3({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const { token, payload, items } = await resolveWizardDraft(3, sp);
  if (!payload.productId) redirect(`/presupuesto/2?d=${encodeURIComponent(token)}`);

  const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, payload.productId)).limit(1);
  if (!product) redirect(`/presupuesto/2?d=${encodeURIComponent(token)}`);

  const quantities = (payload.sizeQuantities ?? []).filter((s) => s.quantity > 0);
  const sizeIds = quantities.map((s) => s.sizeId).filter((x): x is string => Boolean(x));
  const sizeRows = sizeIds.length > 0
    ? await db.select({ id: sizesTable.id, label: sizesTable.label }).from(sizesTable).where(inArray(sizesTable.id, sizeIds))
    : [];
  const labelById = new Map(sizeRows.map((s) => [s.id, s.label]));

  // Products without sizes send a single quantity with sizeId null.
  const noSize = quantities.every((s) => s.sizeId === null);
  const sizes = noSize
    ? []
    : quantities
        .map((s) => ({ id: s.sizeId, label: s.sizeId ? (labelById.get(s.sizeId) ?? "") : "", qty: s.quantity }))
        .filter((s) => s.label !== "");
  const total = quantities.reduce((a, s) => a + s.quantity, 0);
  if (total < 1) redirect(`/presupuesto/2?d=${encodeURIComponent(token)}`);

  const estimate = await getPublicEstimate({
    productId: payload.productId,
    sizeQuantities: quantities,
    fabricId: payload.fabricId ?? null,
    techniqueIds: payload.techniqueIds ?? null,
  });

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
        <Step3Form
          draftToken={token}
          productName={product.name}
          sizes={sizes}
          total={total}
          noSize={noSize}
          initialRows={payload.lineItems ?? []}
          hasSavedDesign={items.some((item) => item.productId === payload.productId)}
        />
      </div>
    </>
  );
}
