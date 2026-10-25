"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { formatARS } from "@/lib/public/format";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { estimateWizardQuote } from "../_components/estimate-action";
import type { PublicEstimate } from "@/lib/public/estimate";

interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: string;
  minOrder: number;
  productKind: string;
  productSubcategory: string;
  sizes: { id: string; label: string }[];
}

const SUBCATEGORY_ORDER = ["prendas", "conjuntos", "mochilas_infantiles", "bolsos", "insumos", "otros"];

/**
 * F4-09 — Paso 2 form: elegir producto + cantidades por talle.
 * Estado se propaga a /presupuesto/3 via search params (sizeQuantities=S:2,M:3
 * por label + sq=<sizeId>:<qty> para la cotización server-side).
 * `initialProductId` preselecciona el producto cuando se llega desde /catalogo.
 * El estimado sale del motor de pricing real (estimateWizardQuote) — nunca
 * de una cuenta hecha en el cliente.
 */
export function Step2Form({ catalog, initialProductId }: { catalog: CatalogProduct[]; initialProductId?: string }) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId ?? catalog[0]?.id ?? "");
  const product = catalog.find((p) => p.id === productId);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [directQuantity, setDirectQuantity] = useState(0);

  const sizeQuantities = useMemo(() => {
    if (!product) return [];
    if (product.sizes.length > 0) {
      return product.sizes
        .map((s) => ({ sizeId: s.id as string | null, quantity: qty[s.id] ?? 0 }))
        .filter((x) => x.quantity > 0);
    }
    return directQuantity > 0 ? [{ sizeId: null as string | null, quantity: directQuantity }] : [];
  }, [product, qty, directQuantity]);

  const total = sizeQuantities.reduce((acc, s) => acc + s.quantity, 0);
  const minOrder = product?.minOrder ?? 1;
  const belowMin = total > 0 && total < minOrder;

  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const reqRef = useRef(0);
  const sqKey = JSON.stringify(sizeQuantities);

  useEffect(() => {
    if (!product || sizeQuantities.length === 0) {
      setEstimate(null);
      setEstimating(false);
      return;
    }
    const req = ++reqRef.current;
    setEstimating(true);
    const timer = setTimeout(async () => {
      const res = await estimateWizardQuote({ productId: product.id, sizeQuantities });
      if (req !== reqRef.current) return;
      setEstimating(false);
      setEstimate(res.ok ? res.estimate : null);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, sqKey]);

  const optionGroups = useMemo(() => {
    const groups = new Map<string, CatalogProduct[]>();
    for (const p of catalog) {
      const list = groups.get(p.productSubcategory) ?? [];
      list.push(p);
      groups.set(p.productSubcategory, list);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const ia = SUBCATEGORY_ORDER.indexOf(a);
      const ib = SUBCATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [catalog]);

  function goNext(e: React.FormEvent) {
    e.preventDefault();
    if (!product || total < minOrder) return;
    const sizesParam = product.sizes
      .map((s) => `${s.label}:${qty[s.id] || 0}`)
      .filter((x) => !x.endsWith(":0"))
      .join(",");
    const params = new URLSearchParams(window.location.search);
    params.set("productId", product.id);
    params.set("productName", product.name);
    params.set("sizeQuantities", sizesParam);
    params.set("sq", sizeQuantities.map((x) => `${x.sizeId ?? ""}:${x.quantity}`).join(","));
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
          {optionGroups.map(([subcategory, items]) => (
            <optgroup key={subcategory} label={labelProductTaxonomy(subcategory)}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {Number(p.basePrice) > 0 ? `${p.name} — ${formatARS(p.basePrice)}` : p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>

      {product && (
        <>
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.name} className="h-40 w-full rounded-xl border border-outline-variant object-cover" />
          )}
          {product.description && <p className="text-sm text-on-surface-variant">{product.description}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {Number(product.basePrice) > 0 && (
              <span className="inline-flex items-baseline gap-1.5 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-sm">
                <span className="text-xs text-on-surface-variant">Desde</span>
                <span className="font-semibold">{formatARS(product.basePrice)}</span>
                <span className="text-xs text-on-surface-variant">c/u</span>
              </span>
            )}
            {product.minOrder > 1 && (
              <span className="inline-flex items-center rounded-full border border-status-warning/40 bg-status-warning/10 px-3 py-1.5 text-xs font-medium text-status-warning">
                Pedido mínimo: {product.minOrder} unidades
              </span>
            )}
          </div>

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
            {belowMin && (
              <p className="mt-1 text-xs text-status-warning">Sumá {minOrder - total} más para llegar al mínimo de {minOrder}.</p>
            )}
            {total > 0 && (
              <div className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-xl bg-surface-container-high px-4 py-3" aria-live="polite">
                {estimating ? (
                  <span className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando estimado…
                  </span>
                ) : estimate ? (
                  <>
                    <div>
                      <p className="label-caps text-on-surface-variant">Estimado</p>
                      <p className="text-lg font-semibold leading-tight">{formatARS(estimate.totalPrice)}</p>
                      <p className="text-xs text-on-surface-variant">{formatARS(estimate.unitPrice)} c/u · a confirmar</p>
                    </div>
                    {estimate.advanceAmount !== null && estimate.advancePercent !== null && (
                      <div className="text-right">
                        <p className="label-caps text-on-surface-variant">Seña est.</p>
                        <p className="font-semibold">{formatARS(estimate.advanceAmount)}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-on-surface-variant">Precio a confirmar en tu presupuesto.</span>
                )}
              </div>
            )}
          </div>

          <Button type="submit" disabled={total < minOrder}>
            Siguiente →
          </Button>
        </>
      )}
    </form>
  );
}
