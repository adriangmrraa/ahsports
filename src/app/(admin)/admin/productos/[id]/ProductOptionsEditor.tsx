"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormSection } from "@/components/admin/FormSection";
import { FieldHint } from "@/components/admin/FieldHint";
import { Plus, Trash2 } from "lucide-react";

export type OptionFabric = { id: string; name: string; sublimable: boolean; priceModifier: string };
export type OptionTechnique = { id: string; name: string; requiresSublimableFabric: boolean };
export type ProductOptionsInitial = {
  fabrics: Array<{ fabricId: string; priceModifier: string }>;
  techniques: Array<{ techniqueId: string; priceModifier: string }>;
  volumeTiers: Array<{ minQty: number; discountPercent: string }>;
};

type TierRow = { minQty: string; discountPercent: string };

export function ProductOptionsEditor({
  productId,
  fabrics,
  techniques,
  initial,
}: {
  productId: string;
  fabrics: OptionFabric[];
  techniques: OptionTechnique[];
  initial: ProductOptionsInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedFabrics, setSelectedFabrics] = useState<Record<string, string>>(
    () => Object.fromEntries(initial.fabrics.map((f) => [f.fabricId, f.priceModifier])),
  );
  const [selectedTechniques, setSelectedTechniques] = useState<Record<string, string>>(
    () => Object.fromEntries(initial.techniques.map((t) => [t.techniqueId, t.priceModifier])),
  );
  const [tiers, setTiers] = useState<TierRow[]>(
    initial.volumeTiers.map((t) => ({ minQty: String(t.minQty), discountPercent: t.discountPercent })),
  );

  function toggleFabric(fabricId: string, catalogDelta: string) {
    setSelectedFabrics((prev) => {
      const next = { ...prev };
      if (fabricId in next) delete next[fabricId];
      else next[fabricId] = catalogDelta;
      return next;
    });
    setSaved(false);
  }

  function toggleTechnique(techniqueId: string) {
    setSelectedTechniques((prev) => {
      const next = { ...prev };
      if (techniqueId in next) delete next[techniqueId];
      else next[techniqueId] = "0";
      return next;
    });
    setSaved(false);
  }

  function updateTier(index: number, patch: Partial<TierRow>) {
    setTiers((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setSaved(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const payload = {
      fabrics: Object.entries(selectedFabrics).map(([fabricId, priceModifier]) => ({ fabricId, priceModifier: Number(priceModifier) || 0 })),
      techniques: Object.entries(selectedTechniques).map(([techniqueId, priceModifier]) => ({ techniqueId, priceModifier: Number(priceModifier) || 0 })),
      volumeTiers: tiers
        .map((t) => ({ minQty: Number(t.minQty), discountPercent: Number(t.discountPercent) }))
        .filter((t) => Number.isFinite(t.minQty) && t.minQty > 0),
    };
    startTransition(async () => {
      const res = await fetch(`/api/products/${productId}/options`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FormSection
        title="Telas habilitadas"
        purpose="Tela = lo que el cliente elige. El Δ precio es cuánto suma o resta esa tela sobre el precio base."
      >
        {fabrics.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Sin telas en el catálogo. Cargalas en /admin/telas.</p>
        ) : (
          <div className="space-y-2">
            {fabrics.map((fabric) => {
              const checked = fabric.id in selectedFabrics;
              return (
                <div key={fabric.id} className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer min-w-48">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFabric(fabric.id, fabric.priceModifier)}
                      className="w-4 h-4 accent-primary"
                    />
                    {fabric.name}
                    {!fabric.sublimable && <span className="text-[10px] text-on-surface-variant">(no sublimable)</span>}
                  </label>
                  {checked && (
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      Δ precio $
                      <Input
                        type="number"
                        step="0.01"
                        controlSize="sm"
                        className="w-28"
                        value={selectedFabrics[fabric.id]}
                        onChange={(e) => { setSelectedFabrics((prev) => ({ ...prev, [fabric.id]: e.target.value })); setSaved(false); }}
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title="Métodos habilitados"
        purpose="Método = cómo se aplica el diseño (sublimación, DTF, bordado). Se pueden combinar y cada uno suma su Δ precio."
      >
        {techniques.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Sin técnicas activas. Cargalas en /admin/tecnicas.</p>
        ) : (
          <div className="space-y-2">
            {techniques.map((technique) => {
              const checked = technique.id in selectedTechniques;
              return (
                <div key={technique.id} className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer min-w-48">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTechnique(technique.id)}
                      className="w-4 h-4 accent-primary"
                    />
                    {technique.name}
                    {technique.requiresSublimableFabric && <span className="text-[10px] text-on-surface-variant">(requiere tela sublimable)</span>}
                  </label>
                  {checked && (
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      Δ precio $
                      <Input
                        type="number"
                        step="0.01"
                        controlSize="sm"
                        className="w-28"
                        value={selectedTechniques[technique.id]}
                        onChange={(e) => { setSelectedTechniques((prev) => ({ ...prev, [technique.id]: e.target.value })); setSaved(false); }}
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title="Descuentos por volumen"
        purpose="Tramos de cantidad: desde X unidades, el precio baja ese porcentaje. Sin tramos, no hay descuento."
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => { setTiers((prev) => [...prev, { minQty: "", discountPercent: "0" }]); setSaved(false); }}>
            <Plus className="w-3.5 h-3.5" /> Agregar tramo
          </Button>
        }
      >
        {tiers.length === 0 ? (
          <FieldHint>Sin tramos. El precio no tiene descuento por cantidad.</FieldHint>
        ) : (
          <div className="space-y-2">
            {tiers.map((tier, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-on-surface-variant flex-wrap">
                <span>Desde</span>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  controlSize="sm"
                  className="w-24"
                  placeholder="50"
                  value={tier.minQty}
                  onChange={(e) => updateTier(index, { minQty: e.target.value })}
                  required
                />
                <span>unidades →</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  controlSize="sm"
                  className="w-24"
                  placeholder="10"
                  value={tier.discountPercent}
                  onChange={(e) => updateTier(index, { discountPercent: e.target.value })}
                  required
                />
                <span>% de descuento</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setTiers((prev) => prev.filter((_, i) => i !== index)); setSaved(false); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      {error && <p className="text-sm text-error">{error}</p>}
      {saved && <p className="text-sm text-primary">Opciones guardadas.</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Guardar opciones"}</Button>
      </div>
    </form>
  );
}
