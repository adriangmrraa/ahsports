"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatARS } from "@/lib/public/format";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { estimateWizardQuote } from "../_components/estimate-action";
import type { PublicEstimate } from "@/lib/public/estimate";
import { cn } from "@/lib/utils";

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

  function pickProduct(id: string) {
    if (id === productId) return;
    setProductId(id);
    setQty({});
    setDirectQuantity(0);
  }

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
    <form onSubmit={goNext} className="flex w-full flex-col gap-7">
      {/* Producto — cards seleccionables agrupadas por rubro */}
      <div role="group" aria-label="Producto" className="flex flex-col gap-6">
        {optionGroups.map(([subcategory, items], gi) => (
          <div key={subcategory} className="animate-rise" style={{ animationDelay: `${gi * 70}ms` }}>
            <p className="label-caps mb-3 flex items-center gap-2 text-on-surface-variant">
              <span className="h-3.5 w-1 rounded-full bg-accent" aria-hidden />
              {labelProductTaxonomy(subcategory)}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {items.map((p) => {
                const active = p.id === productId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProduct(p.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
                      active
                        ? "border-primary bg-surface-container ring-2 ring-primary/25"
                        : "border-outline-variant bg-surface-container hover:-translate-y-0.5 hover:border-primary/40",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-on-surface">{p.name}</span>
                      <span className="mt-0.5 block font-display text-base font-extrabold tracking-tight text-primary">
                        {formatARS(p.basePrice)}
                        <span className="ml-1 font-body text-[11px] font-normal text-on-surface-variant">c/u</span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                        active ? "border-accent bg-accent text-on-accent" : "border-outline-variant text-transparent",
                      )}
                      aria-hidden
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {product && (
        <>
          {/* Spotlight del producto seleccionado */}
          <div className="texture-stripes animate-rise overflow-hidden rounded-3xl border border-navy-line bg-navy-900 text-on-navy" style={{ animationDelay: "80ms" }}>
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.name} className="h-44 w-full border-b border-navy-line object-cover" />
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5 sm:p-6">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-extrabold tracking-tight">{product.name}</h2>
                {product.description && (
                  <p className="mt-1.5 text-sm leading-6 text-on-navy-variant">{product.description}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-baseline gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-on-accent">
                  <span className="label-caps text-[10px]">Desde</span>
                  <span className="font-display text-sm font-extrabold">{formatARS(product.basePrice)}</span>
                  <span className="text-[11px]">c/u</span>
                </span>
                {product.minOrder > 1 && (
                  <span className="inline-flex items-center rounded-full border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent">
                    Pedido mínimo: {product.minOrder} unidades
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Cantidades por talle */}
          <div className="animate-rise rounded-3xl border border-outline-variant bg-surface-container p-5 sm:p-6" style={{ animationDelay: "140ms" }}>
            <h3 className="label-caps text-on-surface-variant">Cantidad por talle</h3>
            {product.sizes.length === 0 ? (
              <label className="mt-4 flex max-w-xs items-center justify-between gap-3 text-sm text-on-surface-variant">
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
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {product.sizes.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors",
                      (qty[s.id] ?? 0) > 0
                        ? "border-primary/50 bg-surface-container-high"
                        : "border-transparent bg-surface-container-high",
                    )}
                  >
                    <span className="font-display text-sm font-bold">{s.label}</span>
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
            <div className="mt-5 flex items-center justify-between border-t border-outline-variant pt-4">
              <span className="text-sm text-on-surface-variant">Total unidades</span>
              <span className="font-display text-2xl font-extrabold tracking-tight text-primary">{total}</span>
            </div>
            {belowMin && (
              <p className="mt-1.5 text-xs font-medium text-status-warning">Sumá {minOrder - total} más para llegar al mínimo de {minOrder}.</p>
            )}
            {total > 0 && (
              <div className="texture-stripes mt-4 flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-navy-line bg-navy-900 px-5 py-4 text-on-navy" aria-live="polite">
                {estimating ? (
                  <span className="inline-flex items-center gap-2 text-sm text-on-navy-variant">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando estimado…
                  </span>
                ) : estimate ? (
                  <>
                    <div>
                      <p className="label-caps text-[10px] text-accent">Estimado</p>
                      <p className="font-display text-2xl font-black leading-tight tracking-tight text-accent">{formatARS(estimate.totalPrice)}</p>
                      <p className="text-xs text-on-navy-variant">{formatARS(estimate.unitPrice)} c/u · a confirmar</p>
                    </div>
                    {estimate.advanceAmount !== null && estimate.advancePercent !== null && (
                      <div className="text-right">
                        <p className="label-caps text-[10px] text-on-navy-variant">Seña est.</p>
                        <p className="font-display text-lg font-extrabold">{formatARS(estimate.advanceAmount)}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-on-navy-variant">Precio a confirmar en tu presupuesto.</span>
                )}
              </div>
            )}
          </div>

          <Button type="submit" size="lg" disabled={total < minOrder} className="border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent">
            Siguiente →
          </Button>
        </>
      )}
    </form>
  );
}
