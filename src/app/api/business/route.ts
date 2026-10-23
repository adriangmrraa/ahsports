import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { getBusinessInfo } from "@/lib/business";

const PUBLIC_BUSINESS_RATE_LIMIT = 20;
const PUBLIC_BUSINESS_RATE_BUCKET = 200;

/**
 * B-03 — GET /api/business: public, non-secret business identity
 * (name, address, display phone, digits-only WhatsApp, instagram, website,
 * description, formatted hours). Secrets never leave `getBusinessInfo`.
 */
export async function GET(req: Request) {
  const rate = await checkRateLimit(`public:business:${clientIpFromRequest(req)}`, {
    bucket: "public:business",
    limit: PUBLIC_BUSINESS_RATE_LIMIT,
    bucketLimit: PUBLIC_BUSINESS_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const info = await getBusinessInfo();
  return NextResponse.json(info);
}
