import { db } from "@/db/client";
import { garmentMolds, productBundleItems, productBundles, products, sizes } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { validateProductTaxonomyTree } from "@/lib/product-taxonomy";
import { getProductTaxonomy } from "@/lib/product-taxonomy-store";

export type ProductStructureInput = {
  productKind: "garment" | "bundle";
  garmentFamily: "parte_superior" | "campera" | "pantalon" | "short_futbol" | "bermuda" | "accesorio" | null;
  moldId?: string | null;
  bundleItems?: Array<{ componentProductId: string; quantity: number; sizeMode: "same_label" | "fixed"; componentSizeId?: string | null }>;
};

export async function validateProductClassification(category: string, subcategory: string, type: string) {
  return validateProductTaxonomyTree(await getProductTaxonomy(), category, subcategory, type);
}

export async function validateProductStructure(data: ProductStructureInput, currentProductId?: string) {
  if (data.moldId) {
    const [mold] = await db.select({ id: garmentMolds.id, family: garmentMolds.family }).from(garmentMolds).where(eq(garmentMolds.id, data.moldId)).limit(1);
    if (!mold) return "El molde base no existe.";
    if (!data.garmentFamily) return "Un producto sin lógica de prenda no puede tener molde.";
    if (mold.family !== data.garmentFamily) return "El molde base no pertenece a la familia de la prenda.";
  }
  const components = data.bundleItems ?? [];
  if (data.productKind === "garment" && components.length > 0) return "Un producto individual no puede tener componentes de conjunto.";
  if (data.productKind === "bundle" && components.length === 0) return "Un conjunto necesita al menos un producto componente.";
  const ids = components.map((item) => item.componentProductId);
  if (new Set(ids).size !== ids.length) return "Un componente no puede repetirse dentro del conjunto.";
  if (currentProductId && ids.includes(currentProductId)) return "Un producto no puede componerse a sí mismo.";
  if (ids.length > 0) {
    const rows = await db.select({ id: products.id, productKind: products.productKind }).from(products).where(inArray(products.id, ids));
    if (rows.length !== ids.length) return "Uno o más productos componentes no existen.";
    if (rows.some((row) => row.productKind !== "garment")) return "Los conjuntos solo pueden componerse de prendas individuales.";
    const fixedSizeIds = components.flatMap((item) => item.sizeMode === "fixed" && item.componentSizeId ? [item.componentSizeId] : []);
    if (fixedSizeIds.length > 0) {
      const sizeRows = await db.select({ id: sizes.id, productId: sizes.productId }).from(sizes).where(inArray(sizes.id, fixedSizeIds));
      if (sizeRows.length !== fixedSizeIds.length) return "Uno o más talles fijos no existen.";
      for (const item of components) {
        if (item.sizeMode !== "fixed" || !item.componentSizeId) continue;
        const owner = sizeRows.find((size) => size.id === item.componentSizeId)?.productId;
        if (owner !== item.componentProductId) return "El talle fijo no pertenece al producto componente.";
      }
    }
  }
  return null;
}

export async function replaceBundleItems(productId: string, items: ProductStructureInput["bundleItems"] = []) {
  const existing = (await db.select({ id: productBundles.id }).from(productBundles).where(eq(productBundles.productId, productId)).limit(1))[0];
  if (items.length === 0) {
    if (existing) await db.delete(productBundles).where(eq(productBundles.id, existing.id));
    return;
  }
  const bundle = existing
    ?? (await db.insert(productBundles).values({ productId }).returning({ id: productBundles.id }))[0];
  await db.delete(productBundleItems).where(eq(productBundleItems.bundleId, bundle.id));
  await db.insert(productBundleItems).values(items.map((item) => ({
    bundleId: bundle.id,
    componentProductId: item.componentProductId,
    quantity: String(item.quantity),
    sizeMode: item.sizeMode,
    componentSizeId: item.componentSizeId ?? null,
  })));
}
