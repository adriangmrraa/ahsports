import { PageHeader, Card } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { requireUser } from "@/lib/auth";
import { getProductTaxonomyNodes } from "@/lib/product-taxonomy-store";
import { CatalogManager } from "./CatalogManager";

export default async function CatalogoPage() {
  await requireUser();
  const nodes = await getProductTaxonomyNodes();
  return (
    <>
      <PageHeader title="Catálogo de clasificación" subtitle="Administrá las opciones de categoría, subcategoría y tipo que aparecen en los formularios." />
      <PageGuide
        what="El árbol de clasificación con el que se ordenan los productos: categoría → subcategoría → tipo."
        whatFor="Lo que agregues acá aparece en el formulario de producto. Cambiar nombres no afecta productos ya cargados."
      />
      <Card>
        <CatalogManager initial={nodes.map((node) => ({ ...node, parentId: node.parentId ?? null, kind: node.kind }))} />
      </Card>
    </>
  );
}
