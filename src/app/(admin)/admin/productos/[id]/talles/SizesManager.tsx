"use client";

import { useState, useTransition } from "react";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Size = { id: string; label: string; order: number; measurements: Record<string, number> };

export function SizesManager({ productId, initial }: { productId: string; initial: Size[] }) {
  const [items, setItems] = useState<Size[]>(initial);
  const [pending, startTransition] = useTransition();

  function add() {
    setItems((prev) => [...prev, { id: `new-${Date.now()}`, label: "", order: prev.length, measurements: {} }]);
  }
  function update(i: number, key: keyof Size, value: any) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    startTransition(async () => {
      await fetch(`/api/products/${productId}/sizes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: items }),
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-2 label-caps text-on-surface-variant pb-2 border-b border-outline-variant">
        <div className="col-span-1">Orden</div>
        <div className="col-span-3">Talle</div>
        <div className="col-span-6">Medidas (clave:valor, separadas por coma)</div>
        <div className="col-span-2"></div>
      </div>
      {items.map((s, i) => (
        <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
          <Input className="col-span-1" type="number" value={s.order} onChange={(e) => update(i, "order", Number(e.target.value))} />
          <Input className="col-span-3" value={s.label} onChange={(e) => update(i, "label", e.target.value)} placeholder="M" />
          <Input
            className="col-span-6"
            value={Object.entries(s.measurements).map(([k, v]) => `${k}:${v}`).join(", ")}
            onChange={(e) => {
              const obj: Record<string, number> = {};
              e.target.value.split(",").forEach((part) => {
                const [k, v] = part.split(":").map((x) => x.trim());
                if (k && v && !Number.isNaN(Number(v))) obj[k] = Number(v);
              });
              update(i, "measurements", obj);
            }}
            placeholder="ancho:50, largo:70, manga:20"
          />
          <Button variant="danger" size="sm" className="col-span-2" onClick={() => remove(i)} type="button">Quitar</Button>
        </div>
      ))}
      <div className="flex justify-between pt-4 border-t border-outline-variant">
        <Button variant="secondary" onClick={add} type="button">+ Agregar talle</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Guardando..." : "Guardar talles"}</Button>
      </div>
    </div>
  );
}