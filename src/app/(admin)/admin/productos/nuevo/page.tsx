import { PageHeader, Card } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { ProductoForm } from "./ProductoForm";
import { db } from "@/db/client";
import { garmentMolds, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getProductTaxonomy } from "@/lib/product-taxonomy-store";

export default async function NuevoProductoPage() {
  const [molds, componentProducts, taxonomy] = await Promise.all([
    db.select().from(garmentMolds).where(eq(garmentMolds.active, true)).orderBy(asc(garmentMolds.name)),
    db.select({ id: products.id, sku: products.sku, name: products.name, productKind: products.productKind }).from(products).where(eq(products.active, true)).orderBy(asc(products.name)),
    getProductTaxonomy(),
  ]);
  return (
    <>
      <PageHeader title="Nuevo producto" subtitle="Clasificar, definir precio base, zonas y pedido mínimo" />
      <PageGuide
        what="Un producto es lo que el cliente elige: una prenda, un conjunto o un servicio."
        whatFor="La clasificación ordena el catálogo; el precio base es solo referencia y la receta define el costo real."
        nextStep={{ href: "/admin/productos", label: "Ver catálogo" }}
      />
      <Card>
        <ProductoForm molds={molds} componentProducts={componentProducts} taxonomy={taxonomy} />
      </Card>
    </>
  );
}
