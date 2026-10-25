"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency } from "@/lib/utils";
import type { fabrics } from "@/db/schema";

type Row = typeof fabrics.$inferSelect;

const EMPTY = { name: "", priceModifier: "0", sortOrder: "0", sublimable: true };

export function TelasManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(EMPTY);

  function startEdit(row: Row) {
    setEditing(row);
    setForm({
      name: row.name,
      priceModifier: row.priceModifier,
      sortOrder: String(row.sortOrder),
      sublimable: row.sublimable,
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
      priceModifier: Number(form.priceModifier),
      sortOrder: Number(form.sortOrder) || 0,
      sublimable: form.sublimable,
    };
    startTransition(async () => {
      const res = await fetch(editing ? `/api/fabrics/${editing.id}` : "/api/fabrics", {
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
      const res = await fetch(`/api/fabrics/${row.id}`, {
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Polar, Piqué, Jersey..." /></Field>
            <Field label="Modificador de precio" hint="$ +/- sobre el precio base"><Input type="number" step="0.01" value={form.priceModifier} onChange={(e) => setForm({ ...form, priceModifier: e.target.value })} required /></Field>
            <Field label="Orden" hint="Menor aparece primero"><Input type="number" step="1" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} required /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.sublimable}
              onChange={(e) => setForm({ ...form, sublimable: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            Apta para sublimación
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            {editing && <Button type="button" variant="ghost" disabled={pending} onClick={cancelEdit}>Cancelar</Button>}
            <Button type="submit" disabled={pending}>{pending ? "Guardando..." : editing ? "Guardar" : "Agregar tela"}</Button>
          </div>
        </form>
      </Card>

      <Table responsive>
        <THead>
          <tr>
            <TH>Orden</TH>
            <TH>Tela</TH>
            <TH align="right">Modificador</TH>
            <TH>Sublimable</TH>
            <TH>Estado</TH>
            <TH align="right">Acciones</TH>
          </tr>
        </THead>
        <tbody>
          {initial.map((t) => (
            <TR key={t.id} className={t.active ? undefined : "opacity-60"}>
              <TD label="Orden">{t.sortOrder}</TD>
              <TD className="text-on-surface" label="Tela">{t.name}</TD>
              <TD align="right" label="Modificador">{formatCurrency(t.priceModifier)}</TD>
              <TD label="Sublimable">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${t.sublimable ? "bg-primary/10 border-primary/40 text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                  {t.sublimable ? "SÍ" : "NO"}
                </span>
              </TD>
              <TD label="Estado">
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
