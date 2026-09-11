"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { GARMENT_FAMILIES, labelGarmentFamily } from "@/lib/garments";

type Mold = {
  id: string;
  name: string;
  family: string;
  measurementSchema: { required: string[]; optional: string[] };
  notes: string | null;
};

export function MoldesManager({ initial }: { initial: Mold[] }) {
  const [molds, setMolds] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const split = (value: FormDataEntryValue | null) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    const payload = {
      name: String(form.get("name") ?? ""),
      family: String(form.get("family") ?? "parte_superior"),
      requiredMeasurements: split(form.get("requiredMeasurements")),
      optionalMeasurements: split(form.get("optionalMeasurements")),
      notes: String(form.get("notes") ?? "") || null,
    };
    startTransition(async () => {
      const response = await fetch("/api/garment-molds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "No se pudo crear el molde");
        return;
      }
      setMolds((current) => [...current, data]);
      formElement.reset();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-md border border-outline-variant bg-surface-container-low">
        <Field label="Nombre del molde"><Input name="name" required placeholder="Molde superior base" /></Field>
        <Field label="Familia"><Select name="family" defaultValue="parte_superior">{GARMENT_FAMILIES.map((family) => <option key={family} value={family}>{labelGarmentFamily(family)}</option>)}</Select></Field>
        <Field label="Medidas requeridas" hint="Separadas por coma; por ejemplo ancho, largo"><Input name="requiredMeasurements" required placeholder="ancho, largo" /></Field>
        <Field label="Medidas opcionales" hint="Se pueden completar por producto"><Input name="optionalMeasurements" placeholder="manga, hombros, cuello" /></Field>
        <Field label="Notas"><Textarea name="notes" rows={2} placeholder="Molde base reutilizable para remera, chomba y camiseta" /></Field>
        <div className="flex items-end"><Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Crear molde"}</Button></div>
      </form>
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      <div className="space-y-3">
        {molds.map((mold) => (
          <div key={mold.id} className="p-4 rounded-md border border-outline-variant flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <p className="font-bold text-on-surface">{mold.name}</p>
              <p className="text-xs text-on-surface-variant">{labelGarmentFamily(mold.family)}</p>
            </div>
            <div className="text-xs text-on-surface-variant md:text-right">
              <p>Requeridas: {mold.measurementSchema.required.join(", ") || "—"}</p>
              <p>Opcionales: {mold.measurementSchema.optional.join(", ") || "—"}</p>
            </div>
          </div>
        ))}
        {molds.length === 0 && <p className="text-sm text-on-surface-variant">Todavía no hay moldes reutilizables.</p>}
      </div>
    </div>
  );
}
