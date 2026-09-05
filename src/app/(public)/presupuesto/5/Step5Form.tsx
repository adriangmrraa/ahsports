"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { createPublicOrder } from "@/app/actions/public-orders";

interface Props {
  productName: string;
  items: { talle: string; name: string; number: string; sizeId: string }[];
  total: number;
  sizeQuantities: { sizeId: string; quantity: number }[];
  contactInfo: { name: string; email: string; phone: string; org: string };
  type: "new" | "returning";
  notes?: string;
  fileIds?: string[];
}

/**
 * F4-12 — Paso 5 form: confirma y dispara createPublicOrder. Muestra el resultado
 * con link a /seguimiento/[publicToken].
 */
export function Step5Form({ productName, items, total, sizeQuantities, contactInfo, type, notes, fileIds }: Props) {
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
        sizeQuantities,
        items: items.map((item) => ({
          sizeId: item.sizeId,
          individualName: item.name || null,
          individualNumber: item.number || null,
        })),
        fileIds,
      });
      if (res.ok) setResult({ publicToken: res.publicToken, number: res.number });
      else setError("No se pudo guardar tu solicitud. Probá de nuevo.");
    });
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-primary/30 bg-surface-container p-8 text-center">
        <span className="text-3xl">✅</span>
        <h2 className="text-xl font-bold">Solicitud recibida</h2>
        <p className="text-sm text-on-surface-variant">
          Tu pedido <span className="font-semibold text-on-surface">#{result.number}</span> está en revisión. Te avisaremos
          por mail/WhatsApp cuando esté aprobado.
        </p>
        <Link href={`/seguimiento/${result.publicToken}`} className="text-sm font-medium text-primary hover:underline">
          → Ver seguimiento de tu pedido
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="rounded-2xl border border-outline-variant bg-surface-container p-6">
        <h3 className="mb-3 text-sm font-semibold">Resumen</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-on-surface-variant">Producto</dt><dd>{productName}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Prendas</dt><dd>{total}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Contacto</dt><dd>{contactInfo.name} · {contactInfo.phone}</dd></div>
          {contactInfo.org && <div className="flex justify-between"><dt className="text-on-surface-variant">Organización</dt><dd>{contactInfo.org}</dd></div>}
        </dl>
        <ul className="mt-4 flex max-h-40 flex-col gap-1 overflow-y-auto border-t border-outline-variant pt-3">
          {items.slice(0, 40).map((i, idx) => (
            <li key={idx} className="flex justify-between text-xs text-on-surface-variant">
              <span>{i.talle}</span>
              <span>{i.name || "—"} · {i.number || "—"}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center justify-between">
        <Link href="/presupuesto/4" className="text-sm text-on-surface-variant hover:text-on-surface">
          ← Volver
        </Link>
        <Button type="submit">Confirmar solicitud</Button>
      </div>
    </form>
  );
}
