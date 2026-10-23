import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { products, promotions } from "@/db/schema";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { promotionSchema } from "@/lib/validators";

const PROMOTIONS_RATE_LIMIT = 20;
const PROMOTIONS_RATE_BUCKET = 200;

/**
 * A-14/C-04 — GET /api/promotions.
 *
 * Anonymous callers receive ACTIVE promotions only — the public surface must
 * never enumerate promos that were intentionally hidden. Authenticated users
 * (admin panel) may list all with `?active=false` omitted or `?all=1`.
 * Each component is annotated with live product activity so consumers can
 * disable promos whose parts left the catalog.
 */
export async function GET(req: NextRequest) {
  const rate = await checkRateLimit(`pub:promotions:${clientIpFromRequest(req)}`, {
    bucket: "pub:promotions",
    limit: PROMOTIONS_RATE_LIMIT,
    bucketLimit: PROMOTIONS_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const activeOnly = req.nextUrl.searchParams.get("all") !== "1";
  if (!activeOnly) {
    const auth = await authorizeAgentApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.status === 401 ? "No autorizado" : "Prohibido" }, { status: auth.status });
    }
  }

  const rows = await db
    .select({
      id: promotions.id,
      name: promotions.name,
      description: promotions.description,
      imageUrl: promotions.imageUrl,
      items: promotions.items,
      customPrice: promotions.customPrice,
      active: promotions.active,
      createdAt: promotions.createdAt,
    })
    .from(promotions)
    .where(activeOnly ? eq(promotions.active, true) : undefined)
    .orderBy(desc(promotions.createdAt))
    .limit(50);

  const componentIds = [...new Set(rows.flatMap((row) => (row.items ?? []).map((item) => item.productId)))];
  const components = componentIds.length
    ? await db
        .select({ id: products.id, active: products.active })
        .from(products)
        .where(inArray(products.id, componentIds))
    : [];
  const activeById = new Map(components.map((component) => [component.id, component.active]));

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      customPrice: row.customPrice ? Number(row.customPrice) : null,
      active: row.active,
      items: (row.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        available: activeById.get(item.productId) === true,
      })),
    })),
  );
}

/**
 * POST /api/promotions — admin CRUD create. Item productIds are validated
 * against the catalog and their names snapshotted into the row so the promo
 * stays readable if a product is later renamed.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "No autorizado" : "Prohibido" }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = promotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const productIds = d.items.map((item) => item.productId);
  const found = productIds.length
    ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds))
    : [];
  const nameById = new Map(found.map((row) => [row.id, row.name]));
  const missing = productIds.filter((id) => !nameById.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Productos inexistentes: ${missing.length}` }, { status: 400 });
  }

  const [row] = await db
    .insert(promotions)
    .values({
      name: d.name,
      description: d.description ?? null,
      imageUrl: d.imageUrl ?? null,
      items: d.items.map((item) => ({
        productId: item.productId,
        productName: nameById.get(item.productId) ?? "",
        quantity: item.quantity,
      })),
      customPrice: d.customPrice != null ? String(d.customPrice) : null,
      active: d.active,
    })
    .returning();
  return NextResponse.json(row);
}
