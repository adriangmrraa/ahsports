"use client";

import { useState, useTransition } from "react";
import { createOrder } from "@/app/actions/orders";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Org = { id: string; name: string };
type Contact = { id: string; name: string; organizationId: string | null };

export function NewOrderForm({ organizations, contacts }: { organizations: Org[]; contacts: Contact[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>("");

  const visibleContacts = orgId ? contacts.filter((c) => c.organizationId === orgId) : contacts;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const org = String(form.get("organizationId") ?? "") || null;
    const contact = String(form.get("contactId") ?? "") || null;
    const input = {
      organizationId: org,
      contactId: contact,
      status: String(form.get("status") ?? "borrador"),
      urgent: form.get("urgent") === "true",
      notes: String(form.get("notes") ?? ""),
    };
    startTransition(async () => {
      const res = await createOrder(input);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Organización" htmlFor="organizationId">
          <Select
            id="organizationId"
            name="organizationId"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            <option value="">Particular</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contacto" htmlFor="contactId">
          <Select id="contactId" name="contactId" defaultValue="">
            <option value="">Sin contacto</option>
            {visibleContacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Título / descripción corta" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} required placeholder="Ej: 22 camisetas sublimadas Club Renacer" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="¿Urgente?">
          <Select name="urgent" defaultValue="false">
            <option value="false">No</option>
            <option value="true">Sí</option>
          </Select>
        </Field>
        <Field label="Estado inicial">
          <Select name="status" defaultValue="borrador">
            <option value="borrador">Borrador</option>
            <option value="presupuesto_enviado">Presupuesto enviado</option>
            <option value="aprobado">Aprobado</option>
          </Select>
        </Field>
      </div>
      <p className="text-xs text-on-surface-variant">
        Después podés agregar líneas, planilla, adjuntos y presupuesto desde la ficha del pedido.
      </p>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Creando..." : "Crear pedido"}</Button>
      </div>
    </form>
  );
}
