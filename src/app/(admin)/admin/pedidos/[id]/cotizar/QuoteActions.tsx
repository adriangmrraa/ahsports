"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmQuote, reQuoteOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ConfirmQuoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await confirmQuote({ orderId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/pedidos/${orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-error">{error}</p>}
      <Button onClick={submit} disabled={pending}>
        {pending ? "Confirmando..." : "Confirmar cotización"}
      </Button>
    </div>
  );
}

export function ReQuoteForm({ orderId, currentUrgent }: { orderId: string; currentUrgent: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urgent, setUrgent] = useState(currentUrgent);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await reQuoteOrder({ orderId, urgent });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="w-4 h-4"
        />
        Urgente (aplica recargo de la regla)
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Re-cotizando..." : "Re-cotizar"}
      </Button>
      {error && <p className="text-sm text-error w-full">{error}</p>}
    </form>
  );
}
