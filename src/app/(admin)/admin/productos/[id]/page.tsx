import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { garmentMolds, productBundleItems, productBundles, products, sizes, bomRecipes, techniques } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency } from "@/lib/utils";
import { ProductoForm } from "../nuevo/ProductoForm";
import { asc } from "drizzle-orm";
import { labelGarmentFamily, labelGarmentType } from "@/lib/garments";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { getProductTaxonomy } from "@/lib/product-taxonomy-store";

export default async function ProductoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) notFound();

  const productSizes = await db.select().from(sizes).where(eq(sizes.productId, id)).orderBy(sizes.order);
  const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.productId, id));
  const techs = await db.select().from(techniques);
  const molds = await db.select().from(garmentMolds).where(eq(garmentMolds.active, true)).orderBy(asc(garmentMolds.name));
  const componentProducts = await db.select({ id: products.id, sku: products.sku, name: products.name, productKind: products.productKind }).from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const taxonomy = await getProductTaxonomy();
  const [bundle] = await db.select({ id: productBundles.id }).from(productBundles).where(eq(productBundles.productId, id)).limit(1);
  const bundleItems = bundle ? await db.select().from(productBundleItems).where(eq(productBundleItems.bundleId, bundle.id)) : [];

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · ${labelProductTaxonomy(product.productCategory)} · ${labelProductTaxonomy(product.productSubcategory)} · ${labelProductTaxonomy(product.productType)}${product.productKind === "bundle" ? " · Conjunto" : product.garmentFamily ? ` · ${labelGarmentFamily(product.garmentFamily)}${product.garmentType ? ` · ${labelGarmentType(product.garmentType)}` : ""}` : ""}`}
        action={<LinkButton href={`/admin/productos/${id}/talles`} variant="secondary">Configurar talles</LinkButton>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card title="Datos del producto">
          <ProductoForm initial={{ ...product, zones: product.zones as string[], bundleItems: bundleItems.map((item) => ({ componentProductId: item.componentProductId, quantity: item.quantity, sizeMode: item.sizeMode, componentSizeId: item.componentSizeId })) }} molds={molds} componentProducts={componentProducts} taxonomy={taxonomy} />
        </Card>

        <Card title="Zonas válidas">
          <div className="flex flex-wrap gap-2">
            {Array.isArray(product.zones) && (product.zones as string[]).length > 0 ? (
              (product.zones as string[]).map((z: string) => (
                <span key={z} className="px-2.5 py-1 rounded border border-primary/40 bg-primary/15 text-primary text-xs">{z}</span>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant">Sin zonas configuradas.</p>
            )}
          </div>
        </Card>
      </div>

      {product.productKind === "bundle" && (
        <Card title="Componentes del conjunto" className="mb-6">
          {bundleItems.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Sin componentes configurados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {bundleItems.map((item) => {
                const component = componentProducts.find((candidate) => candidate.id === item.componentProductId);
                return <li key={item.id} className="flex justify-between gap-3 border-b border-outline-variant/50 pb-2 last:border-0"><span>{component?.name ?? "Producto eliminado"}</span><span className="data-mono text-on-surface-variant">× {item.quantity} · {item.sizeMode === "same_label" ? "mismo talle" : "talle fijo"}</span></li>;
              })}
            </ul>
          )}
        </Card>
      )}

      <Card title="Talles" className="mb-6" action={<LinkButton href={`/admin/productos/${id}/talles`} variant="ghost" size="sm">Editar →</LinkButton>}>
        {productSizes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Sin talles definidos.</p>
        ) : (
          <Table>
            <THead><tr><TH>Orden</TH><TH>Talle</TH><TH>Medidas (cm)</TH></tr></THead>
            <tbody>
              {productSizes.map((s) => (
                <TR key={s.id}>
                  <TD>{s.order}</TD>
                  <TD className="text-on-surface">{s.label}</TD>
                  <TD className="text-xs">{Object.entries(s.measurements as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Recetas técnicas (BOM)" action={<LinkButton href={`/admin/productos/${id}/recetas`} variant="ghost" size="sm">Configurar →</LinkButton>}>
        {recipes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Sin recetas. Configurá qué consume este producto para poder cotizarlo trazablemente.</p>
        ) : (
          <div className="space-y-3">
            {recipes.map((r) => {
              const tech = techs.find((t) => t.id === r.techniqueId);
              return (
                <div key={r.id} className="p-3 bg-surface-container-low rounded border border-outline-variant">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface">
                      {tech ? `Técnica: ${tech.name}` : "Receta general"}
                      {r.sizeId && " · con talle"}
                    </span>
                    <span className="text-xs text-on-surface-variant data-mono">{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}
