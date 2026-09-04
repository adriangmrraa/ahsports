"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function ItemEditor({
  itemId,
  initialName,
  initialNumber,
}: {
  itemId: string;
  initialName: string;
  initialNumber: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [number, setNumber] = useState(initialNumber);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name !== initialName || number !== initialNumber;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/order-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ individualName: name || null, individualNumber: number || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" htmlFor="item-name">
          <Input id="item-name" value={name} placeholder="Nombre" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Número" htmlFor="item-number">
          <Input id="item-number" value={number} placeholder="Nº" onChange={(e) => setNumber(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-xs text-success">Guardado ✓</span>}
        <Button size="sm" disabled={pending || !dirty} onClick={save}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
