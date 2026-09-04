"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * F4-08 — Paso 1: tipo de cliente + datos del contacto.
 * Estado en search params de la URL; el continue arma /presupuesto/2?...params
 */
export function Step1Form({ existing }: { existing?: { name?: string; email?: string; phone?: string } | null }) {
  const router = useRouter();
  const [type, setType] = useState<"new" | "returning">("new");
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    email: existing?.email ?? "",
    phone: existing?.phone ?? "",
    organizationName: "",
    notes: "",
  });

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function goNext(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("type", type);
    if (form.name) params.set("name", form.name);
    if (form.email) params.set("email", form.email);
    if (form.phone) params.set("phone", form.phone);
    if (form.organizationName) params.set("org", form.organizationName);
    if (form.notes) params.set("notes", form.notes);
    router.push(`/presupuesto/2?${params.toString()}`);
  }

  return (
    <form onSubmit={goNext} className="mx-auto flex max-w-xl flex-col gap-5">
      {/* Tipo */}
      <div className="flex gap-2">
        {[
          { v: "new", label: "Soy nuevo" },
          { v: "returning", label: "Ya soy cliente" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setType(o.v as "new" | "returning")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${
              type === o.v ? "border-primary bg-primary/15 text-primary" : "border-outline-variant bg-surface-container text-on-surface-variant"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container p-6">
        <label className="flex flex-col gap-1">
          <Label>Nombre del contacto</Label>
          <Input value={form.name} onChange={(e) => update("name", e.target.value)} required placeholder="Ej: Marcelo Nievas" />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required placeholder="capitan@club.com" />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Teléfono / WhatsApp</Label>
          <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} required placeholder="+54 9 ..." />
        </label>
        {type === "new" && (
          <label className="flex flex-col gap-1">
            <Label>Nombre de la organización (club / empresa)</Label>
            <Input value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} placeholder="Club Atlético Futsal" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <Label>Notas (opcional)</Label>
          <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Detalle o requisitos..." />
        </label>
      </div>

      <Button type="submit">Siguiente →</Button>
    </form>
  );
}