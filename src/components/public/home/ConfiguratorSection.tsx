import { db } from "@/db/client";
import { attachments, products } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getConfiguratorDraftByToken, listFabricVisualProfiles } from "@/lib/configurator/drafts";
import { loadBundleComponentDescriptors } from "@/lib/configurator/descriptors";
import { HomeConfigurator } from "./HomeConfigurator";

/**
 * Home configurator section — same GarmentConfigurator the wizard's step 4
 * uses, fed by the live catalog. When the URL carries `?d=` the section
 * resumes that draft (design + staged files) instead of starting blank.
 */
export async function ConfiguratorSection({ draftToken }: { draftToken?: string }) {
  const [productRows, fabricProfiles, resumed] = await Promise.all([
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
    draftToken ? getConfiguratorDraftByToken(draftToken) : Promise.resolve(null),
  ]);

  // Bundle composition: conjuntos render their real component garments.
  const componentMap = await loadBundleComponentDescriptors(productRows.map((p) => p.id));
  const productsWithComponents = productRows.map((p) => ({
    ...p,
    components: componentMap.get(p.id) ?? [],
  }));

  let initialProductId: string | null = null;
  let initialConfig = null;
  let staged: { id: string; url: string; name: string; kind: string }[] = [];
  if (resumed) {
    const item = resumed.items[0] ?? null;
    initialProductId = item?.productId ?? (resumed.draft.payload as { productId?: string }).productId ?? null;
    initialConfig = item?.normalizedConfig ?? null;
    const uploadSessionId = (resumed.draft.payload as { uploadSessionId?: string }).uploadSessionId;
    if (uploadSessionId) {
      staged = await db
        .select({ id: attachments.id, url: attachments.url, name: attachments.name, kind: attachments.kind })
        .from(attachments)
        .where(
          and(
            eq(attachments.uploadSessionId, uploadSessionId),
            isNull(attachments.orderId),
            isNull(attachments.deletedAt),
          ),
        );
    }
  }

  return (
    <section id="configurador" className="border-y border-navy-line bg-navy-950 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <p className="label-caps text-accent">Configurador 3D</p>
          <h2 className="font-display mt-3 text-3xl font-black tracking-tight text-on-navy sm:text-4xl">
            Diseñá tu prenda <span className="text-accent">en vivo.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-on-navy-variant">
            Elegí el producto, los colores y la tela. Cuando te guste, pedís presupuesto sin perder el diseño.
          </p>
        </div>
        <HomeConfigurator
          products={productsWithComponents}
          fabrics={fabricProfiles}
          draftToken={resumed ? draftToken! : null}
          initialProductId={initialProductId}
          initialConfig={initialConfig}
          initialAssets={staged}
        />
      </div>
    </section>
  );
}
