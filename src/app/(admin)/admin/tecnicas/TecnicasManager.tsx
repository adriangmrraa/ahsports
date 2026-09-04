"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency } from "@/lib/utils";
import type { techniques } from "@/db/schema";

type Row = typeof techniques.$inferSelect;

const EMPTY = { name: "", costPerUnit: "0", costPerSquareMeter: "0", setupCost: "0", description: "" };

export function TecnicasManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(EMPTY);

  function startEdit(row: Row) {
    setEditing(row);
    setForm({
      name: row.name,
      costPerUnit: row.costPerUnit,
      costPerSquareMeter: row.costPerSquareMeter,
      setupCost: row.setupCost,
      description: row.description ?? "",
    });
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const payload = {
      name: form.name,
      costPerUnit: Number(form.costPerUnit),
      costPerSquareMeter: Number(form.costPerSquareMeter),
      setupCost: Number(form.setupCost),
      description: form.description || null,
    };
    startTransition(async () => {
      const res = await fetch(editing ? `/api/techniques/${editing.id}` : "/api/techniques", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      cancelEdit();
      router.refresh();
    });
  }

  async function toggleActive(row: Row) {
    if (!confirm(`${row.active ? "Desactivar" : "Reactivar"} "${row.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/techniques/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error actualizando");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Sublimación" /></Field>
            <Field label="Descripción"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Costo por unidad" hint="$ por prenda"><Input type="number" step="0.01" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} required /></Field>
            <Field label="Costo por m²" hint="$ por metro cuadrado"><Input type="number" step="0.01" value={form.costPerSquareMeter} onChange={(e) => setForm({ ...form, costPerSquareMeter: e.target.value })} required /></Field>
            <Field label="Setup" hint="Costo fijo por trabajo"><Input type="number" step="0.01" value={form.setupCost} onChange={(e) => setForm({ ...form, setupCost: e.target.value })} required /></Field>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            {editing && <Button type="button" variant="ghost" disabled={pending} onClick={cancelEdit}>Cancelar</Button>}
            <Button type="submit" disabled={pending}>{pending ? "Guardando..." : editing ? "Guardar" : "Agregar técnica"}</Button>
          </div>
        </form>
      </Card>

      <Table>
        <THead>
          <tr>
            <TH>Técnica</TH>
            <TH align="right">Por unidad</TH>
            <TH align="right">Por m²</TH>
            <TH align="right">Setup</TH>
            <TH>Estado</TH>
            <TH align="right">Acciones</TH>
          </tr>
        </THead>
        <tbody>
          {initial.map((t) => (
            <TR key={t.id} className={t.active ? undefined : "opacity-60"}>
              <TD className="text-on-surface">{t.name}</TD>
              <TD align="right">{formatCurrency(t.costPerUnit)}</TD>
              <TD align="right">{formatCurrency(t.costPerSquareMeter)}</TD>
              <TD align="right">{formatCurrency(t.setupCost)}</TD>
              <TD>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${t.active ? "bg-primary/10 border-primary/40 text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                  {t.active ? "ACTIVA" : "INACTIVA"}
                </span>
              </TD>
              <TD align="right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => startEdit(t)}>Editar</Button>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => toggleActive(t)}>{t.active ? "Desactivar" : "Reactivar"}</Button>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
