"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/app/actions/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  WEEKDAY_LABELS,
  parseBusinessHours,
  type DaySlot,
} from "@/lib/business-hours";

const FIELDS = [
  { key: "business.name", label: "Nombre del negocio" },
  { key: "business.address", label: "Dirección" },
  {
    key: "business.whatsapp_phone",
    label: "WhatsApp público (para CTA wa.me)",
  },
  { key: "business.instagram", label: "Instagram (sin @)" },
  { key: "business.website", label: "Sitio web" },
  { key: "business.description", label: "Descripción corta" },
] as const;

function settingValue(initial: Record<string, unknown>, key: string): string {
  const v = initial[key];
  return typeof v === "string" ? v : ((v ?? "") as string);
}

const DEFAULT_SLOT: DaySlot = { open: false, openTime: "", closeTime: "" };

/**
 * A-16 — Identidad pública del negocio (`business.*` settings). Horarios se
 * persisten como el array admin de SocialCRM
 * [{ day, open, openTime, closeTime }] — `formatBusinessHours` lo renderiza.
 */
export function BusinessSettingsForm({
  initial,
}: {
  initial: Record<string, unknown>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map((f) => [f.key, settingValue(initial, f.key)])
    )
  );
  const [hours, setHours] = useState<DaySlot[]>(() =>
    parseBusinessHours(initial["business.hours"]).map(
      (slot) => slot ?? { ...DEFAULT_SLOT }
    )
  );

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const hoursPayload = hours.map((slot, idx) => ({
      day: WEEKDAY_LABELS[idx],
      open: slot.open,
      openTime: slot.openTime,
      closeTime: slot.closeTime,
    }));
    startTransition(async () => {
      for (const f of FIELDS) {
        const res = await updateSetting({
          key: f.key,
          value: values[f.key] ?? "",
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      const res = await updateSetting({
        key: "business.hours",
        value: hoursPayload,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function setDay(idx: number, patch: Partial<DaySlot>) {
    setHours((current) =>
      current.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot))
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-on-surface-variant">{f.label}</span>
            <Input
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
              placeholder={f.label}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-on-surface-variant">
          Horarios de atención (se muestran en /api/business y CTAs)
        </span>
        <div className="flex flex-col gap-1">
          {WEEKDAY_LABELS.map((day, idx) => (
            <div key={day} className="flex items-center gap-3 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input
                  type="checkbox"
                  checked={hours[idx]?.open ?? false}
                  onChange={(e) => setDay(idx, { open: e.target.checked })}
                />
                {day}
              </label>
              <Input
                type="time"
                className="w-28"
                disabled={!hours[idx]?.open}
                value={hours[idx]?.openTime ?? ""}
                onChange={(e) => setDay(idx, { openTime: e.target.value })}
              />
              <span className="text-on-surface-variant">a</span>
              <Input
                type="time"
                className="w-28"
                disabled={!hours[idx]?.open}
                value={hours[idx]?.closeTime ?? ""}
                onChange={(e) => setDay(idx, { closeTime: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {saved && (
        <p className="text-sm text-success">Identidad del negocio guardada.</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar identidad del negocio"}
        </Button>
      </div>
    </form>
  );
}
