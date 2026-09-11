"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function EstadoButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!confirm(active ? "Desactivar proveedor? Sus insumos quedan vinculados igual." : "Reactivar proveedor?")) return;
    startTransition(async () => {
      await fetch(`/api/suppliers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" disabled={pending} onClick={toggle}>
      {active ? "Desactivar" : "Reactivar"}
    </Button>
  );
}
