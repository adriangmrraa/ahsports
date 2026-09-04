"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const COMMON_ZONES = [
  "Pecho izquierdo",
  "Pecho central",
  "Pecho derecho",
  "Manga izquierda",
  "Manga derecha",
  "Espalda alta",
  "Espalda baja",
  "Espalda central",
  "Pierna izquierda",
  "Pierna derecha",
  "Frente completo",
];

export function ProductoForm({ initial }: { initial?: any }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>(initial?.zones ?? ["Pecho izquierdo", "Espalda alta"]);

  function toggleZone(z: string) {
    setZones((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      zones,
      basePrice: Number(form.get("basePrice")),
      minOrder: Number(form.get("minOrder") ?? 1),
    };
    startTransition(async () => {
      const res = await fetch(initial ? `/api/products/${initial.id}` : "/api/products", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      const data = await res.json();
      router.push(`/admin/productos/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Field label="SKU"><Input name="sku" required defaultValue={initial?.sku} placeholder="CAM-SUB-001" /></Field>
        <Field label="Categoría"><Input name="category" defaultValue={initial?.category} placeholder="Camisetas" /></Field>
      </div>
      <Field label="Nombre"><Input name="name" required defaultValue={initial?.name} placeholder="Camiseta deportiva manga corta" /></Field>
      <Field label="Descripción"><Textarea name="description" rows={3} defaultValue={initial?.description} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Precio base"><Input name="basePrice" type="number" step="0.01" required defaultValue={initial?.basePrice ?? "0"} /></Field>
        <Field label="Pedido mínimo"><Input name="minOrder" type="number" min={1} defaultValue={initial?.minOrder ?? 1} /></Field>
      </div>
      <Field label="Zonas válidas (clic para toggle)">
        <div className="flex flex-wrap gap-2">
          {COMMON_ZONES.map((z) => (
            <button
              type="button"
              key={z}
              onClick={() => toggleZone(z)}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${zones.includes(z) ? "bg-primary/20 border-primary text-primary" : "bg-transparent border-outline-variant text-on-surface-variant hover:border-primary"}`}
            >
              {z}
            </button>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant mt-2">Estas zonas se ofrecerán al cargar aplicaciones sobre prendas de este producto.</p>
      </Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : initial ? "Guardar cambios" : "Crear producto"}</Button>
      </div>
    </form>
  );
}