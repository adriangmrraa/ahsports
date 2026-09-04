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

export function AddLineForm({
  orderId,
  products,
  techniques,
  sizes,
}: {
  orderId: string;
  products: Product[];
  techniques: Array<{ id: string; name: string }>;
  sizes: Size[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [plainQty, setPlainQty] = useState("1");

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const productSizes = useMemo(
    () => sizes.filter((s) => s.productId === productId).sort((a, b) => a.order - b.order),
    [sizes, productId],
  );
  const total = useMemo(() => {
    if (productSizes.length === 0) return Number(plainQty) || 0;
    return productSizes.reduce((acc, s) => acc + (Number(qtys[s.id]) || 0), 0);
  }, [productSizes, qtys, plainQty]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const sizeQuantities: Record<string, number> = {};
    for (const s of productSizes) sizeQuantities[s.id] = Number(qtys[s.id]) || 0;
    const input = {
      orderId,
      productId,
      techniqueId: String(form.get("techniqueId") ?? "") || null,
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
        <Select id="productId" value={productId} onChange={(e) => { setProductId(e.target.value); setQtys({}); }} required>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Técnica (opcional)" htmlFor="techniqueId">
          <Select id="techniqueId" name="techniqueId" defaultValue="">
            <option value="">Sin técnica</option>
            {techniques.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notas" htmlFor="notes">
          <Input id="notes" name="notes" placeholder="Opcional" />
        </Field>
      </div>

      <p className="text-sm text-on-surface-variant">
        Total: <strong className="text-on-surface">{total} prendas</strong>
        {product && <> · Precio base unitario {formatCurrency(product.basePrice)}</>}
      </p>

      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending || total <= 0}>
          {pending ? "Agregando..." : `Agregar línea (${total})`}
        </Button>
      </div>
    </form>
  );
}
