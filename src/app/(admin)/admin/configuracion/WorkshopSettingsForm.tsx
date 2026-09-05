"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/app/actions/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const FIELDS = [
  { key: "taller_nombre", label: "Nombre del taller" },
  { key: "taller_cbu", label: "CBU" },
  { key: "taller_contacto_email", label: "Email de contacto" },
  { key: "taller_contacto_phone", label: "Teléfono de contacto" },
  { key: "taller_direccion", label: "Dirección" },
] as const;

function settingValue(initial: Record<string, unknown>, key: string): string {
  const v = initial[key];
  return typeof v === "string" ? v : (v ?? "") as string;
}

export function WorkshopSettingsForm({ initial }: { initial: Record<string, unknown> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, settingValue(initial, f.key)])),
  );

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      for (const f of FIELDS) {
        const res = await updateSetting({ key: f.key, value: values[f.key] ?? "" });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-on-surface-variant">{f.label}</span>
            <Input
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.label}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {saved && <p className="text-sm text-success">Datos del taller guardados.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar datos del taller"}
        </Button>
      </div>
    </form>
  );
}
