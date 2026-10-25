import Link from "next/link";
import { ArrowRight, Package, PackageSearch, SearchX, Shirt } from "lucide-react";
import { checkPublicGetRateLimit } from "@/lib/infra/public-rate-limit";
import { loadPublicCatalog } from "@/lib/public/catalog";
import { formatARS } from "@/lib/public/format";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { CatalogFilters } from "@/components/public/catalog-filters";

export const metadata = { title: "Catálogo · AH Sports" };
export const dynamic = "force-dynamic";

const SUBCATEGORY_ORDER = ["prendas", "conjuntos", "mochilas_infantiles", "bolsos", "insumos", "otros"];

/** Case- and accent-insensitive search so "camiseta" matches "Camiseta" and "pantalon" matches "Pantalón". */
function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  // G-02 — public GET limit, isolated bucket.
  const rate = await checkPublicGetRateLimit("public:catalogo", {
    limit: 30,
    bucketLimit: 300,
  });
  if (!rate.success) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Demasiadas solicitudes</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Probá de nuevo en un minuto.</p>
      </div>
    );
  }

  const { q = "", cat = "" } = await searchParams;
  const catalog = await loadPublicCatalog();

  const categoryValues = [...new Set(catalog.map((p) => p.productSubcategory))].sort(
    (a, b) => {
      const ia = SUBCATEGORY_ORDER.indexOf(a);
      const ib = SUBCATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    },
  );
  const categories = categoryValues.map((value) => ({ value, label: labelProductTaxonomy(value) }));

  const needle = normalizeSearch(q.trim());
  const filtered = catalog.filter((p) => {
    if (cat && p.productSubcategory !== cat) return false;
    if (!needle) return true;
    const haystack = normalizeSearch(`${p.name} ${p.description ?? ""} ${p.sku}`);
    return haystack.includes(needle);
  });

  const groups = new Map<string, typeof filtered>();
  for (const p of filtered) {
    const list = groups.get(p.productSubcategory) ?? [];
    list.push(p);
    groups.set(p.productSubcategory, list);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => {
    const ia = SUBCATEGORY_ORDER.indexOf(a);
    const ib = SUBCATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let cardIndex = 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-8 max-w-2xl animate-rise">
        <p className="label-caps mb-3 text-primary">Catálogo</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Todo lo que hacemos, listo para pedir.</h1>
        <p className="mt-4 text-base leading-7 text-on-surface-variant">
          Elegí un producto y arrancamos el presupuesto. Los precios publicados son por unidad; seña del 50% para iniciar producción.
        </p>
      </header>

      {catalog.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container px-6 py-16 text-center animate-rise">
          <PackageSearch className="h-10 w-10 text-on-surface-variant/60" strokeWidth={1.2} />
          <div>
            <h2 className="text-lg font-semibold">Todavía no hay productos publicados</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Estamos cargando el catálogo. Mientras tanto, podés contarnos qué necesitás.
            </p>
          </div>
          <Link
            href="/presupuesto"
            className="label-caps inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-on-primary transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Pedir presupuesto <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <>
          <CatalogFilters categories={categories} initialQ={q} initialCat={cat} />

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container px-6 py-14 text-center animate-rise">
              <SearchX className="h-9 w-9 text-on-surface-variant/60" strokeWidth={1.2} />
              <div>
                <h2 className="text-lg font-semibold">Sin resultados{q ? ` para “${q}”` : ""}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Probá con otra búsqueda o mirá todo el catálogo.</p>
              </div>
              <Link
                href="/catalogo"
                className="label-caps inline-flex min-h-11 items-center gap-2 rounded-md border border-outline-variant px-5 text-on-surface transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                Ver todo
              </Link>
            </div>
          ) : (
            orderedGroups.map(([subcategory, items]) => (
              <section key={subcategory} className="mb-12">
                <div className="mb-5 flex items-baseline justify-between gap-3 border-b border-outline-variant pb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                    {labelProductTaxonomy(subcategory)}
                  </h2>
                  <span className="data-mono text-xs text-on-surface-variant">
                    {items.length} {items.length === 1 ? "producto" : "productos"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => {
                    const delay = Math.min(cardIndex++, 11) * 40;
                    const priced = p.basePrice > 0;
                    const variable = priced && (p.minOrder > 1 || p.sizeCount > 1);
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
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-4">
                          <h3 className="text-base font-semibold leading-snug">{p.name}</h3>
                          {p.bundleLabel && (
                            <p className="text-xs text-on-surface-variant">{p.bundleLabel}</p>
                          )}
                          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                            <div className="min-w-0">
                              {priced ? (
                                <>
                                  <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                                    {variable ? "Desde" : "Por unidad"}
                                  </p>
                                  <p className="text-lg font-semibold leading-tight">{formatARS(p.basePrice)}</p>
                                  <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                                    {[
                                      p.minOrder > 1 ? `mín. ${p.minOrder} u.` : null,
                                      p.sizeCount > 0 ? `${p.sizeCount} talles` : null,
                                    ].filter(Boolean).join(" · ") || " "}
                                  </p>
                                </>
                              ) : (
                                <p className="text-sm font-medium text-on-surface-variant">Precio a consultar</p>
                              )}
                            </div>
                            <Link
                              href={`/presupuesto/1?productId=${p.id}`}
                              className="label-caps inline-flex shrink-0 items-center gap-1.5 rounded-md border border-outline-variant px-3 py-2 text-on-surface transition group-hover:border-primary group-hover:bg-primary group-hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
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
            ))
          )}
        </>
      )}

      <p className="text-center text-sm text-on-surface-variant">
        ¿No encontrás lo que buscás?{" "}
        <Link href="/presupuesto" className="font-medium text-primary underline-offset-4 hover:underline">
          Contanos en el presupuesto
        </Link>
      </p>
    </div>
  );
}
