"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Size = { id: string; label: string; order: number; measurements: Record<string, number> };

export function SizesManager({ productId, initial }: { productId: string; initial: Size[] }) {
  const [items, setItems] = useState<Size[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setItems((prev) => [...prev, { id: `new-${Date.now()}`, label: "", order: prev.length, measurements: {} }]);
  }
  function update<K extends keyof Size>(i: number, key: K, value: Size[K]) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/products/${productId}/sizes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: items }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "No se pudieron guardar los talles");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-2 label-caps text-on-surface-variant pb-2 border-b border-outline-variant">
        <div className="col-span-1">Orden</div>
        <div className="col-span-3">Talle</div>
        <div className="col-span-6">Medidas terminadas (cm)</div>
        <div className="col-span-2"></div>
      </div>
      {items.map((s, i) => (
        <div key={s.id} className="grid grid-cols-12 gap-2 items-start">
          <Input className="col-span-1" type="number" value={s.order} onChange={(e) => update(i, "order", Number(e.target.value))} />
          <Input className="col-span-3" value={s.label} onChange={(e) => update(i, "label", e.target.value)} placeholder="M" />
          <div className="col-span-6 space-y-2">
            {Object.entries(s.measurements).map(([key, value]) => (
              <div key={`${s.id}-${key}`} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-center">
                <Input value={key} onChange={(e) => {
                  const next = { ...s.measurements };
                  delete next[key];
                  if (e.target.value.trim()) next[e.target.value.trim()] = value;
                  update(i, "measurements", next);
                }} placeholder="ancho" aria-label="Nombre de medida" />
                <Input type="number" step="0.1" min="0" value={value} onChange={(e) => update(i, "measurements", { ...s.measurements, [key]: Number(e.target.value) })} aria-label={`Valor de ${key}`} />
                <Button variant="ghost" size="sm" type="button" onClick={() => {
                  const next = { ...s.measurements };
                  delete next[key];
                  update(i, "measurements", next);
                }}>Quitar</Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" type="button" onClick={() => {
              const base = "medida";
              let key = base;
              let n = 2;
              while (Object.prototype.hasOwnProperty.call(s.measurements, key)) key = `${base}_${n++}`;
              update(i, "measurements", { ...s.measurements, [key]: 0 });
            }}>+ Agregar medida</Button>
            <p className="text-xs text-on-surface-variant">Medidas terminadas de la prenda, expresadas en centímetros. No se usan para inventar consumos.</p>
          </div>
          <Button variant="danger" size="sm" className="col-span-2" onClick={() => remove(i)} type="button">Quitar</Button>
        </div>
      ))}
      <div className="flex justify-between pt-4 border-t border-outline-variant">
        <Button variant="secondary" onClick={add} type="button">+ Agregar talle</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Guardando..." : "Guardar talles"}</Button>
      </div>
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}
