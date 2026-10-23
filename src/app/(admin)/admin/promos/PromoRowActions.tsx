"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";

export function PromoRowActions({ id, active, name }: { id: string; active: boolean; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await fetch(`/api/promotions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`¿Eliminar la promo "${name}"?`)) return;
    startTransition(async () => {
      await fetch(`/api/promotions/${id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <span className="inline-flex gap-2">
      <LinkButton href={`/admin/promos/${id}`} variant="ghost" size="sm">Editar</LinkButton>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface disabled:opacity-50"
      >
        {active ? "Desactivar" : "Activar"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="text-xs font-bold uppercase tracking-wider text-status-danger hover:opacity-80 disabled:opacity-50"
      >
        Eliminar
      </button>
    </span>
  );
}
