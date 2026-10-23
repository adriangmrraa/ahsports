"use client";

import { useEffect } from "react";

import { captureUTMFromURL } from "@/lib/attribution/utm-capture";

/**
 * Mounts once in the public layout: reads utm_/ad_ params off the landing
 * URL and persists them to the attribution cookie so /api/leads submissions
 * can carry acquisition context.
 */
export function UtmCaptureScript() {
  useEffect(() => {
    captureUTMFromURL();
  }, []);

  return null;
}
