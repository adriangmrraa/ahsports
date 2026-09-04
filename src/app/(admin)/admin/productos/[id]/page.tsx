import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { products, sizes, bomRecipes, techniques } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency } from "@/lib/utils";
import { ProductoForm } from "../nuevo/ProductoForm";

export default async function ProductoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) notFound();

  const productSizes = await db.select().from(sizes).where(eq(sizes.productId, id)).orderBy(sizes.order);
  const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.productId, id));
  const techs = await db.select().from(techniques);

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · ${product.category ?? "Sin categoría"}`}
        action={<LinkButton href={`/admin/productos/${id}/talles`} variant="secondary">Configurar talles</LinkButton>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card title="Datos del producto">
          <ProductoForm initial={{ ...product, zones: product.zones as string[] }} />
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