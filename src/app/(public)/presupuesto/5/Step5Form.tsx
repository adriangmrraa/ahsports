"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WhatsAppCta } from "@/components/WhatsAppCta";
import { createPublicOrder } from "@/app/actions/public-orders";

interface Props {
  productName: string;
  /** Option picks from step 2 — forwarded to createPublicOrder. */
  fabricId: string | null;
  methodIds: string[];
  /** Display names (fabric + methods) resolved server-side for the summary. */
  optionNames: string[];
  items: { talle: string; name: string; number: string; sizeId: string | null }[];
  total: number;
  sizeQuantities: { sizeId: string | null; quantity: number }[];
  contactInfo: { name: string; email: string; phone: string; org: string };
  type: "new" | "returning";
  notes?: string;
  fileIds?: string[];
  uploadSessionId: string;
  uploadSessionSecret: string;
  /** Digits-only business WhatsApp — CTA hidden when empty (C-07). */
  whatsappPhone: string;
  backHref: string;
}

/**
 * F4-12 — Paso 5 form: confirma y dispara createPublicOrder. Muestra el resultado
 * con link a /seguimiento/[publicToken].
 */
export function Step5Form({ productName, fabricId, methodIds, optionNames, items, total, sizeQuantities, contactInfo, type, notes, fileIds, uploadSessionId, uploadSessionSecret, whatsappPhone, backHref }: Props) {
  const [result, setResult] = useState<{ publicToken: string; number: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createPublicOrder({
        type,
        name: contactInfo.name,
        email: contactInfo.email,
        phone: contactInfo.phone,
        organizationName: contactInfo.org || undefined,
        notes,
        productId: new URLSearchParams(window.location.search).get("productId") ?? "",
        fabricId,
        techniqueIds: methodIds.length > 0 ? methodIds : undefined,
        sizeQuantities,
        items: items.map((item) => ({
          sizeId: item.sizeId,
          individualName: item.name || null,
          individualNumber: item.number || null,
        })),
        fileIds,
        uploadSessionId,
        uploadSessionSecret,
      });
      if (res.ok) setResult({ publicToken: res.publicToken, number: res.number });
      else setError(res.error);
    });
  }

  if (result) {
    return (
      <div className="animate-rise mx-auto flex max-w-lg flex-col items-center gap-5 rounded-3xl border border-outline-variant bg-surface-container p-8 text-center shadow-xl shadow-navy-950/10 sm:p-10">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-on-accent">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Solicitud recibida</h2>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">
            Tu pedido <span className="font-display font-bold text-primary">#{result.number}</span> está en revisión.
            Te avisaremos por mail/WhatsApp cuando esté aprobado.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-3">
          <WhatsAppCta
            phone={whatsappPhone}
            message={`Hola! Hice el pedido #${result.number} desde la web y quiero seguirlo por acá.`}
            className="w-full"
          />
          <Link
            href={`/seguimiento/${result.publicToken}`}
            className="label-caps inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-on-primary transition-colors hover:bg-navy-700"
          >
            Ver seguimiento de tu pedido <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="flex w-full flex-col gap-6">
      <div className="animate-rise rounded-3xl border border-outline-variant bg-surface-container p-5 sm:p-7" style={{ animationDelay: "80ms" }}>
        <h3 className="label-caps flex items-center gap-2 text-on-surface-variant">
          <Package className="h-4 w-4" aria-hidden />
          Resumen
        </h3>
        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between"><dt className="text-on-surface-variant">Producto</dt><dd className="break-words font-medium sm:text-right">{productName}</dd></div>
          {optionNames.length > 0 && (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
              <dt className="text-on-surface-variant">Tela y métodos</dt>
              <dd className="break-words font-medium sm:text-right">{optionNames.join(" + ")}</dd>
            </div>
          )}
          <div className="flex justify-between"><dt className="text-on-surface-variant">Prendas</dt><dd className="font-medium">{total}</dd></div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between"><dt className="text-on-surface-variant">Contacto</dt><dd className="break-words font-medium sm:text-right">{contactInfo.name} · {contactInfo.phone}</dd></div>
          {contactInfo.org && <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between"><dt className="text-on-surface-variant">Organización</dt><dd className="break-words font-medium sm:text-right">{contactInfo.org}</dd></div>}
        </dl>
        <ul className="scrollbar-thin mt-4 flex max-h-44 flex-col gap-1.5 overflow-y-auto border-t border-outline-variant pt-4 pr-1">
          {items.slice(0, 40).map((i, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 font-semibold text-navy-700">{i.talle}</span>
              <span className="truncate text-on-surface-variant">{i.name || "—"} · {i.number || "—"}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={backHref} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus sm:justify-start">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </Link>
        <Button type="submit" size="lg" className="animate-pulse-cta border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent">
          Confirmar solicitud
        </Button>
      </div>
    </form>
  );
}
