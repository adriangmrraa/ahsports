import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { formatBusinessHours } from "@/lib/business-hours";

/**
 * Business identity (A-16 — port of SocialCRM `business.ts`, adapted: AH
 * stores the identity in the `settings` key-value table under `business.*`
 * keys instead of agent_config columns). Server-only — clients call
 * GET /api/business instead.
 */

export const BUSINESS_SETTING_KEYS = [
  "business.name",
  "business.address",
  "business.whatsapp_phone",
  "business.instagram",
  "business.website",
  "business.description",
  "business.hours",
] as const;

export interface BusinessInfo {
  name: string;
  address: string;
  /** Human-readable phone as configured (may include +/spaces). */
  phoneDisplay: string;
  /** Digits-only number for wa.me links (no +, no spaces). */
  whatsappPhone: string;
  instagram: string;
  website: string;
  description: string;
  /** Display-ready opening hours, only when the business configured them. */
  hours?: string;
}

const FALLBACK: BusinessInfo = {
  name: process.env.BUSINESS_NAME ?? "AH Sports",
  address: "",
  phoneDisplay: "",
  whatsappPhone: (process.env.WHATSAPP_PHONE_NUMBER ?? "").replace(/\D/g, ""),
  instagram: "",
  website: "",
  description: "",
  hours: process.env.BUSINESS_HOURS || undefined,
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the business identity from `settings`. Every field falls back to
 * env/empty so deployments without the keys still boot. Read failures
 * degrade to the env fallback — business info is cosmetic, never blocking.
 */
export async function getBusinessInfo(): Promise<BusinessInfo> {
  try {
    const rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, [...BUSINESS_SETTING_KEYS]));
    const map = new Map(rows.map((row) => [row.key, row.value]));

    const phoneDisplay = asString(map.get("business.whatsapp_phone"));
    const whatsappPhone = (phoneDisplay || FALLBACK.whatsappPhone).replace(
      /\D/g,
      ""
    );

    return {
      name: asString(map.get("business.name")) || FALLBACK.name,
      address: asString(map.get("business.address")) || FALLBACK.address,
      phoneDisplay,
      whatsappPhone,
      instagram: asString(map.get("business.instagram")).replace(/^@/, ""),
      website: asString(map.get("business.website")) || FALLBACK.website,
      description:
        asString(map.get("business.description")) || FALLBACK.description,
      hours:
        formatBusinessHours(map.get("business.hours")) ?? FALLBACK.hours,
    };
  } catch {
    return FALLBACK;
  }
}
