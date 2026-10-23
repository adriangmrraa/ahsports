import { MessageCircle } from "lucide-react";

/**
 * C-07 — "Continuar por WhatsApp" CTA. Renders only when the business
 * configured a public WhatsApp number (`business.whatsapp_phone` → digits).
 * The message is URL-encoded; callers include the order reference in it.
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
  if (!phone.trim()) return null;
  const href = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`;
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
