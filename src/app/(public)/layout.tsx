import { PublicShell } from "@/components/layout/PublicShell";
import { MetaPixel } from "@/components/meta/MetaPixel";
import { UtmCaptureScript } from "@/components/attribution/UtmCaptureScript";
import { resolvePixelId } from "@/lib/meta/pixel-id";

/**
 * Public layout: UTM capture always runs (cookie write only when the landing
 * URL carries utm_/ad_ params); the Meta Pixel mounts only when a pixel id is
 * configured (H-03). The id comes from the shared cached resolver so the
 * pixel and CAPI never diverge and public renders don't hit the DB.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const pixelId = await resolvePixelId();

  return (
    <PublicShell>
      <UtmCaptureScript />
      {pixelId ? <MetaPixel pixelId={pixelId} /> : null}
      {children}
    </PublicShell>
  );
}
