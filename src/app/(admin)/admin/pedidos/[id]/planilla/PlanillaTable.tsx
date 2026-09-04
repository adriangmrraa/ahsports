"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Line = { id: string; quantity: number; productName: string; productSku: string; notes: string | null };
type Item = {
  id: string;
  orderLineId: string;
  individualName: string | null;
  individualNumber: string | null;
  status: string;
  sizeLabel: string | null;
};

const STAGES = ["ingreso", "corte", "confeccion", "estampado", "control", "entrega"] as const;

const stageTone: Record<string, "muted" | "primary" | "secondary" | "tertiary" | "success"> = {
  ingreso: "muted",
  corte: "primary",
  confeccion: "secondary",
  estampado: "tertiary",
  control: "primary",
  entrega: "success",
};

export function PlanillaTable({ orderId, lines, items }: { orderId: string; lines: Line[]; items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patchItem(id: string, patch: Record<string, string | null>) {
    setError(null);
    const res = await fetch(`/api/order-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Error guardando");
      return;
    }
    router.refresh();
  }

  async function deleteLine(lineId: string, label: string) {
    if (!confirm(`Eliminar línea "${label}" con todas sus prendas?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/order-lines/${lineId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error eliminando");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-error">{error}</p>}
      {lines.map((line) => {
        const lineItems = items.filter((i) => i.orderLineId === line.id);
        return (
          <Card
            key={line.id}
            title={
              <span className="flex items-center gap-2 flex-wrap">
                {line.productName}
                <span className="data-mono text-xs text-on-surface-variant">{line.productSku}</span>
                <Badge tone="muted">{lineItems.length}/{line.quantity}</Badge>
              </span>
            }
            action={
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => deleteLine(line.id, line.productName)}>
                Eliminar línea
              </Button>
            }
          >
            {line.notes && <p className="text-xs text-on-surface-variant mb-3">{line.notes}</p>}
            <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead className="bg-surface-container text-on-surface-variant border-b border-outline-variant">
                  <tr>
                    <th className="p-2 label-caps font-medium">Talle</th>
                    <th className="p-2 label-caps font-medium">Nombre</th>
                    <th className="p-2 label-caps font-medium">Número</th>
                    <th className="p-2 label-caps font-medium">Etapa</th>
                    <th className="p-2 label-caps font-medium text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((it) => (
                    <PlanillaRow key={it.id} item={it} orderId={orderId} onPatch={patchItem} />
                  ))}
                </tbody>
              </table>
            </div>
            {lineItems.length === 0 && (
              <p className="text-xs text-on-surface-variant text-center py-4">Sin prendas en esta línea.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function PlanillaRow({
  item,
  orderId,
  onPatch,
}: {
  item: Item;
  orderId: string;
  onPatch: (id: string, patch: Record<string, string | null>) => Promise<void>;
}) {
  const [name, setName] = useState(item.individualName ?? "");
  const [number, setNumber] = useState(item.individualNumber ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  async function blurSave() {
    if (name === (item.individualName ?? "") && number === (item.individualNumber ?? "")) return;
    await onPatch(item.id, { individualName: name || null, individualNumber: number || null });
    setSaved("✓");
    setTimeout(() => setSaved(null), 1500);
  }

  return (
    <tr className="border-b border-outline-variant last:border-0 hover:bg-surface-bright/5 transition-colors">
      <td className="p-2">
        <Badge tone="muted">{item.sizeLabel ?? "U"}</Badge>
      </td>
      <td className="p-2 min-w-[140px]">
        <Input
          value={name}
          placeholder="Nombre"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { void blurSave(); }}
        />
      </td>
      <td className="p-2 min-w-[90px]">
        <Input
          value={number}
          placeholder="Nº"
          onChange={(e) => setNumber(e.target.value)}
          onBlur={() => { void blurSave(); }}
        />
      </td>
      <td className="p-2 min-w-[130px]">
        <div className="flex items-center gap-1.5">
          <Select
            value={item.status}
            onChange={(e) => { void onPatch(item.id, { status: e.target.value }); }}
            aria-label="Etapa"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Badge tone={stageTone[item.status] ?? "muted"} className="hidden sm:inline-flex">{item.status}</Badge>
        </div>
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        {saved && <span className="text-xs text-success mr-2">{saved}</span>}
        <Link href={`/admin/pedidos/${orderId}/planilla/${item.id}`} className="text-[11px] label-caps text-primary hover:underline">
          Abrir
        </Link>
      </td>
    </tr>
  );
}
