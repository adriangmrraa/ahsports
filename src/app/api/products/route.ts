import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { productSchema, isUniqueViolation } from "@/lib/validators";
import { replaceBundleItems, validateProductClassification, validateProductStructure } from "@/lib/product-domain";

const PRODUCTS_RATE_LIMIT = 30;
const PRODUCTS_RATE_BUCKET = 300;

/**
 * B-10 — GET /api/products: public, rate-limited product feed.
 * Anonymous callers get ACTIVE products only with the same field set the
 * public catalog renders — no cost/internals. `?all=1` (inactive included)
 * requires an authenticated session and keeps the admin field set.
 */
export async function GET(req: NextRequest) {
  const rate = await checkRateLimit(`pub:products:${clientIpFromRequest(req)}`, {
    bucket: "pub:products",
    limit: PRODUCTS_RATE_LIMIT,
    bucketLimit: PRODUCTS_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  if (includeInactive && !(await getCurrentUser())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(products)
    .where(includeInactive ? undefined : eq(products.active, true))
    .orderBy(asc(products.name))
    .limit(200);

  return NextResponse.json(
    rows.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      basePrice: includeInactive ? p.basePrice : null,
      minOrder: p.minOrder,
      productKind: p.productKind,
      garmentType: p.garmentType,
      zones: p.zones,
      active: p.active,
    })),
  );
}

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const classificationError = await validateProductClassification(d.productCategory, d.productSubcategory, d.productType);
  if (classificationError) return NextResponse.json({ error: classificationError }, { status: 400 });
  const structureError = await validateProductStructure(d);
  if (structureError) return NextResponse.json({ error: structureError }, { status: 400 });
  try {
    const [row] = await db.insert(products).values({
      sku: d.sku,
      name: d.name,
      description: d.description ?? null,
      category: d.category ?? null,
      productKind: d.productKind,
      productCategory: d.productCategory,
      productSubcategory: d.productSubcategory,
      productType: d.productType,
      garmentFamily: d.garmentFamily ?? null,
      garmentType: d.garmentType ?? null,
      moldId: d.moldId ?? null,
      basePrice: String(d.basePrice),
      minOrder: d.minOrder,
      zones: d.zones,
    }).returning();
    await replaceBundleItems(row.id, d.productKind === "bundle" ? d.bundleItems : []);
    return NextResponse.json(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "SKU duplicado" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error guardando producto" }, { status: 500 });
  }
}
