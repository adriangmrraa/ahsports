import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";

/**
 * Read helpers over the `settings` key-value table (jsonb values). Writers
 * live in `src/app/actions/settings.ts` — this is the server-side read path
 * for libs/routes/layouts that need install config.
 */

export async function getSetting(key: string): Promise<unknown | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value ?? null;
}

/** Returns the string value of a setting, or null when unset/non-string. */
export async function getStringSetting(key: string): Promise<string | null> {
  const value = await getSetting(key);
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
