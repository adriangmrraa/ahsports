"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
    _fbq: unknown;
  }
}

/**
 * Meta Pixel (H-03, port of SocialCRM `components/meta/meta-pixel.tsx`):
 * loads fbevents.js once, initializes the configured pixel id and tracks a
 * PageView on every client-side route change. Renders nothing — mounted from
 * the public layout only when `meta_pixel_id` is configured.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window.fbq === "undefined") {
      window._fbq = window._fbq || [];
      window.fbq = function (...args: unknown[]) {
        (window._fbq as unknown[]).push(args);
      };

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);

      window.fbq("init", pixelId);
    }

    window.fbq("track", "PageView");
  }, [pixelId, pathname]);

  return null;
}
