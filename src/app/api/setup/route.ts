import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";

const SETUP_RATE_LIMIT = 10;
const SETUP_RATE_BUCKET = 60;

/**
 * B-11 — GET /api/setup: read-only first-run status.
 *
 * Before an admin user exists the endpoint answers unauthenticated (that is
 * the bootstrap question it exists for: "is this install initialized?").
 * Once at least one admin exists, status is admin-only — the shape of the
 * install is no longer public information. Never exposes secrets: booleans
 * and counts only.
 */
export async function GET(req: NextRequest) {
  const rate = await checkRateLimit(`setup:${clientIpFromRequest(req)}`, {
    bucket: "setup",
    limit: SETUP_RATE_LIMIT,
    bucketLimit: SETUP_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const [adminCount] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, "admin"));

  const hasAdmin = (adminCount?.value ?? 0) > 0;
  if (hasAdmin) {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const [productCount] = await db.select({ value: count() }).from(products);

  return NextResponse.json({
    needsSetup: !hasAdmin,
    hasAdminUser: hasAdmin,
    seeded: (productCount?.value ?? 0) > 0,
  });
}
