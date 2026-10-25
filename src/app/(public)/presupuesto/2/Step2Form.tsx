"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatARS } from "@/lib/public/format";
import { labelProductTaxonomy } from "@/lib/product-taxonomy";
import { estimateWizardQuote } from "../_components/estimate-action";
import { updateConfiguratorDraftPayload } from "@/app/actions/configurator";
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
  fabrics: { id: string; name: string; sublimable: boolean; priceDelta: number }[];
  /** True when admin restricted fabrics via product_fabrics — pick required. */
  fabricConfigured: boolean;
  methods: { id: string; name: string; requiresSublimableFabric: boolean; priceDelta: number }[];
  volumeTiers: { minQty: number; discountPercent: number }[];
}

/** "+ $1.500,00 c/u" / "− $500,00 c/u" / "Incluido" — the option's sell delta. */
function deltaLabel(delta: number): string {
  if (delta > 0) return `+ ${formatARS(delta)} c/u`;
  if (delta < 0) return `− ${formatARS(Math.abs(delta))} c/u`;
  return "Incluido";
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
export function Step2Form({
  catalog,
  draftToken,
  initialProductId,
  initialQuantities,
  initialDirectQuantity,
  initialFabricId,
  initialMethodIds,
}: {
  catalog: CatalogProduct[];
  draftToken: string;
  initialProductId?: string;
  initialQuantities?: Record<string, number>;
  initialDirectQuantity?: number;
  initialFabricId?: string;
  initialMethodIds?: string[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId ?? catalog[0]?.id ?? "");
  const product = catalog.find((p) => p.id === productId);

  const [qty, setQty] = useState<Record<string, number>>(initialQuantities ?? {});
  const [directQuantity, setDirectQuantity] = useState(initialDirectQuantity ?? 0);

  // Stackable option selection: one fabric + any mix of the methods the
  // product offers (sublimado can stack with DTF/bordado on top of it).
  const [fabricId, setFabricId] = useState(initialFabricId ?? "");
  const [methodIds, setMethodIds] = useState<string[]>(initialMethodIds ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Option availability mirrors admin: a product with configured fabrics
  // requires the pick; without rows the fallback catalog is optional.
  // Method checkboxes only make sense once a fabric anchors compatibility.
  const requiresFabric = product?.fabricConfigured ?? false;
  const hasFabricChoices = (product?.fabrics.length ?? 0) > 0;
  const selectedFabric = product?.fabrics.find((f) => f.id === fabricId) ?? null;
  const methodPool = useMemo(
    () => (!selectedFabric ? [] : (product?.methods ?? []).filter((m) => selectedFabric.sublimable || !m.requiresSublimableFabric)),
    [product, selectedFabric],
  );
  const blockedMethodCount = (product?.methods.length ?? 0) - methodPool.length;
  // Methods are mandatory only once a fabric is picked AND the product has
  // configured methods (the engine rejects methods on unconfigured ones).
  const requiresMethod = selectedFabric !== null && (product?.methods.length ?? 0) > 0;
  const optionsReady = (selectedFabric !== null || !requiresFabric) && (!requiresMethod || methodIds.length > 0);

  // Next volume tier above the current quantity — the visible nudge that
  // quantity pricing is per-product.
  const nextTier = useMemo(() => {
    const upcoming = (product?.volumeTiers ?? []).filter((t) => total < t.minQty);
    return upcoming[0] ?? null;
  }, [product, total]);

  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const reqRef = useRef(0);
  const sqKey = JSON.stringify(sizeQuantities);
  const optionsKey = `${fabricId}|${methodIds.join(",")}`;

  useEffect(() => {
    // Wait for required option picks before quoting — a partial selection
    // would fail server-side validation anyway.
    if (!product || sizeQuantities.length === 0 || !optionsReady) {
      setEstimate(null);
      setEstimating(false);
      return;
    }
    const req = ++reqRef.current;
    setEstimating(true);
    const timer = setTimeout(async () => {
      const res = await estimateWizardQuote({
        productId: product.id,
        sizeQuantities,
        fabricId: fabricId || undefined,
        techniqueIds: methodIds,
      });
      if (req !== reqRef.current) return;
      setEstimating(false);
      setEstimate(res.ok ? res.estimate : null);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, sqKey, optionsKey]);

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
    setFabricId("");
    setMethodIds([]);
  }

  function pickFabric(id: string) {
    // Toggle: on optional (unconfigured) products the pick can be undone;
    // on required ones deselecting just blocks "Siguiente" until repicked.
    const next = fabricId === id ? "" : id;
    setFabricId(next);
    const fabric = product?.fabrics.find((f) => f.id === next);
    // Switching to a non-sublimable fabric (or to none) drops picks that
    // need sublimation.
    if (!fabric?.sublimable) {
      setMethodIds((prev) => prev.filter((m) => !product?.methods.find((x) => x.id === m)?.requiresSublimableFabric));
    }
  }

  function toggleMethod(id: string) {
    setMethodIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function goNext(e: React.FormEvent) {
    e.preventDefault();
    if (!product || total < minOrder || !optionsReady || saving) return;
    setSaving(true);
    setSaveError(null);
    // Everything goes server-side on the draft; the URL only carries `d`.
    const res = await updateConfiguratorDraftPayload(draftToken, {
      productId: product.id,
      fabricId: fabricId || null,
      techniqueIds: methodIds,
      sizeQuantities,
      // Sizes are stale for other steps until step 3 fills the items.
      lineItems: undefined,
      step: 2,
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    router.push(`/presupuesto/3?d=${encodeURIComponent(draftToken)}`);
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
                      <p className="text-xs text-on-navy-variant">
                        {formatARS(estimate.unitPrice)} c/u
                        {estimate.options && estimate.options.discountPercent > 0 && (
                          <span className="line-through opacity-70"> · antes {formatARS(estimate.options.listUnitPrice)}</span>
                        )}
                        {" · a confirmar"}
                      </p>
                      {estimate.options && (
                        <p className="mt-0.5 text-[11px] text-on-navy-variant">
                          {estimate.options.fabricName}
                          {estimate.options.methods.length > 0 && ` + ${estimate.options.methods.map((m) => m.techniqueName).join(" + ")}`}
                          {estimate.options.volumeTier && ` · −${estimate.options.discountPercent}% desde ${estimate.options.volumeTier.minQty} unidades`}
                        </p>
                      )}
                    </div>
                    {estimate.advanceAmount !== null && estimate.advancePercent !== null && (
                      <div className="text-right">
                        <p className="label-caps text-[10px] text-on-navy-variant">Seña est.</p>
                        <p className="font-display text-lg font-extrabold">{formatARS(estimate.advanceAmount)}</p>
                      </div>
                    )}
                  </>
                ) : requiresFabric && !fabricId ? (
                  <span className="text-xs text-on-navy-variant">Elegí la tela para calcular el estimado.</span>
                ) : (
                  <span className="text-xs text-on-navy-variant">Precio a confirmar en tu presupuesto.</span>
                )}
              </div>
            )}
            {nextTier && total > 0 && (
              <p className="mt-3 text-xs text-on-surface-variant">
                <span className="font-semibold text-on-surface">{nextTier.minQty - total} prendas más</span> y el
                precio baja a <span className="font-semibold text-primary">−{nextTier.discountPercent}%</span>{" "}
                c/u (desde {nextTier.minQty} unidades).
              </p>
            )}
          </div>

          {/* Tela — requerida si el admin la configuró; catálogo completo opcional si no */}
          {hasFabricChoices && (
            <div className="animate-rise rounded-3xl border border-outline-variant bg-surface-container p-5 sm:p-6" style={{ animationDelay: "180ms" }}>
              <h3 className="label-caps text-on-surface-variant">Tela{!requiresFabric && " (opcional)"}</h3>
              <p className="mt-1.5 text-xs text-on-surface-variant">
                {requiresFabric
                  ? "La tela define qué métodos de aplicación se pueden usar — elegila primero."
                  : "Si el producto admite varias telas, elegila acá — si no, va la estándar."}
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {product.fabrics.map((f) => {
                  const active = f.id === fabricId;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => pickFabric(f.id)}
                      aria-pressed={active}
                      className={cn(
                        "relative flex items-start justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
                        active
                          ? "border-primary bg-surface-container ring-2 ring-primary/25"
                          : "border-outline-variant bg-surface-container hover:-translate-y-0.5 hover:border-primary/40",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-on-surface">{f.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-on-surface-variant">
                          {f.sublimable
                            ? "Permite sublimado 100% — también podés sumar DTF o bordado."
                            : "No permite sublimado — se aplica con DTF o bordado."}
                        </span>
                        <span
                          className={cn(
                            "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            f.priceDelta !== 0 ? "bg-navy-100 text-navy-700" : "bg-surface-container-high text-on-surface-variant",
                          )}
                        >
                          {deltaLabel(f.priceDelta)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
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
          )}

          {/* Métodos de aplicación — apilables, filtrados por la tela elegida */}
          {selectedFabric && (product.methods.length > 0) && (
            <div className="animate-rise rounded-3xl border border-outline-variant bg-surface-container p-5 sm:p-6" style={{ animationDelay: "220ms" }}>
              <h3 className="label-caps text-on-surface-variant">Métodos de aplicación</h3>
              <p className="mt-1.5 text-xs text-on-surface-variant">
                Podés combinar varios — por ejemplo sublimado 100% más DTF o bordado para logos y sponsors.
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {product.methods.map((m) => {
                  const blocked = m.requiresSublimableFabric && !selectedFabric.sublimable;
                  const active = methodIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => !blocked && toggleMethod(m.id)}
                      disabled={blocked}
                      aria-pressed={active}
                      className={cn(
                        "relative flex items-start justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
                        blocked
                          ? "cursor-not-allowed border-outline-variant bg-surface-container opacity-45"
                          : active
                            ? "border-primary bg-surface-container ring-2 ring-primary/25 active:scale-[0.98]"
                            : "border-outline-variant bg-surface-container hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-on-surface">{m.name}</span>
                        {blocked && (
                          <span className="mt-0.5 block text-[11px] leading-4 text-on-surface-variant">
                            Requiere una tela sublimable.
                          </span>
                        )}
                        <span
                          className={cn(
                            "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            m.priceDelta !== 0 ? "bg-navy-100 text-navy-700" : "bg-surface-container-high text-on-surface-variant",
                          )}
                        >
                          {deltaLabel(m.priceDelta)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
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
              {requiresMethod && methodIds.length === 0 && (
                <p className="mt-3 text-xs font-medium text-status-warning">Elegí al menos un método de aplicación.</p>
              )}
              {blockedMethodCount > 0 && !selectedFabric.sublimable && (
                <p className="mt-3 text-[11px] leading-4 text-on-surface-variant">
                  Con una tela sublimable también podrías elegir sublimado 100%.
                </p>
              )}
            </div>
          )}

          {saveError && (
            <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{saveError}</p>
          )}
          <Button type="submit" size="lg" disabled={total < minOrder || !optionsReady || saving} className="border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent">
            {saving ? "Guardando…" : "Siguiente →"}
          </Button>
        </>
      )}
    </form>
  );
}
