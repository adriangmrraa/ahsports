import { MetaPixel } from "@/components/meta/MetaPixel";
import { UtmCaptureScript } from "@/components/attribution/UtmCaptureScript";
import { SiteHeader } from "@/components/public/SiteHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
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
    <div className="flex min-h-screen min-w-0 flex-col bg-surface text-on-surface">
      <SiteHeader />
      <UtmCaptureScript />
      {pixelId ? <MetaPixel pixelId={pixelId} /> : null}
      <main className="min-w-0 flex-1 animate-fade">{children}</main>
      <SiteFooter />
    </div>
  );
}
