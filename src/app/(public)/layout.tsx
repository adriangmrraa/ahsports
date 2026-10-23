import { PublicShell } from "@/components/layout/PublicShell";
import { MetaPixel } from "@/components/meta/MetaPixel";
import { UtmCaptureScript } from "@/components/attribution/UtmCaptureScript";
import { getStringSetting } from "@/lib/settings";

/**
 * Public layout: UTM capture always runs (cookie write only when the landing
 * URL carries utm_/ad_ params); the Meta Pixel mounts only when the
 * `meta_pixel_id` setting is configured (H-03).
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const pixelId = await getStringSetting("meta_pixel_id").catch(() => null);

  return (
    <PublicShell>
      <UtmCaptureScript />
      {pixelId ? <MetaPixel pixelId={pixelId} /> : null}
      {children}
    </PublicShell>
  );
}
