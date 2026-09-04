"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const UNITS = ["metro", "kilo", "unidad", "centimetro", "mililitro", "metro_cuadrado", "rollo"];

export function InsumoForm({ initial }: { initial?: any }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      unitPrice: Number(form.get("unitPrice")),
      width: form.get("width") ? Number(form.get("width")) : null,
      gramsPerMeter: form.get("gramsPerMeter") ? Number(form.get("gramsPerMeter")) : null,
      metersPerKilo: form.get("metersPerKilo") ? Number(form.get("metersPerKilo")) : null,
      yieldPercent: Number(form.get("yieldPercent") ?? 85),
    };
    startTransition(async () => {
      const res = await fetch(initial ? `/api/materials/${initial.id}` : "/api/materials", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      router.push("/admin/insumos");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre comercial"><Input name="name" required defaultValue={initial?.name} placeholder="Set poliéster azul" /></Field>
        <Field label="Categoría"><Input name="category" required defaultValue={initial?.category} placeholder="Tela" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Unidad de compra">
          <Select name="unit" defaultValue={initial?.unit ?? "metro"}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Precio por unidad"><Input name="unitPrice" type="number" step="0.01" required defaultValue={initial?.unitPrice ?? "0"} /></Field>
        <Field label="Proveedor"><Input name="supplier" defaultValue={initial?.supplier} /></Field>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Field label="Ancho útil (cm)" hint="Solo telas"><Input name="width" type="number" step="0.1" defaultValue={initial?.width ?? ""} /></Field>
        <Field label="Gramos / metro" hint="Solo telas"><Input name="gramsPerMeter" type="number" step="0.1" defaultValue={initial?.gramsPerMeter ?? ""} /></Field>
        <Field label="Metros / kilo" hint="Si se compra por kilo"><Input name="metersPerKilo" type="number" step="0.1" defaultValue={initial?.metersPerKilo ?? ""} /></Field>
        <Field label="Rendimiento %"><Input name="yieldPercent" type="number" step="0.1" defaultValue={initial?.yieldPercent ?? 85} /></Field>
      </div>
      <Field label="Observaciones"><Textarea name="notes" rows={2} defaultValue={initial?.notes} /></Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : initial ? "Guardar" : "Crear"}</Button>
      </div>
    </form>
  );
}