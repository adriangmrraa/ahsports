"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { copyAttachmentToOrder } from "@/app/actions/attachments";

export type OpenOrder = { id: string; number: number; status: string };

export function CopyToOrderButton({
  attachmentId,
  attachmentName,
  orders,
}: {
  attachmentId: string;
  attachmentName: string;
  orders: OpenOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  function copy() {
    if (!orderId) return;
    setMsg(null);
    startTransition(async () => {
      const r = await copyAttachmentToOrder({ attachmentId, orderId });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg(`Copiado a pedido #${orders.find((o) => o.id === orderId)?.number ?? ""} (comparte archivo)`);
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return <p className="text-xs text-on-surface-variant">Sin pedidos abiertos para copiar.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label={`Copiar ${attachmentName} a pedido`}>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>#{o.number} · {o.status}</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" disabled={pending || !orderId} onClick={copy}>
          {pending ? "Copiando..." : "Copiar a pedido"}
        </Button>
      </div>
      {msg && <p className="text-xs text-on-surface-variant">{msg}</p>}
    </div>
  );
}
