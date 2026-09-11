import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { productTaxonomyNodes } from "@/db/schema";
import { mergeProductTaxonomy, PRODUCT_TAXONOMY, taxonomyFromNodes, type ProductTaxonomyCategory } from "@/lib/product-taxonomy";

/** Returns the editable catalog, while keeping the historical suggestions usable until the catalog is configured. */
export async function getProductTaxonomy(): Promise<ProductTaxonomyCategory[]> {
  const rows = await db.select().from(productTaxonomyNodes).where(eq(productTaxonomyNodes.active, true)).orderBy(asc(productTaxonomyNodes.sortOrder), asc(productTaxonomyNodes.label));
  if (rows.length === 0) return PRODUCT_TAXONOMY;
  return mergeProductTaxonomy(PRODUCT_TAXONOMY, taxonomyFromNodes(rows.map((row) => ({ ...row, parentId: row.parentId ?? null, kind: row.kind }))));
}

export async function getProductTaxonomyNodes() {
  return db.select().from(productTaxonomyNodes).orderBy(asc(productTaxonomyNodes.kind), asc(productTaxonomyNodes.sortOrder), asc(productTaxonomyNodes.label));
}
