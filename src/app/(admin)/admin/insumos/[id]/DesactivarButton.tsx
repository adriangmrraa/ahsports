"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DesactivarButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const action = active ? "desactivar" : "reactivar";
    if (!confirm(`¿${action === "desactivar" ? "Desactivar" : "Reactivar"} este material? Los BOM históricos no se modifican.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/materials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error actualizando");
        return;
      }
      router.push("/admin/insumos");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="ghost" disabled={pending} onClick={toggle}>
        {pending ? "Guardando..." : active ? "Desactivar" : "Reactivar"}
      </Button>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
