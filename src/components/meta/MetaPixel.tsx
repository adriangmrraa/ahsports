"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Fbq = ((...args: unknown[]) => void) & {
  queue: unknown[][];
  push: (...args: unknown[]) => number;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq: Fbq;
    _fbq: Fbq;
  }
}

/**
 * Installs the canonical Meta stub before fbevents.js loads.
 *
 * The stub MUST buffer into `fbq.queue`: fbevents.js drains
 * `e.fbq.queue` after load and only reads `_fbq` for its version-conflict
 * check. Buffering into `window._fbq` (the previous port) left `fbq.queue`
 * undefined, so `init` was never replayed and the pixel stayed dead.
 */
function installPixel(pixelId: string): void {
  if (typeof window.fbq !== "undefined") return;

  const fbq = ((...args: unknown[]) => {
    fbq.queue.push(args);
  }) as Fbq;
  fbq.queue = [];
  fbq.push = (...args: unknown[]) => fbq.queue.push(args);
  fbq.loaded = true;
  fbq.version = "2.0";

  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", pixelId);
}

/**
 * Meta Pixel (H-03, port of SocialCRM `components/meta/meta-pixel.tsx`):
 * loads fbevents.js once, initializes the configured pixel id and tracks a
 * PageView on every client-side route change. Renders nothing — mounted from
 * the public layout only when a pixel id is resolved.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    installPixel(pixelId);
    window.fbq("track", "PageView");
  }, [pixelId, pathname]);

  return null;
}
