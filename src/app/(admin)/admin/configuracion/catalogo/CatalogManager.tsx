"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";

type Node = { id: string; kind: "category" | "subcategory" | "type"; value: string; label: string; parentId: string | null; sortOrder: number; active: boolean };
const labels = { category: "Categoría", subcategory: "Subcategoría", type: "Tipo" } as const;

export function CatalogManager({ initial }: { initial: Node[] }) {
  const router = useRouter();
  const [nodes, setNodes] = useState(initial);
  const [form, setForm] = useState({ kind: "category" as Node["kind"], value: "", label: "", parentId: "" });
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parents = useMemo(() => nodes.filter((node) => node.active && node.kind === (form.kind === "subcategory" ? "category" : form.kind === "type" ? "subcategory" : "category")), [nodes, form.kind]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/product-taxonomy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, parentId: form.kind === "category" ? null : form.parentId || null, sortOrder: 0 }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo guardar"); return; }
      setNodes((current) => [...current, data]);
      setForm((current) => ({ ...current, value: "", label: "" }));
      router.refresh();
    });
  }

  async function toggle(node: Node) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/product-taxonomy/${node.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !node.active }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo actualizar"); return; }
      setNodes((current) => current.map((item) => item.id === node.id ? data : item));
      router.refresh();
    });
  }

  async function saveEdit(node: Node) {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/product-taxonomy/${node.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: editing.label }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo actualizar"); return; }
      setNodes((current) => current.map((item) => item.id === node.id ? data : item));
      setEditing(null);
      router.refresh();
    });
  }

  return <div className="space-y-6">
    <Card title="Agregar opción">
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <Field label="Nivel"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Node["kind"], parentId: "" })}><option value="category">Categoría</option><option value="subcategory">Subcategoría</option><option value="type">Tipo</option></Select></Field>
        <Field label="Depende de" hint={form.kind === "category" ? "No aplica" : "Elegí el nivel superior"}><Select value={form.parentId} disabled={form.kind === "category"} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><option value="">Elegir...</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.label}</option>)}</Select></Field>
        <Field label="Identificador" hint="minúsculas, sin espacios"><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required placeholder="camisetas" /></Field>
        <Field label="Nombre visible"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required placeholder="Camisetas" /></Field>
        <div className="md:col-span-4 flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Agregar opción"}</Button></div>
      </form>
      {error && <p className="text-sm text-error mt-3" role="alert">{error}</p>}
    </Card>
    <div className="space-y-2">
      {nodes.map((node) => <div key={node.id} className={`flex flex-wrap items-center gap-3 rounded-md border border-outline-variant px-3 py-2 ${node.active ? "" : "opacity-50"}`}>
        <span className="label-caps text-on-surface-variant w-28">{labels[node.kind]}</span>
        {editing?.id === node.id ? <Input className="max-w-56" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} aria-label="Nombre visible" /> : <><span className="font-medium text-on-surface">{node.label}</span><span className="data-mono text-xs text-on-surface-variant">{node.value}</span></>}
        <span className="text-xs text-on-surface-variant">{node.parentId ? `· ${nodes.find((parent) => parent.id === node.parentId)?.label ?? "padre"}` : ""}</span>
        {editing?.id === node.id ? <><Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={pending} onClick={() => saveEdit(node)}>Guardar</Button><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(null)}>Cancelar</Button></> : <><Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={pending} onClick={() => setEditing({ id: node.id, label: node.label })}>Editar nombre</Button><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => toggle(node)}>{node.active ? "Desactivar" : "Activar"}</Button></>}
      </div>)}
      {nodes.length === 0 && <p className="text-sm text-on-surface-variant">El catálogo todavía está vacío. Las sugerencias históricas siguen disponibles hasta que cargues tus propias opciones.</p>}
    </div>
  </div>;
}
