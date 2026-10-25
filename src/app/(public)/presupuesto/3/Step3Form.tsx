"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateConfiguratorDraftPayload } from "@/app/actions/configurator";

interface Row {
  sizeId: string | null;
  talle: string;
  name: string;
  number: string;
}

/**
 * F4-10 — Paso 3 form: una fila por prenda con nombre/número.
 * Estado persistido en el draft del configurador (`?d=`) — la URL ya no
 * transporta PII de jugadores ni cantidades.
 */
export function Step3Form({
  draftToken,
  productName,
  sizes,
  total,
  noSize,
  initialRows,
  hasSavedDesign = false,
}: {
  draftToken: string;
  productName: string;
  sizes: { id: string | null; label: string; qty: number }[];
  total: number;
  noSize?: boolean;
  initialRows?: { sizeId: string | null; sizeLabel?: string; individualName?: string | null; individualNumber?: string | null }[];
  /** Home handoff already has a durable design for the selected product. */
  hasSavedDesign?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => {
    // Back-navigation restores what the draft already holds when the garment
    // count still matches; otherwise rows are rebuilt from current quantities.
    if (initialRows && initialRows.length === total) {
      return initialRows.map((r) => ({
        sizeId: r.sizeId,
        talle: r.sizeLabel || "Sin talle",
        name: r.individualName ?? "",
        number: r.individualNumber ?? "",
      }));
    }
    const r: Row[] = [];
    if (noSize) {
      for (let i = 0; i < total; i++) r.push({ sizeId: null, talle: "Sin talle", name: "", number: "" });
    } else {
      for (const s of sizes) for (let i = 0; i < s.qty; i++) r.push({ sizeId: s.id, talle: s.label, name: "", number: "" });
    }
    return r;
  });

  function update(i: number, field: keyof Row, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  async function goNext(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await updateConfiguratorDraftPayload(draftToken, {
      lineItems: rows.map((r) => ({
        sizeId: r.sizeId,
        sizeLabel: r.talle,
        individualName: r.name.trim() || null,
        individualNumber: r.number.trim() || null,
      })),
      step: 3,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/presupuesto/${hasSavedDesign ? 5 : 4}?d=${encodeURIComponent(draftToken)}`);
  }

  if (total === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-outline-variant bg-surface-container px-6 py-10 text-center">
        <p className="text-sm text-on-surface-variant">Sin prendas seleccionadas. Volvé al paso anterior.</p>
      </div>
    );
  }

  return (
    <form onSubmit={goNext} className="flex w-full flex-col gap-5">
      <p className="sr-only">{productName}</p>
      {/* Mobile: una card por prenda */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((r, i) => (
          <fieldset key={i} className="animate-rise rounded-2xl border border-outline-variant bg-surface-container p-4" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <legend className="px-1">
              <span className="label-caps inline-flex items-center gap-2 rounded-full bg-navy-100 px-3 py-1 text-navy-700">
                Prenda {i + 1} · {r.talle}
              </span>
            </legend>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
                Nombre
                <Input value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Opcional" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
                Número
                <Input value={r.number} onChange={(e) => update(i, "number", e.target.value)} placeholder="Opcional" inputMode="numeric" />
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      {/* Desktop: tabla dentro de una card elevada */}
      <div className="animate-rise hidden overflow-hidden rounded-3xl border border-outline-variant bg-surface-container sm:block" style={{ animationDelay: "80ms" }}>
        <table className="w-full text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low text-left">
            <tr>
              <th className="label-caps px-4 py-3 font-bold text-on-surface-variant">#</th>
              <th className="label-caps px-4 py-3 font-bold text-on-surface-variant">Talle</th>
              <th className="label-caps px-4 py-3 font-bold text-on-surface-variant">Nombre</th>
              <th className="label-caps px-4 py-3 font-bold text-on-surface-variant">Número</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-outline-variant/50 transition-colors last:border-0 hover:bg-surface-container-high/50">
                <td className="px-4 py-2 font-display text-sm font-bold text-navy-300">{i + 1}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-1 text-xs font-bold text-navy-700">{r.talle}</span>
                </td>
                <td className="px-4 py-2">
                  <Input value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Nombre (opcional)" controlSize="sm" />
                </td>
                <td className="px-4 py-2">
                  <Input value={r.number} onChange={(e) => update(i, "number", e.target.value)} placeholder="N° (opcional)" controlSize="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus sm:justify-start"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </button>
        <Button type="submit" size="lg" disabled={saving} className="border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent">
          {saving ? "Guardando…" : "Siguiente →"}
        </Button>
      </div>
    </form>
  );
}
