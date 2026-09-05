"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelPayment, registerPayment } from "@/app/actions/payments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const KINDS = [
  { value: "sena", label: "Seña" },
  { value: "pago", label: "Pago" },
  { value: "saldo", label: "Saldo" },
] as const;

const METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "otro", label: "Otro" },
] as const;

export function RegisterPaymentForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("sena");
  const [method, setMethod] = useState<string>("transferencia");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Ingresá un monto mayor a 0");
      return;
    }
    startTransition(async () => {
      const res = await registerPayment({
        orderId,
        kind,
        method,
        amount: parsed,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAmount("");
      setReference("");
      setNotes("");
      router.refresh();
    });
  }

  const selectClass = "rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm w-full";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-on-surface-variant">Tipo</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-on-surface-variant">Medio</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectClass}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-on-surface-variant">Monto ($)</span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="4250.00"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-on-surface-variant">Referencia (opcional)</span>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° transferencia, cheque..." />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-on-surface-variant">Notas (opcional)</span>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalle del pago" />
        </label>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando..." : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}

export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (!window.confirm("¿Cancelar este pago? Dejará de contar para el saldo del pedido.")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelPayment({ paymentId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={cancel} disabled={pending}>
        {pending ? "Cancelando..." : "Cancelar"}
      </Button>
      {error && <span className="text-xs text-error">{error}</span>}
    </span>
  );
}
