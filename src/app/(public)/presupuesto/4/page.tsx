import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { attachments, products } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Step4Designer } from "./Step4Designer";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import { WizardEstimateChip } from "../_components/wizard-estimate";
import { resolveWizardDraft } from "../_components/wizard-draft";
import { getPublicEstimate } from "@/lib/public/estimate";
import { listFabricVisualProfiles } from "@/lib/configurator/drafts";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 4 · AH Sports" };

/**
 * F4-11 — Paso 4: diseño 3D + archivos. Mismo GarmentConfigurator que la home,
 * bloqueado al producto cotizado en el paso 2; el estado vive en el draft y
 * los adjuntos quedan reclamados al confirmar — el secreto de upload jamás
 * sale del sessionStorage del navegador.
 */
export default async function PresupuestoStep4({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const { token, payload, items } = await resolveWizardDraft(4, sp);
  if (!payload.productId) redirect(`/presupuesto/2?d=${encodeURIComponent(token)}`);

  const [productRows, fabricProfiles] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        garmentFamily: products.garmentFamily,
        garmentType: products.garmentType,
        productType: products.productType,
        productKind: products.productKind,
        zones: products.zones,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.name)),
    listFabricVisualProfiles(),
  ]);

  const product = productRows.find((p) => p.id === payload.productId);
  if (!product) redirect(`/presupuesto/2?d=${encodeURIComponent(token)}`);

  // Attachments already staged under this draft's upload session survive a
  // reload: they are listed server-side from the bound session id.
  const staged = payload.uploadSessionId
    ? await db
        .select({ id: attachments.id, url: attachments.url, name: attachments.name, kind: attachments.kind })
        .from(attachments)
        .where(
          and(
            eq(attachments.uploadSessionId, payload.uploadSessionId),
            isNull(attachments.orderId),
            isNull(attachments.deletedAt),
          ),
        )
    : [];

  const item = items.find((i) => i.productId === product.id);
  const estimate = await getPublicEstimate({
    productId: product.id,
    sizeQuantities: (payload.sizeQuantities ?? []).filter((s) => s.quantity > 0),
    fabricId: payload.fabricId ?? null,
    techniqueIds: payload.techniqueIds ?? null,
  });

  return (
    <>
      <PageHero
        crumb="Presupuesto"
        eyebrow="Paso 4 de 5 · Diseño"
        title={
          <>
            Diseñá tu <span className="text-accent">prenda.</span>
          </>
        }
        lead="Colores, tela, cuello, mangas y archivos. Todo lo que elijas queda guardado en tu diseño."
      >
        <StepIndicator current={4} />
        <WizardEstimateChip estimate={estimate} />
      </PageHero>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <Step4Designer
          draftToken={token}
          products={productRows}
          fabrics={fabricProfiles}
          lockProductId={product.id}
          productName={product.name}
          initialConfig={item?.config ?? { fabricId: payload.fabricId ?? undefined }}
          initialAssets={staged}
        />
      </div>
    </>
  );
}
