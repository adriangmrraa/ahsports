import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { productBundleItems, productBundles, products, sizes } from "@/db/schema";
import { formatCurrency } from "@/lib/utils";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { ArrowRight, Package, Shirt } from "lucide-react";

export const metadata = { title: "Catálogo · AH Sports" };
export const dynamic = "force-dynamic";

const SUBCATEGORY_ORDER = ["prendas", "conjuntos", "mochilas_infantiles", "bolsos", "insumos", "otros"];

export default async function CatalogoPage() {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      imageUrl: products.imageUrl,
      basePrice: products.basePrice,
      minOrder: products.minOrder,
      productKind: products.productKind,
      productSubcategory: products.productSubcategory,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name));

  const sizeRows = await db
    .select({ productId: sizes.productId })
    .from(sizes)
    .where(inArray(sizes.productId, rows.map((p) => p.id)));
  const sizeCount = new Map<string, number>();
  for (const s of sizeRows) sizeCount.set(s.productId, (sizeCount.get(s.productId) ?? 0) + 1);

  const bundleRows = rows.filter((p) => p.productKind === "bundle");
  const bundleIds = bundleRows.map((p) => p.id);
  const bundleMap = new Map<string, string>();
  if (bundleIds.length > 0) {
    const bundles = await db
      .select({ id: productBundles.id, productId: productBundles.productId })
      .from(productBundles)
      .where(inArray(productBundles.productId, bundleIds));
    const items = await db
      .select({ bundleId: productBundleItems.bundleId, quantity: productBundleItems.quantity, name: products.name })
      .from(productBundleItems)
      .leftJoin(products, eq(products.id, productBundleItems.componentProductId))
      .where(inArray(productBundleItems.bundleId, bundles.map((b) => b.id)));
    const bundleByProduct = new Map(bundles.map((b) => [b.productId, b.id]));
    for (const p of bundleRows) {
      const bId = bundleByProduct.get(p.id);
      const names = items.filter((i) => i.bundleId === bId).map((i) => i.name).filter(Boolean) as string[];
      bundleMap.set(p.id, names.join(" + "));
    }
  }

  const groups = new Map<string, typeof rows>();
  for (const p of rows) {
    const key = p.productSubcategory || "otros";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => {
    const ia = SUBCATEGORY_ORDER.indexOf(a);
    const ib = SUBCATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let cardIndex = 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 max-w-2xl animate-rise">
        <p className="label-caps mb-3 text-primary">Catálogo</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Todo lo que hacemos, listo para pedir.</h1>
        <p className="mt-4 text-base leading-7 text-on-surface-variant">
          Elegí un producto y arrancamos el presupuesto. Los precios publicados son por pedido mínimo; seña del 50% para iniciar producción.
        </p>
      </header>

      {orderedGroups.map(([subcategory, items]) => (
        <section key={subcategory} className="mb-12">
          <h2 className="mb-5 border-b border-outline-variant pb-3 text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            {labelProductTaxonomy(subcategory)}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const delay = Math.min(cardIndex++, 11) * 40;
              const price = Number(p.basePrice);
              return (
                <article
                  key={p.id}
                  className="group flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container transition duration-300 hover:-translate-y-1 hover:border-outline hover:shadow-lg animate-rise"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container-high">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-on-surface-variant/60">
                        {p.productKind === "bundle" ? <Package className="h-10 w-10" strokeWidth={1.2} /> : <Shirt className="h-10 w-10" strokeWidth={1.2} />}
                      </div>
                    )}
                    {price > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-surface/85 px-3 py-1 text-xs font-semibold text-on-surface backdrop-blur">
                        {formatCurrency(p.basePrice)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="text-base font-semibold leading-snug">{p.name}</h3>
                    {bundleMap.get(p.id) && (
                      <p className="text-xs text-on-surface-variant">{bundleMap.get(p.id)}</p>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                      <div className="text-xs leading-5 text-on-surface-variant">
                        {price > 0 ? `Pedido mínimo ${p.minOrder}` : "Precio a consultar"}
                        {(sizeCount.get(p.id) ?? 0) > 0 && <><br />{sizeCount.get(p.id)} talles disponibles</>}
                      </div>
                      <Link
                        href={`/presupuesto/1?productId=${p.id}`}
                        className="label-caps inline-flex shrink-0 items-center gap-1.5 rounded-md border border-outline-variant px-3 py-2 text-on-surface transition group-hover:border-primary group-hover:bg-primary group-hover:text-on-primary"
                      >
                        Pedir <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-center text-sm text-on-surface-variant">
        ¿No encontrás lo que buscás?{" "}
        <Link href="/presupuesto" className="font-medium text-primary underline-offset-4 hover:underline">
          Contanos en el presupuesto
        </Link>
      </p>
    </div>
  );
}
