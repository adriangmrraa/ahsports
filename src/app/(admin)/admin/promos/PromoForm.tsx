"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type ProductOption = { id: string; name: string };

export type PromoInitial = {
  id?: string;
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  customPrice?: string | number | null;
  active?: boolean;
  items?: Array<{ productId: string; productName?: string; quantity: number }>;
};

type ItemRow = { productId: string; quantity: number };

export function PromoForm({ initial, products }: { initial?: PromoInitial; products: ProductOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>(
    (initial?.items ?? []).map((item) => ({ productId: item.productId, quantity: item.quantity })),
  );

  function setItem(index: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = (form.get(k) as string | null)?.trim();
      return v ? v : null;
    };
    const priceRaw = str("customPrice");
    const payload = {
      name: str("name") ?? "",
      description: str("description"),
      imageUrl: str("imageUrl"),
      customPrice: priceRaw ? Number(priceRaw) : null,
      active: form.get("active") === "on",
      items: items.filter((item) => item.productId && item.quantity > 0),
    };
    startTransition(async () => {
      const res = await fetch(initial ? `/api/promotions/${initial.id}` : "/api/promotions", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      router.push("/admin/promos");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <Field label="Nombre de la promo"><Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Combo club completo" /></Field>
      <Field label="Descripción"><Textarea name="description" rows={2} defaultValue={initial?.description ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Imagen (URL)" hint="Opcional"><Input name="imageUrl" type="url" defaultValue={initial?.imageUrl ?? ""} placeholder="https://..." /></Field>
        <Field label="Precio promocional" hint="Vacío = se cobra la suma de precios reales"><Input name="customPrice" type="number" min="0" step="0.01" defaultValue={initial?.customPrice ?? ""} /></Field>
      </div>

      <div className="space-y-2">
        <p className="label-caps text-content-secondary">Contenido (productos del catálogo)</p>
        <p className="text-xs text-on-surface-variant">Elegí qué productos entran y cuántas unidades de cada uno. Sin precio promocional se cobra la suma real.</p>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1">
              <Select value={item.productId} onChange={(e) => setItem(i, { productId: e.target.value })} required>
                <option value="">Elegí producto…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Input type="number" min={1} value={item.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} required />
            </div>
            <button type="button" onClick={() => setItems((rows) => rows.filter((_, k) => k !== i))} className="text-status-danger text-xs font-bold uppercase pb-2">
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((rows) => [...rows, { productId: "", quantity: 1 }])}
          className="text-xs font-bold uppercase tracking-wider text-primary"
        >
          + Agregar producto
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-on-surface">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="accent-primary" />
        Activa (visible en la API pública y para el agente)
      </label>

      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : initial ? "Guardar" : "Crear promo"}</Button>
      </div>
    </form>
  );
}
