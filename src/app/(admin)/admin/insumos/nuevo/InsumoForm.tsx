"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const UNITS = ["metro", "kilo", "unidad", "centimetro", "mililitro", "metro_cuadrado", "rollo"];
const MATERIAL_CATEGORIES = [
  ["Tela", "Tela"],
  ["Insumo", "Insumo"],
  ["Avio", "Avío"],
  ["Packaging", "Packaging"],
  ["Otro", "Otro"],
] as const;

type MaterialInitial = {
  id?: string;
  name?: string | null;
  category?: string | null;
  unit?: string | null;
  unitPrice?: string | null;
  supplierId?: string | null;
  width?: string | null;
  gramsPerMeter?: string | null;
  metersPerKilo?: string | null;
  yieldPercent?: string | null;
  notes?: string | null;
};

export function InsumoForm({ initial, suppliers }: { initial?: MaterialInitial; suppliers?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<string>(initial?.unit ?? "metro");
  const isKilo = unit === "kilo";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const supplierId = (form.get("supplierId") as string | null) || null;
    const payload = {
      ...Object.fromEntries(form.entries()),
      unitPrice: Number(form.get("unitPrice")),
      supplierId,
      supplier: null,
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
        <Field label="Nombre comercial"><Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Set poliéster azul" /></Field>
        <Field label="Categoría"><Select name="category" required defaultValue={initial?.category ?? "Tela"}>{initial?.category && !MATERIAL_CATEGORIES.some(([value]) => value === initial.category) && <option value={initial.category}>{initial.category}</option>}{MATERIAL_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Unidad de compra" hint={isKilo ? "Se compra por kilo, se consume por metro" : undefined}>
          <Select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label={isKilo ? "Precio por kilo ($)" : "Precio por unidad ($)"} hint={isKilo ? "El sistema lo convierte a $/metro con metros/kilo" : undefined}>
          <Input name="unitPrice" type="number" step="0.01" required defaultValue={initial?.unitPrice ?? "0"} />
        </Field>
        <Field label="Proveedor" hint="Elegí de la lista o cargalo en Proveedores">
          <Select name="supplierId" defaultValue={initial?.supplierId ?? ""}>
            <option value="">Sin proveedor</option>
            {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Field label="Ancho útil (cm)" hint="Solo telas"><Input name="width" type="number" step="0.1" defaultValue={initial?.width ?? ""} /></Field>
        <Field label="Gramos / metro" hint="Solo telas"><Input name="gramsPerMeter" type="number" step="0.1" defaultValue={initial?.gramsPerMeter ?? ""} /></Field>
        <Field
          label="Metros / kilo"
          hint={isKilo ? "OBLIGATORIO: sin esto no se puede cotizar" : "Si se compra por kilo"}
        >
          <Input name="metersPerKilo" type="number" step="0.1" required={isKilo} defaultValue={initial?.metersPerKilo ?? ""} />
        </Field>
        <Field label="Rendimiento %"><Input name="yieldPercent" type="number" step="0.1" defaultValue={initial?.yieldPercent ?? 85} /></Field>
      </div>
      <Field label="Observaciones"><Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} /></Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : initial ? "Guardar" : "Crear"}</Button>
      </div>
    </form>
  );
}
