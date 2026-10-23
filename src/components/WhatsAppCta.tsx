"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

import { getStoredUTM, type UTMParams } from "@/lib/attribution/utm-capture";

/**
 * Compact UTM echo appended to the CTA message. The inbound pipeline stores
 * `firstMessage` verbatim, so a conversation started from this CTA keeps its
 * acquisition context even before a signed `ref:` link exists.
 */
function attributionSuffix(utm: UTMParams | null): string {
  if (!utm) return "";
  const parts = [
    utm.utm_source && `source=${utm.utm_source}`,
    utm.utm_medium && `medium=${utm.utm_medium}`,
    utm.utm_campaign && `campaign=${utm.utm_campaign}`,
    utm.utm_content && `content=${utm.utm_content}`,
    utm.platform && `platform=${utm.platform}`,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `[utm ${parts.join(" ")}]` : "";
}

/**
 * C-07 — "Continuar por WhatsApp" CTA. Renders only when the business
 * configured a public WhatsApp number (`business.whatsapp_phone` → digits).
 * The message is URL-encoded; callers include the order reference in it.
 *
 * Reads the stored UTM cookie (written by `UtmCaptureScript`) after mount and
 * echoes it into the prefilled message, closing the capture → attribution
 * loop that was previously write-only.
 */
export function WhatsAppCta({
  phone,
  message,
  className,
}: {
  /** Digits-only wa.me number (from getBusinessInfo().whatsappPhone). */
  phone: string;
  /** Prefilled message — already contains the order reference. */
  message: string;
  className?: string;
}) {
  const [suffix, setSuffix] = useState("");

  useEffect(() => {
    setSuffix(attributionSuffix(getStoredUTM()));
  }, []);

  if (!phone.trim()) return null;

  const text = suffix ? `${message} ${suffix}` : message;
  const href = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 ${className ?? ""}`}
    >
      <MessageCircle className="h-4 w-4" />
      Continuar por WhatsApp
    </a>
  );
}
