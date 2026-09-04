import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { bomItems, bomRecipes, materials, products, sizes, techniques } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";
import { RecetasEditor } from "./RecetasEditor";

export default async function ProductoRecetasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) notFound();

  const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.productId, id));
  const productSizes = await db.select().from(sizes).where(eq(sizes.productId, id)).orderBy(asc(sizes.order));
  const allTechniques = await db.select().from(techniques).orderBy(asc(techniques.name));
  const activeMaterials = await db.select().from(materials).where(eq(materials.active, true)).orderBy(asc(materials.name));

  const recipeIds = recipes.map((r) => r.id);
  const items =
    recipeIds.length > 0
      ? await db.select().from(bomItems).where(inArray(bomItems.recipeId, recipeIds))
      : [];

  return (
    <>
      <PageHeader
        title={`Recetas · ${product.name}`}
        subtitle={`${product.sku} · ${recipes.length} ${recipes.length === 1 ? "receta" : "recetas"} · ${items.length} ${items.length === 1 ? "item" : "items"} en BOM`}
        action={
          <LinkButton href={`/admin/productos/${id}`} variant="secondary">
            <ArrowLeft className="w-4 h-4" /> Volver al producto
          </LinkButton>
        }
      />
      <Card>
        <RecetasEditor
          productId={id}
          recipes={recipes}
          items={items}
          techniques={allTechniques}
          sizes={productSizes}
          materials={activeMaterials}
        />
      </Card>
    </>
  );
}
