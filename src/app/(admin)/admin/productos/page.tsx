import { db } from "@/db/client";
import { products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { PageGuide } from "@/components/admin/PageGuide";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { labelGarmentFamily, labelGarmentType } from "@/lib/garments";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";

export default async function ProductosPage() {
  const rows = await db.select().from(products).orderBy(desc(products.createdAt)).limit(500);

  return (
    <>
      <PageHeader
        title="Catálogo de productos"
        subtitle={`${rows.length} productos configurados`}
        action={<LinkButton href="/admin/productos/nuevo"><Plus className="w-4 h-4" /> Nuevo producto</LinkButton>}
      />

      <PageGuide
        what="Acá vive todo lo que vendés: prendas, conjuntos y servicios."
        whatFor="Cada producto define precio base, telas, métodos y la receta que calcula su costo real. Abrí uno para configurarlo."
        nextStep={{ href: "/admin/productos/nuevo", label: "Nuevo producto" }}
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="Sin productos"
          what="El catálogo es la base de todo: sin productos no hay líneas, recetas ni cotizaciones."
          whatFor="Creá el primero con su precio base y después sumale telas, métodos y receta."
          action={<LinkButton href="/admin/productos/nuevo">Crear producto</LinkButton>}
        />
      ) : (
        <Table responsive>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH>Nombre</TH>
              <TH>Categoría</TH>
              <TH>Familia / tipo</TH>
              <TH align="right">Precio base</TH>
              <TH>Zonas</TH>
              <TH align="right">Acciones</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((p) => (
              <TR key={p.id}>
                <TD className="text-primary">{p.sku}</TD>
                <TD className="text-on-surface" label="Nombre">{p.name}</TD>
                <TD className="text-xs text-on-surface-variant" label="Categoría">{labelProductTaxonomy(p.productCategory)} · {labelProductTaxonomy(p.productSubcategory)}</TD>
                <TD className="text-xs text-on-surface-variant" label="Familia / tipo">{labelProductTaxonomy(p.productType)}{p.productKind === "bundle" ? " · conjunto" : p.garmentFamily ? ` · ${labelGarmentFamily(p.garmentFamily)}${p.garmentType ? ` · ${labelGarmentType(p.garmentType)}` : ""}` : ""}</TD>
                <TD align="right" label="Precio base">{formatCurrency(p.basePrice)}</TD>
                <TD className="text-xs text-on-surface-variant" label="Zonas">
                  {Array.isArray(p.zones) ? (p.zones as string[]).join(", ") : "—"}
                </TD>
                <TD align="right">
                  <LinkButton href={`/admin/productos/${p.id}`} variant="ghost" size="sm">Abrir →</LinkButton>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
