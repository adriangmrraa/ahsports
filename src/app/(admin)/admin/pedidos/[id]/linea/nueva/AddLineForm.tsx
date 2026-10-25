"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrderLine } from "@/app/actions/orders";
import { Input, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";

type Product = { id: string; sku: string; name: string; basePrice: string; zones: string[] };
type Size = { id: string; productId: string; label: string; order: number };
type FabricOption = { id: string; name: string; sublimable: boolean };
type TechniqueOption = { id: string; name: string; requiresSublimableFabric: boolean };
type ProductOptionConfig = { fabricIds: string[]; techniqueIds: string[] };

export function AddLineForm({
  orderId,
  products,
  techniques,
  fabrics,
  productOptions,
  sizes,
}: {
  orderId: string;
  products: Product[];
  techniques: TechniqueOption[];
  fabrics: FabricOption[];
  productOptions: Record<string, ProductOptionConfig>;
  sizes: Size[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [fabricId, setFabricId] = useState("");
  const [methodIds, setMethodIds] = useState<Set<string>>(new Set());
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [plainQty, setPlainQty] = useState("1");

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const productSizes = useMemo(
    () => sizes.filter((s) => s.productId === productId).sort((a, b) => a.order - b.order),
    [sizes, productId],
  );

  // Per-product option config: which fabrics/methods this product offers.
  // Without configured rows the form falls back to legacy behavior (no
  // fabric picker, every active technique selectable).
  const optionConfig = useMemo(
    () => productOptions[productId] ?? { fabricIds: [], techniqueIds: [] },
    [productOptions, productId],
  );
  const requiresFabric = optionConfig.fabricIds.length > 0;
  const allowedFabrics = useMemo(
    () => fabrics.filter((fabric) => optionConfig.fabricIds.includes(fabric.id)),
    [fabrics, optionConfig],
  );
  const methodPool = useMemo(
    () => (optionConfig.techniqueIds.length > 0
      ? techniques.filter((technique) => optionConfig.techniqueIds.includes(technique.id))
      : techniques),
    [techniques, optionConfig],
  );
  const selectedFabric = allowedFabrics.find((fabric) => fabric.id === fabricId) ?? null;
  const fabricBlocksMethod = (technique: TechniqueOption) =>
    requiresFabric && (!selectedFabric || (!selectedFabric.sublimable && technique.requiresSublimableFabric));

  const total = useMemo(() => {
    if (productSizes.length === 0) return Number(plainQty) || 0;
    return productSizes.reduce((acc, s) => acc + (Number(qtys[s.id]) || 0), 0);
  }, [productSizes, qtys, plainQty]);

  function toggleMethod(id: string) {
    setMethodIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeProduct(nextId: string) {
    setProductId(nextId);
    setQtys({});
    setFabricId("");
    setMethodIds(new Set());
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const sizeQuantities: Record<string, number> = {};
    for (const s of productSizes) sizeQuantities[s.id] = Number(qtys[s.id]) || 0;
    const input = {
      orderId,
      productId,
      fabricId: requiresFabric ? fabricId || null : null,
      techniqueIds: [...methodIds],
      notes: String(form.get("notes") ?? "") || null,
      sizeQuantities,
      quantity: productSizes.length === 0 ? Number(plainQty) || 0 : null,
    };
    startTransition(async () => {
      const res = await createOrderLine(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/pedidos/${orderId}/planilla`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <Field label="Producto" htmlFor="productId">
        <Select id="productId" value={productId} onChange={(e) => changeProduct(e.target.value)} required>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {p.sku} · {formatCurrency(p.basePrice)}</option>
          ))}
        </Select>
      </Field>

      {product && product.zones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="label-caps text-on-surface-variant mr-1">Zonas:</span>
          {product.zones.map((z) => (
            <Badge key={z} tone="muted">{z}</Badge>
          ))}
        </div>
      )}

      {productSizes.length > 0 ? (
        <div>
          <p className="label-caps text-on-surface-variant block mb-1.5">Cantidad por talle</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {productSizes.map((s) => (
              <Field key={s.id} label={s.label} htmlFor={`talle-${s.id}`}>
                <Input
                  id={`talle-${s.id}`}
                  type="number"
                  min={0}
                  step={1}
                  value={qtys[s.id] ?? ""}
                  placeholder="0"
                  onChange={(e) => setQtys((prev) => ({ ...prev, [s.id]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </div>
      ) : (
        <Field label="Cantidad" htmlFor="quantity">
          <Input
            id="quantity"
            type="number"
            min={1}
            step={1}
            value={plainQty}
            onChange={(e) => setPlainQty(e.target.value)}
            required
          />
        </Field>
      )}

      {requiresFabric && (
        <Field label="Tela" htmlFor="fabricId" hint={selectedFabric && !selectedFabric.sublimable ? "No permite sublimado — solo DTF/bordado" : undefined}>
          <Select id="fabricId" value={fabricId} onChange={(e) => setFabricId(e.target.value)} required>
            <option value="">Elegí una tela…</option>
            {allowedFabrics.map((fabric) => (
              <option key={fabric.id} value={fabric.id}>
                {fabric.name}{fabric.sublimable ? " (sublimable)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {methodPool.length > 0 && (
        <div>
          <p className="label-caps text-on-surface-variant block mb-1.5">
            Métodos de aplicación{optionConfig.techniqueIds.length === 0 && " (opcional)"}
          </p>
          <div className="space-y-1.5">
            {methodPool.map((technique) => {
              const disabled = fabricBlocksMethod(technique);
              return (
                <label
                  key={technique.id}
                  className={`flex items-center gap-2 text-sm ${disabled ? "text-on-surface-variant" : "text-on-surface"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={methodIds.has(technique.id)}
                    disabled={disabled}
                    onChange={() => toggleMethod(technique.id)}
                    className="w-4 h-4 accent-primary"
                  />
                  {technique.name}
                  {disabled && (
                    <span className="text-[11px]">— requiere tela sublimable</span>
                  )}
                </label>
              );
            })}
          </div>
          {requiresFabric && !selectedFabric && (
            <p className="text-xs text-on-surface-variant mt-1">Elegí una tela para habilitar los métodos.</p>
          )}
        </div>
      )}

      <Field label="Notas" htmlFor="notes">
        <Input id="notes" name="notes" placeholder="Opcional" />
      </Field>

      <p className="text-sm text-on-surface-variant">
        Total: <strong className="text-on-surface">{total} prendas</strong>
        {product && <> · Precio base unitario {formatCurrency(product.basePrice)}</>}
      </p>

      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending || total <= 0 || (requiresFabric && !fabricId)}>
          {pending ? "Agregando..." : `Agregar línea (${total})`}
        </Button>
      </div>
    </form>
  );
}
