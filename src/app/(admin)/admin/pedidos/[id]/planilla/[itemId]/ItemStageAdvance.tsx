"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const CYCLE = ["ingreso", "corte", "confeccion", "estampado", "control", "entrega"] as const;

export function ItemStageAdvance({ itemId, current }: { itemId: string; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const idx = CYCLE.indexOf(current as (typeof CYCLE)[number]);
  const next = idx >= 0 && idx < CYCLE.length - 1 ? CYCLE[idx + 1] : null;

  function advance() {
    if (!next) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/order-items/${itemId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error avanzando etapa");
        return;
      }
      router.refresh();
    });
  }

  if (!next) {
    return <p className="text-sm text-success">Prenda en etapa final (entrega).</p>;
  }

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <p className="text-sm text-on-surface-variant">
        Etapa actual: <strong className="text-on-surface">{current}</strong> → siguiente: <strong className="text-on-surface">{next}</strong>
      </p>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-error">{error}</span>}
        <Button size="sm" disabled={pending} onClick={advance}>
          {pending ? "Avanzando..." : "Avanzar etapa"}
        </Button>
      </div>
    </div>
  );
}
