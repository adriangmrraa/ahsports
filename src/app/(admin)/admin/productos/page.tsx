import { db } from "@/db/client";
import { products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default async function ProductosPage() {
  const rows = await db.select().from(products).orderBy(desc(products.createdAt)).limit(500);

  return (
    <>
      <PageHeader
        title="Catálogo de productos"
        subtitle={`${rows.length} productos configurados`}
        action={<LinkButton href="/admin/productos/nuevo"><Plus className="w-4 h-4" /> Nuevo producto</LinkButton>}
      />

      {rows.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">Sin productos</p>
            <p className="text-sm text-on-surface-variant mb-4">Creá el primer producto para empezar a cotizar.</p>
            <LinkButton href="/admin/productos/nuevo">Crear producto</LinkButton>
          </div>
        </Card>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH>Nombre</TH>
              <TH>Categoría</TH>
              <TH align="right">Precio base</TH>
              <TH>Zonas</TH>
              <TH align="right">Acciones</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((p) => (
              <TR key={p.id}>
                <TD className="text-primary">{p.sku}</TD>
                <TD className="text-on-surface">{p.name}</TD>
                <TD className="text-on-surface-variant">{p.category ?? "—"}</TD>
                <TD align="right">{formatCurrency(p.basePrice)}</TD>
                <TD className="text-xs text-on-surface-variant">
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