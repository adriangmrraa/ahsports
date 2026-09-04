"use client";

import { useState, useTransition } from "react";
import { createOrganizationWithContact } from "@/app/actions/organizations";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function OrgForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      organization: {
        name: String(form.get("orgName") ?? ""),
        kind: String(form.get("kind") ?? "club"),
        taxId: String(form.get("taxId") ?? "") || null,
        notes: String(form.get("orgNotes") ?? "") || null,
      },
      contact: {
        name: String(form.get("contactName") ?? ""),
        email: String(form.get("contactEmail") ?? "") || null,
        phone: String(form.get("contactPhone") ?? "") || null,
        role: String(form.get("contactRole") ?? "") || null,
      },
    };
    startTransition(async () => {
      const res = await createOrganizationWithContact(input);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      <div className="space-y-4">
        <p className="label-caps text-primary">Organización</p>
        <Field label="Nombre" htmlFor="orgName">
          <Input id="orgName" name="orgName" required maxLength={255} placeholder="Ej: Club Renacer" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo">
            <Select name="kind" defaultValue="club">
              <option value="club">Club</option>
              <option value="empresa">Empresa</option>
              <option value="colegio">Colegio</option>
              <option value="institucion">Institución</option>
              <option value="particular">Particular</option>
            </Select>
          </Field>
          <Field label="CUIT / identificación" htmlFor="taxId">
            <Input id="taxId" name="taxId" maxLength={64} placeholder="Opcional" />
          </Field>
        </div>
        <Field label="Notas" htmlFor="orgNotes">
          <Textarea id="orgNotes" name="orgNotes" rows={2} placeholder="Opcional" />
        </Field>
      </div>

      <div className="space-y-4 pt-4 border-t border-outline-variant">
        <p className="label-caps text-primary">Contacto inicial</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del contacto" htmlFor="contactName">
            <Input id="contactName" name="contactName" required maxLength={255} placeholder="Ej: Juan Pérez" />
          </Field>
          <Field label="Rol" htmlFor="contactRole">
            <Input id="contactRole" name="contactRole" maxLength={128} placeholder="Ej: Profe, encargado" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" htmlFor="contactEmail">
            <Input id="contactEmail" name="contactEmail" type="email" maxLength={255} placeholder="Opcional" />
          </Field>
          <Field label="Teléfono" htmlFor="contactPhone">
            <Input id="contactPhone" name="contactPhone" maxLength={64} placeholder="Opcional" />
          </Field>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Creando..." : "Crear organización"}</Button>
      </div>
    </form>
  );
}
