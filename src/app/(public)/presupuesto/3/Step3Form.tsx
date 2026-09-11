"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Row {
  talle: string;
  name: string;
  number: string;
}

/**
 * F4-10 — Paso 3 form: una fila por prenda con nombre/número.
 * Estado serializado a /presupuesto/4 (lineItems) via search params.
 */
export function Step3Form({
  productName,
  sizes,
  total,
  noSize,
}: {
  productName: string;
  sizes: { label: string; qty: number }[];
  total: number;
  noSize?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => {
    const r: Row[] = [];
    if (noSize) {
      for (let i = 0; i < total; i++) r.push({ talle: "Sin talle", name: "", number: "" });
    } else {
      for (const s of sizes) for (let i = 0; i < s.qty; i++) r.push({ talle: s.label, name: "", number: "" });
    }
    return r;
  });

  function update(i: number, field: keyof Row, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function goNext(e: React.FormEvent) {
    e.preventDefault();
    const lineItems = rows.map((r) => `${r.talle}|${r.name.replace(/[|]/g, "").trim()}|${r.number.replace(/[|]/g, "").trim()}`).join(",");
    const params = new URLSearchParams(window.location.search);
    params.set("productName", productName);
    params.set("lineItems", lineItems);
    router.push(`/presupuesto/4?${params.toString()}`);
  }

  if (total === 0) {
    return <p className="text-center text-sm text-on-surface-variant">Sin prendas seleccionadas. Volvé al paso anterior.</p>;
  }

  return (
    <form onSubmit={goNext} className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((r, i) => (
          <fieldset key={i} className="rounded-2xl border border-outline-variant bg-surface-container p-4">
            <legend className="px-1 text-sm font-semibold">Prenda {i + 1} · {r.talle}</legend>
            <div className="mt-2 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-on-surface-variant">
                Nombre
                <Input value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Opcional" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-on-surface-variant">
                Número
                <Input value={r.number} onChange={(e) => update(i, "number", e.target.value)} placeholder="Opcional" inputMode="numeric" />
              </label>
            </div>
          </fieldset>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-outline-variant text-left text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Talle</th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Número</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-outline-variant/50 last:border-0">
                <td className="px-3 py-1.5 text-on-surface-variant">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium">{r.talle}</td>
                <td className="px-3 py-1.5">
                  <Input value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Nombre (opcional)" />
                </td>
                <td className="px-3 py-1.5">
                  <Input value={r.number} onChange={(e) => update(i, "number", e.target.value)} placeholder="N° (opcional)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="submit">Siguiente →</Button>
    </form>
  );
}
