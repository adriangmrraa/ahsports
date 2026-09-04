import Link from "next/link";
import { db } from "@/db/client";
import { bomItems, bomRecipes, products, sizes, techniques } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Layers, ArrowRight } from "lucide-react";

export default async function RecetasPage() {
  const rows = await db
    .select({ recipe: bomRecipes, product: products, technique: techniques })
    .from(bomRecipes)
    .leftJoin(products, eq(bomRecipes.productId, products.id))
    .leftJoin(techniques, eq(bomRecipes.techniqueId, techniques.id));

  const allItems = rows.length > 0 ? await db.select().from(bomItems) : [];
  const countByRecipe = new Map<string, number>();
  for (const item of allItems) {
    countByRecipe.set(item.recipeId, (countByRecipe.get(item.recipeId) ?? 0) + 1);
  }

  const allSizes = rows.length > 0 ? await db.select().from(sizes) : [];
  const sizeById = new Map(allSizes.map((s) => [s.id, s.label]));

  const groups = new Map<string, { productId: string; name: string; sku: string; entries: typeof rows }>();
  for (const row of rows) {
    const key = row.product?.id ?? row.recipe.productId;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(row);
    } else {
      groups.set(key, {
        productId: key,
        name: row.product?.name ?? "Producto eliminado",
        sku: row.product?.sku ?? "—",
        entries: [row],
      });
    }
  }
  const grouped = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Recetas técnicas (BOM)"
        subtitle={`${rows.length} ${rows.length === 1 ? "receta" : "recetas"} en ${grouped.length} ${grouped.length === 1 ? "producto" : "productos"}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Sin recetas"
          description="Creá la primera receta desde el detalle de un producto para poder cotizar trazablemente."
          action={<LinkButton href="/admin/productos">Ir a productos</LinkButton>}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.productId}>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="font-headline text-lg text-on-surface">{group.name}</h3>
                <span className="data-mono text-xs text-primary">{group.sku}</span>
                <span className="text-xs text-on-surface-variant">
                  · {group.entries.length} {group.entries.length === 1 ? "receta" : "recetas"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.entries.map(({ recipe, technique }) => {
                  const itemCount = countByRecipe.get(recipe.id) ?? 0;
                  const sizeLabel = recipe.sizeId ? (sizeById.get(recipe.sizeId) ?? null) : null;
                  return (
                    <Card
                      key={recipe.id}
                      title={technique ? technique.name : "Receta general"}
                      action={
                        <LinkButton href={`/admin/productos/${group.productId}/recetas`} variant="ghost" size="sm">
                          Abrir <ArrowRight className="w-3 h-3" />
                        </LinkButton>
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-on-surface-variant">
                          {sizeLabel ? `Talle ${sizeLabel}` : "Todos los talles"}
                        </span>
                        <span className="text-xs text-on-surface-variant data-mono">
                          · {itemCount} {itemCount === 1 ? "item" : "items"} en BOM
                        </span>
                      </div>
                      {recipe.notes && (
                        <p className="text-sm text-on-surface-variant mt-2">{recipe.notes}</p>
                      )}
                      <Link
                        href={`/admin/productos/${group.productId}/recetas`}
                        className="text-xs text-primary hover:underline mt-3 inline-block"
                      >
                        Configurar en {group.sku} →
                      </Link>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
