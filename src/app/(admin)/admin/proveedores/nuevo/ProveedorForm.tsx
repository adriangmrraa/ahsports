"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type SupplierInitial = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contactName?: string | null;
  taxId?: string | null;
  notes?: string | null;
};

export function ProveedorForm({ initial }: { initial?: SupplierInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = (form.get(k) as string | null)?.trim();
      return v ? v : null;
    };
    const payload = {
      name: str("name") ?? "",
      phone: str("phone"),
      email: str("email"),
      address: str("address"),
      contactName: str("contactName"),
      taxId: str("taxId"),
      notes: str("notes"),
    };
    startTransition(async () => {
      const res = await fetch(initial ? `/api/suppliers/${initial.id}` : "/api/suppliers", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      router.push("/admin/proveedores");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre / razón social"><Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Textil Norte" /></Field>
        <Field label="Persona de contacto" hint="A futuro: contacto automatizado"><Input name="contactName" defaultValue={initial?.contactName ?? ""} placeholder="Ej: María Gómez" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Teléfono / WhatsApp" hint="Canal futuro de pedidos"><Input name="phone" defaultValue={initial?.phone ?? ""} placeholder="+5493704..." /></Field>
        <Field label="Email" hint="Canal futuro de pedidos"><Input name="email" type="email" defaultValue={initial?.email ?? ""} placeholder="ventas@proveedor.com" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Dirección"><Input name="address" defaultValue={initial?.address ?? ""} /></Field>
        <Field label="CUIT"><Input name="taxId" defaultValue={initial?.taxId ?? ""} placeholder="30-..." /></Field>
      </div>
      <Field label="Notas"><Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder="Condiciones, plazos de entrega, etc." /></Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : initial ? "Guardar" : "Crear"}</Button>
      </div>
    </form>
  );
}
