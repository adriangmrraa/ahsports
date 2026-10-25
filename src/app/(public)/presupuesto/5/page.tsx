import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products, sizes, fabrics, techniques } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getBusinessInfo } from "@/lib/business";
import { getPublicEstimate } from "@/lib/public/estimate";
import { Step5Form } from "./Step5Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import { WizardEstimateCard } from "../_components/wizard-estimate";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 5 · AH Sports" };

function parseLineItems(raw: string | undefined): { talle: string; name: string; number: string }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .filter(Boolean)
    .map((r) => {
      const [talle, name, number] = r.split("|");
      return { talle, name: name ?? "", number: number ?? "" };
    });
}

/**
 * F4-12 — Paso 5: confirmación + resumen + costo estimado.
 * Muestra el resumen del flujo y el desglose de precios del motor real;
 * el form confirma → createPublicOrder.
 */
export default async function PresupuestoStep5({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  if (!sp.productId || !sp.lineItems) redirect("/presupuesto/2");
  if (!sp.uploadSessionId || !sp.uploadSessionSecret) redirect("/presupuesto/4");

  const [product] = await db.select({ id: products.id, name: products.name, active: products.active, basePrice: products.basePrice }).from(products).where(eq(products.id, sp.productId)).limit(1);
  if (!product || !product.active) redirect("/presupuesto/2");
  const items = parseLineItems(sp.lineItems);
  const productSizes = await db.select({ id: sizes.id, label: sizes.label }).from(sizes).where(eq(sizes.productId, product.id));
  const sizeByLabel = new Map(productSizes.map((size) => [size.label, size.id]));
  const serializedItems = items.map((item) => ({ ...item, sizeId: sizeByLabel.get(item.talle) ?? null }));
  const quantities = new Map<string | null, number>();
  for (const item of serializedItems) {
    // Null-keyed entries ("Sin talle" on size-less products) must also count:
    // the schema requires ≥1 sizeQuantity and the draft validates totals.
    quantities.set(item.sizeId, (quantities.get(item.sizeId) ?? 0) + 1);
  }
  const sizeQuantities = Array.from(quantities, ([sizeId, quantity]) => ({ sizeId, quantity }));

  // Option picks flow as URL state; the engine re-validates them anyway.
  const fabricId = sp.fabricId ?? null;
  const methodIds = sp.methodIds?.split(",").filter(Boolean) ?? [];

  // Only quote when every line resolved to a real size (or the product has
  // none): a stray label would otherwise hit the generic recipe and lie.
  const estimable = productSizes.length === 0 || serializedItems.every((i) => i.sizeId !== null);
  const estimate = estimable
    ? await getPublicEstimate({ productId: product.id, sizeQuantities, fabricId, techniqueIds: methodIds })
    : null;

  // Names for the summary — resolved server-side so the summary stays right
  // even when the engine cannot produce an estimate.
  const optionNames: string[] = [];
  if (fabricId) {
    const [fabric] = await db.select({ name: fabrics.name }).from(fabrics).where(eq(fabrics.id, fabricId)).limit(1);
    if (fabric) optionNames.push(fabric.name);
  }
  if (methodIds.length > 0) {
    const methodRows = await db.select({ id: techniques.id, name: techniques.name }).from(techniques).where(inArray(techniques.id, methodIds));
    const nameById = new Map(methodRows.map((m) => [m.id, m.name]));
    for (const id of methodIds) {
      const name = nameById.get(id);
      if (name) optionNames.push(name);
    }
  }

  const contactInfo = {
    name: sp.name ?? "",
    email: sp.email ?? "",
    phone: sp.phone ?? "",
    org: sp.org ?? "",
  };
  const business = await getBusinessInfo();

  return (
    <>
      <PageHero
        crumb="Presupuesto"
        eyebrow="Paso 5 de 5 · Confirmación"
        title={
          <>
            Confirmá tu <span className="text-accent">solicitud.</span>
          </>
        }
        lead="Revisá el resumen y el estimado. Al confirmar, tu pedido queda cargado y te llevás el link de seguimiento."
      >
        <StepIndicator current={5} />
      </PageHero>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <WizardEstimateCard estimate={estimate} referencePrice={product.basePrice} />
        <Step5Form
        productName={product.name}
        fabricId={fabricId}
        methodIds={methodIds}
        optionNames={optionNames}
        items={serializedItems}
        total={items.length}
        sizeQuantities={sizeQuantities}
        contactInfo={contactInfo}
        type={(sp.type as "new" | "returning") ?? "new"}
        notes={sp.notes}
        fileIds={sp.files ? sp.files.split(",").filter(Boolean) : undefined}
        uploadSessionId={sp.uploadSessionId}
        uploadSessionSecret={sp.uploadSessionSecret}
        whatsappPhone={business.whatsappPhone}
        backHref={`/presupuesto/4?${new URLSearchParams(sp as Record<string, string>).toString()}`}
        />
      </div>
    </>
  );
}
