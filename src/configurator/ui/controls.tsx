"use client";

import { useRef, useState, type ReactNode } from "react";
import { FileImage, Plus, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HexColor } from "../model";

/**
 * Presentational controls for the shared garment configurator. All surfaces
 * (home, wizard step 4, admin) render the same dark, minimal chrome — the
 * viewer stays the protagonist, controls read as quiet secondary panels.
 */

export function ControlSection({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="label-caps text-[11px] font-semibold tracking-wider text-on-navy-variant">{title}</h3>
        {hint ? <span className="text-[10px] text-on-navy-variant/70">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1 rounded-md border border-navy-line bg-navy-900/60 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "min-h-9 flex-1 rounded-sm px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus",
            value === opt.value ? "bg-accent text-on-accent" : "text-on-navy-variant hover:text-on-navy",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const COLOR_INPUT_FALLBACK: HexColor = "#888888";

export function SwatchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HexColor;
  onChange: (value: HexColor) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-navy-line bg-navy-900/60 px-3 py-2">
      <span className="text-xs font-medium text-on-navy">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase text-on-navy-variant">{value}</span>
        <span className="relative h-8 w-8 overflow-hidden rounded-full border border-navy-line">
          <span aria-hidden className="absolute inset-0" style={{ backgroundColor: value }} />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : COLOR_INPUT_FALLBACK}
            onChange={(e) => onChange(e.target.value as HexColor)}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
      </span>
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-on-navy">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-10 w-full rounded-md border border-navy-line bg-navy-900/60 px-3 text-sm text-on-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type UploadedAsset = { id: string; url: string; name: string; kind: string };

export function AttachmentPanel({
  assets,
  onUpload,
  onRemove,
  busy,
  error,
  kinds,
}: {
  assets: readonly UploadedAsset[];
  onUpload: (file: File, kind: string) => void;
  onRemove: (id: string) => void;
  busy: boolean;
  error: string | null;
  kinds: readonly { value: string; label: string }[];
}) {
  const [kind, setKind] = useState(kinds[0]?.value ?? "diseno_pedido");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      {assets.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-navy-line bg-navy-900/60 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            {/\.(png|jpe?g|svg|webp)(\?|$)/i.test(a.url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.name} className="h-10 w-10 shrink-0 rounded-md border border-navy-line bg-white object-contain" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy-800 text-on-navy-variant">
                <FileImage className="h-5 w-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-on-navy">{a.name}</p>
              <p className="text-[10px] text-on-navy-variant">{kinds.find((k) => k.value === a.kind)?.label ?? a.kind}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Quitar ${a.name}`}
            className="inline-flex min-h-9 items-center justify-center rounded-sm px-2 text-xs text-error transition-colors hover:bg-error/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Tipo de archivo"
          className="min-h-10 flex-1 rounded-md border border-navy-line bg-navy-900/60 px-3 text-xs text-on-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <label
          className={cn(
            "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-navy-line bg-navy-900/60 px-4 text-xs font-semibold text-on-navy-variant transition-colors",
            busy ? "pointer-events-none opacity-60" : "hover:border-accent/60 hover:text-on-navy",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file, kind);
              e.target.value = "";
            }}
          />
          {busy ? <UploadCloud className="h-4 w-4 animate-pulse" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {busy ? "Subiendo…" : "Adjuntar"}
        </label>
      </div>
      {error ? <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p> : null}
    </div>
  );
}
