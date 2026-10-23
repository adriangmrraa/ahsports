import "server-only";

import { unstable_cache } from "next/cache";

import { getStringSetting } from "@/lib/settings";

/**
 * Single source of truth for the Meta pixel id (H-03 + H-04): the
 * `meta_pixel_id` setting, falling back to the `META_PIXEL_ID` env var.
 *
 * Shared by the public layout (client pixel) and the CAPI sender so the two
 * never diverge — env-only config used to fire CAPI events for a pixel the
 * site never loaded.
 *
 * Cached for 5 minutes: the public layout would otherwise hit the DB on every
 * render, and a pixel id rarely changes.
 */
export const resolvePixelId = unstable_cache(
  async (): Promise<string | null> => {
    const fromSettings = await getStringSetting("meta_pixel_id").catch(() => null);
    if (fromSettings) return fromSettings;
    const fromEnv = process.env.META_PIXEL_ID;
    return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : null;
  },
  ["meta-pixel-id"],
  { revalidate: 300 }
);
