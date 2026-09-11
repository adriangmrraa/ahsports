import { PageHeader, Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth";
import { getProductTaxonomyNodes } from "@/lib/product-taxonomy-store";
import { CatalogManager } from "./CatalogManager";

export default async function CatalogoPage() {
  await requireUser();
  const nodes = await getProductTaxonomyNodes();
  return <><PageHeader title="Catálogo de clasificación" subtitle="Administrá las opciones de categoría, subcategoría y tipo que aparecen en los formularios." /><Card><CatalogManager initial={nodes.map((node) => ({ ...node, parentId: node.parentId ?? null, kind: node.kind }))} /></Card></>;
}
