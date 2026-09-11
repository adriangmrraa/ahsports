"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

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

  const [directQuantity, setDirectQuantity] = useState(0);
  const total = product?.sizes.length
    ? product.sizes.reduce((acc, s) => acc + (qty[s.id] || 0), 0)
    : directQuantity;

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
    <form onSubmit={goNext} className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-on-surface-variant">Producto</span>
        <Select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setQty({});
            setDirectQuantity(0);
          }}
          aria-label="Producto"
        >
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </label>

      {product && (
        <>
          {product.description && <p className="text-sm text-on-surface-variant">{product.description}</p>}
          {product.minOrder > 1 && (
            <p className="text-xs text-amber-400">Pedido mínimo: {product.minOrder} unidades</p>
          )}

          <div className="rounded-2xl border border-outline-variant bg-surface-container p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold">Cantidad por talle</h3>
            {product.sizes.length === 0 ? (
              <label className="flex max-w-xs items-center justify-between gap-3 text-sm text-on-surface-variant">
                <span>Cantidad</span>
                <Input
                  type="number"
                  min={0}
                  value={directQuantity}
                  onChange={(e) => setDirectQuantity(Math.max(0, Number(e.target.value)))}
                  aria-label="Cantidad"
                  controlSize="sm"
                  className="w-24 text-right"
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {product.sizes.map((s) => (
                  <label key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-high p-2">
                    <span className="text-sm">{s.label}</span>
                    <Input
                      type="number"
                      min={0}
                      value={qty[s.id] ?? 0}
                      onChange={(e) => setQty((q) => ({ ...q, [s.id]: Math.max(0, Number(e.target.value)) }))}
                      aria-label={`Cantidad talle ${s.label}`}
                      controlSize="sm"
                      className="w-16 text-right"
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
