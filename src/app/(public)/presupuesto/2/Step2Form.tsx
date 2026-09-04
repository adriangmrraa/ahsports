"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  minOrder: number;
  sizes: { id: string; label: string }[];
}

/**
 * F4-09 — Paso 2 form: elegir producto + cantidades por talle.
 * Estado se propaga a /presupuesto/3 via search params (sizeQuantities=S:2,M:3).
 */
export function Step2Form({ catalog }: { catalog: CatalogProduct[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(catalog[0]?.id ?? "");
  const product = catalog.find((p) => p.id === productId);

  const [qty, setQty] = useState<Record<string, number>>({});

  const total = product?.sizes.reduce((acc, s) => acc + (qty[s.id] || 0), 0) ?? 0;

  function goNext(e: React.FormEvent) {
    e.preventDefault();
    if (!product || total === 0) return;
    const sizesParam = product.sizes
      .map((s) => `${s.label}:${qty[s.id] || 0}`)
      .filter((x) => !x.endsWith(":0"))
      .join(",");
    const params = new URLSearchParams(window.location.search);
    params.set("productId", product.id);
    params.set("productName", product.name);
    params.set("sizeQuantities", sizesParam);
    params.set("total", String(total));
    router.push(`/presupuesto/3?${params.toString()}`);
  }

  return (
    <form onSubmit={goNext} className="mx-auto flex max-w-2xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-on-surface-variant">Producto</span>
        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setQty({});
          }}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2"
        >
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {product && (
        <>
          {product.description && <p className="text-sm text-on-surface-variant">{product.description}</p>}
          {product.minOrder > 1 && (
            <p className="text-xs text-amber-400">Pedido mínimo: {product.minOrder} unidades</p>
          )}

          <div className="rounded-2xl border border-outline-variant bg-surface-container p-5">
            <h3 className="mb-3 text-sm font-semibold">Cantidad por talle</h3>
            {product.sizes.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Este producto no tiene talles configurados.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {product.sizes.map((s) => (
                  <label key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-high p-2">
                    <span className="text-sm">{s.label}</span>
                    <input
                      type="number"
                      min={0}
                      value={qty[s.id] ?? 0}
                      onChange={(e) => setQty((q) => ({ ...q, [s.id]: Math.max(0, Number(e.target.value)) }))}
                      className="w-16 rounded border border-outline-variant bg-surface px-2 py-1 text-right"
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-outline-variant pt-3">
              <span className="text-sm text-on-surface-variant">Total unidades</span>
              <span className="text-lg font-bold">{total}</span>
            </div>
          </div>

          <Button type="submit" disabled={total === 0}>
            Siguiente →
          </Button>
        </>
      )}
    </form>
  );
}