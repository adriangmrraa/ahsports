"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { getPublicEstimate, type PublicEstimate } from "@/lib/public/estimate";

const estimateInputSchema = z.object({
  productId: z.string().uuid(),
  sizeQuantities: z.array(z.object({
    sizeId: z.string().uuid().nullable(),
    quantity: z.number().int().min(1).max(1000),
  })).min(1).max(32),
  fabricId: z.string().uuid().optional(),
  techniqueIds: z.array(z.string().uuid()).max(20).optional(),
}).strict();

export type WizardEstimateResult =
  | { ok: true; estimate: PublicEstimate }
  | { ok: false };

/**
 * Live engine estimate for wizard step 2. It is a read, but sits on the same
 * unauthenticated surface as the wizard writes — so it shares the
 * `public:wizard` bucket and can never starve the order-creation actions.
 */
export async function estimateWizardQuote(rawInput: unknown): Promise<WizardEstimateResult> {
  const rate = await checkRateLimit(`public:wizard:estimate:${clientIpFromRequest({ headers: await headers() })}`, {
    bucket: "public:wizard",
    limit: 30,
    bucketLimit: 200,
  });
  if (!rate.success) return { ok: false };
  const parsed = estimateInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false };
  const estimate = await getPublicEstimate(parsed.data);
  return estimate ? { ok: true, estimate } : { ok: false };
}
