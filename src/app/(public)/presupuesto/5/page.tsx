import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products, sizes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getBusinessInfo } from "@/lib/business";
import { getPublicEstimate } from "@/lib/public/estimate";
import { Step5Form } from "./Step5Form";
import { StepIndicator } from "../_components/StepIndicator";
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

  // Only quote when every line resolved to a real size (or the product has
  // none): a stray label would otherwise hit the generic recipe and lie.
  const estimable = productSizes.length === 0 || serializedItems.every((i) => i.sizeId !== null);
  const estimate = estimable ? await getPublicEstimate({ productId: product.id, sizeQuantities }) : null;

  const contactInfo = {
    name: sp.name ?? "",
    email: sp.email ?? "",
    phone: sp.phone ?? "",
    org: sp.org ?? "",
  };
  const business = await getBusinessInfo();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <StepIndicator current={5} />
      <h1 className="mb-6 mt-6 text-balance text-center text-xl font-bold tracking-tight sm:text-2xl">Confirmá tu solicitud</h1>
      <WizardEstimateCard estimate={estimate} referencePrice={product.basePrice} />
      <Step5Form
        productName={product.name}
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
  );
}
