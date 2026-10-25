import Link from "next/link";
import { ArrowRight, Package, PackageSearch, SearchX, Shirt, TimerOff } from "lucide-react";
import { checkPublicGetRateLimit } from "@/lib/infra/public-rate-limit";
import { loadPublicCatalog } from "@/lib/public/catalog";
import { formatARS } from "@/lib/public/format";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { CatalogFilters } from "@/components/public/catalog-filters";
import { PageHero } from "@/components/public/PageHero";

export const metadata = { title: "Catálogo · AH Sports" };
export const dynamic = "force-dynamic";

const SUBCATEGORY_ORDER = ["prendas", "conjuntos", "mochilas_infantiles", "bolsos", "insumos", "otros"];

/** Case- and accent-insensitive search so "camiseta" matches "Camiseta" and "pantalon" matches "Pantalón". */
function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Arte de placeholder para productos sin imagen: panel navy con stripes y la
 * inicial calada del producto (mismo tratamiento que el "10" del Hero).
 */
function ProductPlaceholder({ name, isBundle }: { name: string; isBundle: boolean }) {
  const Icon = isBundle ? Package : Shirt;
  return (
    <div className="texture-stripes relative flex h-full w-full items-center justify-center bg-navy-800">
      <span
        aria-hidden
        className="font-display text-8xl font-black uppercase leading-none text-transparent transition-transform duration-500 group-hover:scale-110"
        style={{ WebkitTextStroke: "2px var(--color-navy-500)" }}
      >
        {name.trim().charAt(0) || "A"}
      </span>
      <span className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-lg border border-navy-line bg-navy-900/80 text-accent">
        <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      </span>
    </div>
  );
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
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-700">
          <TimerOff className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Demasiadas solicitudes</h1>
        <p className="text-sm text-on-surface-variant">Probá de nuevo en un minuto.</p>
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
    <>
      <PageHero
        crumb="Catálogo"
        eyebrow="Catálogo AH Sports"
        title={
          <>
            Todo lo que hacemos, <span className="text-accent">listo para pedir.</span>
          </>
        }
        lead="Elegí un producto y arrancamos el presupuesto. Los precios publicados son por unidad; seña del 50% para iniciar producción."
      >
        <div className="mt-6 flex flex-wrap items-center gap-2 animate-fade-up" style={{ animationDelay: "140ms" }}>
          <span className="data-mono inline-flex items-center rounded-full border border-navy-line bg-navy-900/70 px-3 py-1.5 text-xs text-on-navy-variant">
            {catalog.length} {catalog.length === 1 ? "producto publicado" : "productos publicados"}
          </span>
          <span className="data-mono inline-flex items-center rounded-full border border-navy-line bg-navy-900/70 px-3 py-1.5 text-xs text-on-navy-variant">
            Precios por unidad · actualizados desde el taller
          </span>
        </div>
      </PageHero>

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {catalog.length === 0 ? (
          <div className="flex flex-col items-center gap-5 rounded-3xl border border-outline-variant bg-surface-container px-6 py-16 text-center animate-rise">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-100 text-navy-700">
              <PackageSearch className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-xl font-extrabold tracking-tight">Todavía no hay productos publicados</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-on-surface-variant">
                Estamos cargando el catálogo. Mientras tanto, podés contarnos qué necesitás.
              </p>
            </div>
            <Link
              href="/presupuesto"
              className="label-caps inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 text-on-accent transition-colors hover:bg-accent-strong"
            >
              Pedir presupuesto <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : (
          <>
            <CatalogFilters categories={categories} initialQ={q} initialCat={cat} />

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-5 rounded-3xl border border-dashed border-outline-variant bg-surface-container px-6 py-14 text-center animate-rise">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-100 text-navy-700">
                  <SearchX className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold tracking-tight">Sin resultados{q ? ` para “${q}”` : ""}</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">Probá con otra búsqueda o mirá todo el catálogo.</p>
                </div>
                <Link
                  href="/catalogo"
                  className="label-caps inline-flex min-h-11 items-center gap-2 rounded-md border border-outline-variant px-5 text-on-surface transition-colors hover:border-primary hover:text-primary"
                >
                  Ver todo
                </Link>
              </div>
            ) : (
              orderedGroups.map(([subcategory, items]) => (
                <section key={subcategory} className="mb-14 last:mb-0">
                  <div className="mb-6 flex items-end justify-between gap-3">
                    <h2 className="flex items-center gap-3 font-display text-2xl font-extrabold tracking-tight">
                      <span className="h-6 w-1.5 rounded-full bg-accent" aria-hidden />
                      {labelProductTaxonomy(subcategory)}
                    </h2>
                    <span className="data-mono pb-1 text-xs text-on-surface-variant">
                      {items.length} {items.length === 1 ? "producto" : "productos"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => {
                      const delay = Math.min(cardIndex++, 11) * 40;
                      const variable = p.minOrder > 1 || p.sizeCount > 1;
                      return (
                        <article
                          key={p.id}
                          className="group hover-lift flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container animate-rise"
                          style={{ animationDelay: `${delay}ms` }}
                        >
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container-high">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
                            ) : (
                              <ProductPlaceholder name={p.name} isBundle={p.productKind === "bundle"} />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-2 p-5">
                            <h3 className="font-display text-lg font-bold leading-snug tracking-tight">{p.name}</h3>
                            {p.bundleLabel && (
                              <p className="text-xs text-on-surface-variant">{p.bundleLabel}</p>
                            )}
                            <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                              <div className="min-w-0">
                                <p className="label-caps text-[10px] text-on-surface-variant">
                                  {variable ? "Desde" : "Por unidad"}
                                </p>
                                <p className="font-display text-2xl font-extrabold leading-tight tracking-tight text-primary">
                                  {formatARS(p.basePrice)}
                                </p>
                                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                                  {[
                                    p.minOrder > 1 ? `mín. ${p.minOrder} u.` : null,
                                    p.sizeCount > 0 ? `${p.sizeCount} talles` : null,
                                  ].filter(Boolean).join(" · ") || " "}
                                </p>
                              </div>
                              <Link
                                href={`/presupuesto/1?productId=${p.id}`}
                                className="label-caps inline-flex shrink-0 items-center gap-1.5 rounded-md border border-outline-variant px-3 py-2 text-on-surface transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent"
                              >
                                Pedir <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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

        <p className="mt-14 text-center text-sm text-on-surface-variant">
          ¿No encontrás lo que buscás?{" "}
          <Link href="/presupuesto" className="font-semibold text-primary underline-offset-4 hover:text-navy-600 hover:underline">
            Contanos en el presupuesto
          </Link>
        </p>
      </div>
    </>
  );
}
