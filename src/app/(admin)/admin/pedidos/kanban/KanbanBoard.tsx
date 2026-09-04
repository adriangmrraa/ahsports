"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";

type OrderRow = {
  id: string;
  number: number;
  status: string;
  totalQuoted: string | number;
  notes: string | null;
  urgent: boolean;
};

const columns: Array<{ key: string; label: string; tone: "primary" | "secondary" | "tertiary" | "success" | "muted" }> = [
  { key: "en_produccion", label: "En producción", tone: "primary" },
  { key: "corte", label: "Corte", tone: "primary" },
  { key: "confeccion", label: "Confección", tone: "secondary" },
  { key: "estampado", label: "Estampado", tone: "tertiary" },
  { key: "control", label: "Control", tone: "success" },
];

function columnOf(status: string): string {
  if (["aprobado", "seniado", "en_produccion"].includes(status)) return "en_produccion";
  return status;
}

export function KanbanBoard({ initialOrders }: { initialOrders: OrderRow[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDrop(colKey: string, orderId: string) {
    const prev = orders;
    const target = prev.find((o) => o.id === orderId);
    if (!target || target.status === colKey) return;
    // Optimista con snapshot local para revertir si la API falla.
    setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: colKey } : o)));
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/orders/${orderId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: colKey }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setOrders(prev);
        setError(d.error ?? "No se pudo mover el pedido");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-error glass-panel rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto scrollbar-thin">
        {columns.map((col) => {
          const items = orders.filter((o) => columnOf(o.status) === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("orderId");
                if (id) onDrop(col.key, id);
              }}
              className="glass-panel rounded-lg p-3 min-h-[60vh]"
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-outline-variant">
                <span className="label-caps text-on-surface-variant">{col.label}</span>
                <Badge tone={col.tone}>{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <div
                    key={o.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("orderId", o.id);
                      setDragging(o.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`bg-surface-container border border-outline-variant rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-primary transition-colors ${dragging === o.id ? "opacity-50" : ""} ${pending && dragging === o.id ? "pointer-events-none" : ""}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="data-mono text-primary">#{o.number}</span>
                      {o.urgent && <Badge tone="error">Urgente</Badge>}
                    </div>
                    <p className="text-xs text-on-surface line-clamp-2 mb-2">{o.notes || "Sin notas"}</p>
                    <div className="flex justify-between items-center">
                      <span className="data-mono text-on-surface-variant">{formatCurrency(o.totalQuoted)}</span>
                      <Link href={`/admin/pedidos/${o.id}`} className="text-[10px] label-caps text-primary hover:underline">Abrir</Link>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-on-surface-variant text-center py-6">Arrastrá pedidos acá</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
