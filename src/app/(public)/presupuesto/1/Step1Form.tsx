"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, UserPlus } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updateConfiguratorDraftPayload } from "@/app/actions/configurator";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "new", label: "Soy nuevo", hint: "Primer pedido con AH Sports", icon: UserPlus },
  { value: "returning", label: "Ya soy cliente", hint: "Ya pedimos antes", icon: BadgeCheck },
] as const;

/**
 * F4-08 — Paso 1: tipo de cliente + datos del contacto.
 * Estado en search params de la URL; el continue arma /presupuesto/2?...params
 */
export function Step1Form({
  draftToken,
  initialType = "new",
  initial,
}: {
  draftToken: string;
  initialType?: "new" | "returning";
  initial?: { name: string; email: string; phone: string; organizationName: string; notes: string };
}) {
  const router = useRouter();
  const [type, setType] = useState<"new" | "returning">(initialType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    organizationName: initial?.organizationName ?? "",
    notes: initial?.notes ?? "",
  });

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function goNext(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // Flow state goes to the draft — the URL only carries the `d` token.
    const res = await updateConfiguratorDraftPayload(draftToken, {
      type,
      name: form.name,
      email: form.email,
      phone: form.phone,
      organizationName: form.organizationName || undefined,
      notes: form.notes || undefined,
      step: 1,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/presupuesto/2?d=${encodeURIComponent(draftToken)}`);
  }

  return (
    <form onSubmit={goNext} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* Tipo — cards seleccionables */}
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Tipo de cliente">
        {TYPE_OPTIONS.map((o, i) => {
          const Icon = o.icon;
          const active = type === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setType(o.value)}
              aria-pressed={active}
              className={cn(
                "hover-lift animate-rise flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
                active
                  ? "border-primary bg-surface-container ring-2 ring-primary/25"
                  : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary/40",
              )}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary text-accent" : "bg-navy-100 text-navy-700",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", active ? "text-primary" : "text-on-surface")}>{o.label}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="animate-rise flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container p-5 shadow-sm sm:p-7" style={{ animationDelay: "150ms" }}>
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

      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <Button type="submit" size="lg" disabled={saving} className="animate-rise border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent" style={{ animationDelay: "280ms" }}>
        {saving ? "Guardando…" : "Siguiente →"}
      </Button>
    </form>
  );
}
