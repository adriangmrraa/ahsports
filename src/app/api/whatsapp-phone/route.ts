import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { getBusinessInfo } from "@/lib/business";

const PUBLIC_WA_PHONE_RATE_LIMIT = 20;
const PUBLIC_WA_PHONE_RATE_BUCKET = 200;

/**
 * B-07 — GET /api/whatsapp-phone: the configured public WhatsApp number in
 * digits-only wa.me form (empty string when unconfigured). Powers the
 * "Continuar por WhatsApp" CTAs on the public flow.
 */
export async function GET(req: Request) {
  const rate = await checkRateLimit(
    `public:whatsapp-phone:${clientIpFromRequest(req)}`,
    {
      bucket: "public:whatsapp-phone",
      limit: PUBLIC_WA_PHONE_RATE_LIMIT,
      bucketLimit: PUBLIC_WA_PHONE_RATE_BUCKET,
    }
  );
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const info = await getBusinessInfo();
  return NextResponse.json({ whatsappPhone: info.whatsappPhone });
}
