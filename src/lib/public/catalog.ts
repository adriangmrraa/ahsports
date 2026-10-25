import "server-only";

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { productBundleItems, productBundles, products, sizes } from "@/db/schema";

export type PublicCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Published unit price (numeric columns arrive as strings — coerced here). */
  basePrice: number;
  minOrder: number;
  productKind: string;
  productSubcategory: string;
  sizeCount: number;
  /** Bundle component names joined ("Remera + Short"); null for plain garments. */
  bundleLabel: string | null;
};

/**
 * Active products for the public catalog, enriched with how many sizes each
 * offers and (for bundles) the names of their components. Read-only; prices
 * come from `products.basePrice`, never computed client-side.
 */
export async function loadPublicCatalog(): Promise<PublicCatalogProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      imageUrl: products.imageUrl,
      basePrice: products.basePrice,
      minOrder: products.minOrder,
      productKind: products.productKind,
      productSubcategory: products.productSubcategory,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name));

  if (rows.length === 0) return [];

  const sizeRows = await db
    .select({ productId: sizes.productId })
    .from(sizes)
    .where(inArray(sizes.productId, rows.map((p) => p.id)));
  const sizeCount = new Map<string, number>();
  for (const s of sizeRows) sizeCount.set(s.productId, (sizeCount.get(s.productId) ?? 0) + 1);

  const bundleIds = rows.filter((p) => p.productKind === "bundle").map((p) => p.id);
  const bundleLabel = new Map<string, string>();
  if (bundleIds.length > 0) {
    const bundles = await db
      .select({ id: productBundles.id, productId: productBundles.productId })
      .from(productBundles)
      .where(inArray(productBundles.productId, bundleIds));
    const items = await db
      .select({ bundleId: productBundleItems.bundleId, name: products.name })
      .from(productBundleItems)
      .leftJoin(products, eq(products.id, productBundleItems.componentProductId))
      .where(inArray(productBundleItems.bundleId, bundles.map((b) => b.id)));
    const bundleByProduct = new Map(bundles.map((b) => [b.productId, b.id]));
    for (const productId of bundleIds) {
      const bId = bundleByProduct.get(productId);
      const names = items.filter((i) => i.bundleId === bId).map((i) => i.name).filter(Boolean) as string[];
      if (names.length > 0) bundleLabel.set(productId, names.join(" + "));
    }
  }

  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    basePrice: Number(p.basePrice),
    minOrder: p.minOrder,
    productKind: p.productKind,
    productSubcategory: p.productSubcategory || "otros",
    sizeCount: sizeCount.get(p.id) ?? 0,
    bundleLabel: bundleLabel.get(p.id) ?? null,
  }));
}
