"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency } from "@/lib/utils";
import type { materials } from "@/db/schema";

type Row = typeof materials.$inferSelect;

export function InsumosTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(false);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActive && !r.active) return false;
      if (category && r.category !== category) return false;
      if (q && !`${r.name} ${r.supplier ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, category, onlyActive]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="md:max-w-xs w-full">
          <Input placeholder="Buscar por nombre o proveedor..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs label-caps border transition-colors ${category === null ? "bg-primary/20 border-primary/50 text-primary" : "border-outline-variant text-on-surface-variant hover:text-primary"}`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory((prev) => (prev === c ? null : c))}
              className={`px-3 py-1.5 rounded-full text-xs label-caps border transition-colors ${category === c ? "bg-primary/20 border-primary/50 text-primary" : "border-outline-variant text-on-surface-variant hover:text-primary"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="md:ml-auto flex items-center gap-2 text-xs label-caps text-on-surface-variant cursor-pointer">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-current w-4 h-4" />
          Solo activos
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">Sin resultados para los filtros aplicados.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Material</TH>
              <TH>Categoría</TH>
              <TH>Unidad</TH>
              <TH align="right">Precio</TH>
              <TH>Proveedor</TH>
              <TH>Estado</TH>
              <TH align="right">Acciones</TH>
            </tr>
          </THead>
          <tbody>
            {filtered.map((m) => (
              <TR key={m.id} className={m.active ? undefined : "opacity-60"}>
                <TD className="text-on-surface">{m.name}</TD>
                <TD className="text-on-surface-variant">{m.category}</TD>
                <TD className="data-mono">{m.unit}</TD>
                <TD align="right">{formatCurrency(m.unitPrice)}</TD>
                <TD className="text-on-surface-variant">{m.supplier ?? "—"}</TD>
                <TD>
                  <Link href={`/admin/insumos/${m.id}`} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.active ? "bg-primary/10 border-primary/40 text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                    {m.active ? "ACTIVO" : "INACTIVO"}
                  </Link>
                </TD>
                <TD align="right"><LinkButton href={`/admin/insumos/${m.id}`} variant="ghost" size="sm">Abrir →</LinkButton></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
