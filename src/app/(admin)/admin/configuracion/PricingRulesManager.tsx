"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import type { pricingRules } from "@/db/schema";

type Row = typeof pricingRules.$inferSelect;

const EMPTY = { name: "", marginPercent: "40", urgentSurcharge: "15", minAdvancePercent: "50", rounding: "100", active: false };

export function PricingRulesManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(EMPTY);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
    setError(null);
  }

  function startEdit(row: Row) {
    setEditing(row);
    setForm({
      name: row.name,
      marginPercent: row.marginPercent,
      urgentSurcharge: row.urgentSurcharge,
      minAdvancePercent: row.minAdvancePercent,
      rounding: row.rounding,
      active: row.active,
    });
    setShowForm(true);
    setError(null);
  }

  function cancelForm() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(false);
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const payload = {
      name: form.name,
      marginPercent: Number(form.marginPercent),
      urgentSurcharge: Number(form.urgentSurcharge),
      minAdvancePercent: Number(form.minAdvancePercent),
      rounding: Number(form.rounding),
      active: form.active,
    };
    startTransition(async () => {
      const res = await fetch(editing ? `/api/pricing-rules/${editing.id}` : "/api/pricing-rules", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      cancelForm();
      router.refresh();
    });
  }

  async function toggleActive(row: Row) {
    if (row.active) {
      if (!confirm(`Desactivar "${row.name}"? No quedará ninguna regla activa.`)) return;
    } else {
      if (!confirm(`Activar "${row.name}"? Se desactivarán las demás reglas.`)) return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/pricing-rules/${row.id}`, {
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
      <Card
        title="Reglas de precio"
        action={
          !showForm && (
            <Button size="sm" disabled={pending} onClick={startCreate}>
              <Plus className="w-4 h-4" />
              Nueva regla
            </Button>
          )
        }
      >
        {showForm ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Estándar 2026" /></Field>
              <Field label="Redondeo" hint="Múltiplo de redondeo, ej. 100"><Input type="number" step="1" min="1" value={form.rounding} onChange={(e) => setForm({ ...form, rounding: e.target.value })} required /></Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Margen %" hint="% sobre costo"><Input type="number" step="0.01" value={form.marginPercent} onChange={(e) => setForm({ ...form, marginPercent: e.target.value })} required /></Field>
              <Field label="Recargo urgente %" hint="% adicional"><Input type="number" step="0.01" value={form.urgentSurcharge} onChange={(e) => setForm({ ...form, urgentSurcharge: e.target.value })} required /></Field>
              <Field label="Seña mínima %" hint="% de anticipo"><Input type="number" step="0.01" value={form.minAdvancePercent} onChange={(e) => setForm({ ...form, minAdvancePercent: e.target.value })} required /></Field>
            </div>
            <Field label="Activa" hint="Solo una regla puede estar activa: al activar esta se desactivan las demás">
              <Input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-auto" />
            </Field>
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={cancelForm}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Guardando..." : editing ? "Guardar" : "Crear regla"}</Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-on-surface-variant">El motor de pricing usa la regla activa. Solo una puede estar activa a la vez.</p>
        )}
      </Card>

      {error && !showForm && <p className="text-sm text-error">{error}</p>}

      <Table>
        <THead>
          <tr>
            <TH>Regla</TH>
            <TH align="right">Margen %</TH>
            <TH align="right">Urgente %</TH>
            <TH align="right">Seña mín %</TH>
            <TH align="right">Redondeo</TH>
            <TH>Estado</TH>
            <TH align="right">Acciones</TH>
          </tr>
        </THead>
        <tbody>
          {initial.map((r) => (
            <TR key={r.id} className={r.active ? undefined : "opacity-60"}>
              <TD className="text-on-surface">{r.name}</TD>
              <TD align="right">{r.marginPercent}%</TD>
              <TD align="right">{r.urgentSurcharge}%</TD>
              <TD align="right">{r.minAdvancePercent}%</TD>
              <TD align="right">{r.rounding}</TD>
              <TD>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${r.active ? "bg-primary/10 border-primary/40 text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                  {r.active ? "ACTIVA" : "INACTIVA"}
                </span>
              </TD>
              <TD align="right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => startEdit(r)}>Editar</Button>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => toggleActive(r)}>{r.active ? "Desactivar" : "Activar"}</Button>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
