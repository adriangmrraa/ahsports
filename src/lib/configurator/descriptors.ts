import { db } from "@/db/client";
import { productBundleItems, productBundles, products } from "@/db/schema";
import { inArray } from "drizzle-orm";
import type { ProductGarmentDescriptor } from "@/configurator/model";

/**
 * Bundle component descriptors for the configurator. Given catalog product
 * ids, resolves product_bundles → product_bundle_items → component products
 * and returns each bundle's component descriptors keyed by product id.
 *
 * Quantity is intentionally not multiplied into the render: a conjunto shows
 * its outfit composition once, not N overlapping copies of the same garment.
 */
export async function loadBundleComponentDescriptors(
  productIds: readonly string[],
): Promise<Map<string, readonly ProductGarmentDescriptor[]>> {
  const result = new Map<string, readonly ProductGarmentDescriptor[]>();
  if (productIds.length === 0) return result;

  const bundleRows = await db
    .select({ id: productBundles.id, productId: productBundles.productId })
    .from(productBundles)
    .where(inArray(productBundles.productId, [...productIds]));
  if (bundleRows.length === 0) return result;

  const items = await db
    .select({
      bundleId: productBundleItems.bundleId,
      componentProductId: productBundleItems.componentProductId,
    })
    .from(productBundleItems)
    .where(inArray(productBundleItems.bundleId, bundleRows.map((b) => b.id)));
  if (items.length === 0) return result;

  const componentIds = [...new Set(items.map((i) => i.componentProductId))];
  const componentRows = await db
    .select({
      id: products.id,
      garmentFamily: products.garmentFamily,
      garmentType: products.garmentType,
      productType: products.productType,
      productKind: products.productKind,
    })
    .from(products)
    .where(inArray(products.id, componentIds));
  const descriptorById = new Map<string, ProductGarmentDescriptor>(
    componentRows.map((p) => [
      p.id,
      {
        garmentFamily: p.garmentFamily,
        garmentType: p.garmentType,
        productType: p.productType,
        productKind: p.productKind,
      },
    ]),
  );

  const productIdByBundle = new Map(bundleRows.map((b) => [b.id, b.productId]));
  const grouped = new Map<string, ProductGarmentDescriptor[]>();
  for (const item of items) {
    const productId = productIdByBundle.get(item.bundleId);
    const descriptor = descriptorById.get(item.componentProductId);
    if (!productId || !descriptor) continue;
    const list = grouped.get(productId) ?? [];
    if (!list.includes(descriptor)) list.push(descriptor);
    grouped.set(productId, list);
  }
  for (const [productId, list] of grouped) result.set(productId, list);
  return result;
}
