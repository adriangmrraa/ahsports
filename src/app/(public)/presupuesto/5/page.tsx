import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { attachments, products, sizes, fabrics, techniques } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getBusinessInfo } from "@/lib/business";
import { getPublicEstimate } from "@/lib/public/estimate";
import { Step5Form } from "./Step5Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import { WizardEstimateCard } from "../_components/wizard-estimate";
import { resolveWizardDraft } from "../_components/wizard-draft";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 5 · AH Sports" };

/**
 * F4-12 — Paso 5: confirmación + resumen + costo estimado.
 * Todo el estado se lee del draft (`?d=`): PII, talles, personalización y el
 * diseño 3D quedan server-side; el submit solo manda el bearer token.
 */
export default async function PresupuestoStep5({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const { token, payload, items } = await resolveWizardDraft(5, sp);
  const backTo = (step: number) => `/presupuesto/${step}?d=${encodeURIComponent(token)}`;

  if (!payload.name || !payload.email || !payload.phone) redirect(backTo(1));
  if (!payload.productId) redirect(backTo(2));
  if (!payload.lineItems || payload.lineItems.length === 0) redirect(backTo(3));

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      active: products.active,
      basePrice: products.basePrice,
      garmentFamily: products.garmentFamily,
      garmentType: products.garmentType,
      productType: products.productType,
      productKind: products.productKind,
    })
    .from(products)
    .where(eq(products.id, payload.productId))
    .limit(1);
  if (!product || !product.active) redirect(backTo(2));

  // Labels for the summary list — draft lineItems carry sizeLabel already but
  // we re-resolve so a label rename mid-flow still shows the live catalog.
  const lineItems = payload.lineItems;
  const sizeIds = lineItems.map((i) => i.sizeId).filter((x): x is string => Boolean(x));
  const sizeRows = sizeIds.length > 0
    ? await db.select({ id: sizes.id, label: sizes.label }).from(sizes).where(inArray(sizes.id, sizeIds))
    : [];
  const labelById = new Map(sizeRows.map((s) => [s.id, s.label]));
  const displayItems = lineItems.map((item) => ({
    talle: (item.sizeId ? labelById.get(item.sizeId) : undefined) ?? item.sizeLabel ?? "Sin talle",
    name: item.individualName ?? "",
    number: item.individualNumber ?? "",
  }));

  const quantities = (payload.sizeQuantities ?? []).filter((s) => s.quantity > 0);
  if (quantities.length === 0) {
    // Legacy drafts may carry quantities only inside lineItems.
    const bySize = new Map<string | null, number>();
    for (const item of lineItems) bySize.set(item.sizeId, (bySize.get(item.sizeId) ?? 0) + 1);
    quantities.push(...Array.from(bySize, ([sizeId, quantity]) => ({ sizeId, quantity })));
  }

  const fabricId = payload.fabricId ?? null;
  const methodIds = payload.techniqueIds ?? [];
  const estimate = await getPublicEstimate({
    productId: product.id,
    sizeQuantities: quantities,
    fabricId,
    techniqueIds: methodIds,
  });

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

  // Design summary: the current revision config of the priced product.
  const item = items.find((i) => i.productId === product.id) ?? items[0] ?? null;
  const designFabricId = item?.config.fabricId ?? fabricId;
  let designFabricName: string | null = null;
  if (designFabricId) {
    const [fabric] = await db.select({ name: fabrics.name }).from(fabrics).where(eq(fabrics.id, designFabricId)).limit(1);
    designFabricName = fabric?.name ?? null;
  }

  // Placements reference attachments by id — resolve their public URLs so the
  // summary viewer draws the same decals the user designed in step 4.
  const assetRefs = (item?.config.placements ?? [])
    .map((p) => p.assetRef)
    .filter((x): x is string => Boolean(x));
  const assetRows = assetRefs.length > 0
    ? await db
        .select({ id: attachments.id, url: attachments.url })
        .from(attachments)
        .where(and(inArray(attachments.id, assetRefs), isNull(attachments.deletedAt)))
    : [];
  const assetUrls = Object.fromEntries(assetRows.map((a) => [a.id, a.url]));

  const stagedFiles = payload.uploadSessionId
    ? await db
        .select({ id: attachments.id })
        .from(attachments)
        .where(
          and(
            eq(attachments.uploadSessionId, payload.uploadSessionId),
            isNull(attachments.orderId),
            isNull(attachments.deletedAt),
          ),
        )
    : [];

  const contactInfo = {
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    org: payload.organizationName ?? "",
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
          draftToken={token}
          productName={product.name}
          optionNames={optionNames}
          items={displayItems}
          total={displayItems.length}
          contactInfo={contactInfo}
          notes={payload.notes}
          fileCount={stagedFiles.length}
          whatsappPhone={business.whatsappPhone}
          backHref={backTo(4)}
          design={item ? {
            config: item.config,
            descriptor: {
              garmentFamily: product.garmentFamily,
              garmentType: product.garmentType,
              productType: product.productType,
              productKind: product.productKind,
            },
            fabricName: designFabricName,
            revisionNo: item.currentRevisionNo,
            assetUrls,
          } : null}
        />
      </div>
    </>
  );
}
