"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, FileImage, Plus, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { beginPublicUploadSession, uploadAttachmentFromPublic } from "@/app/actions/public-orders";

const KINDS = [
  { value: "identidad_organizacion", label: "Logo / Identidad" },
  { value: "sponsor", label: "Sponsor" },
  { value: "diseno_pedido", label: "Diseño del pedido" },
  { value: "personalizacion_individual", label: "Personalización individual" },
  { value: "documento_operativo", label: "Documento operativo" },
  { value: "produccion_calidad", label: "Producción / Calidad" },
] as const;

type Uploaded = { id: string; url: string; name: string; kind: string };

/**
 * F4-11 — Paso 4 form: subir archivos (cada uno en su card). Estado de ids vía
 * search params al paso 5. Multi-upload con botón "+".
 */
export function Step4Form({ initialParams }: { initialParams: Record<string, string | undefined> }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; secret: string } | null>(() => {
    const id = initialParams.uploadSessionId;
    const secret = initialParams.uploadSessionSecret;
    return id && secret ? { id, secret } : null;
  });
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (session) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await beginPublicUploadSession();
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      else setSession({ id: result.id, secret: result.secret });
    });
    return () => { cancelled = true; };
  }, [session, startTransition]);

  async function onFile(file: File) {
    if (!session) {
      setError("La sesión de carga todavía no está lista. Intentá nuevamente.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "identidad_organizacion");
    const res = await uploadAttachmentFromPublic(form, {
      uploadSessionId: session.id,
      uploadSessionSecret: session.secret,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUploads((u) => [...u, { id: res.id, url: res.url, name: res.name, kind: res.kind }]);
  }

  function goNext(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    const ids = uploads.map((u) => u.id);
    if (ids.length) params.set("files", ids.join(","));
    if (!session) {
      setError("No se pudo validar la sesión de carga. Recargá este paso.");
      return;
    }
    params.set("uploadSessionId", session.id);
    params.set("uploadSessionSecret", session.secret);
    router.push(`/presupuesto/5?${params.toString()}`);
  }

  const fileInput = (
    <input
      type="file"
      className="sr-only"
      accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
      onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      disabled={busy}
    />
  );

  return (
    <form onSubmit={goNext} className="flex w-full flex-col gap-6">
      {uploads.length === 0 ? (
        <label className="animate-rise group flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-outline-variant bg-surface-container px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-surface-container-high focus-within:outline focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2">
          {fileInput}
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-100 text-navy-700 transition-colors group-hover:bg-primary group-hover:text-accent">
            <UploadCloud className="h-7 w-7" strokeWidth={1.6} aria-hidden />
          </span>
          <span className="text-sm font-semibold text-primary">
            {busy ? "Subiendo…" : "Agregar archivo"}
          </span>
          <span className="max-w-xs text-xs leading-5 text-on-surface-variant">
            Escudo, logo, sponsor o planilla. PNG, JPG, SVG, WebP o PDF.
          </span>
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          {uploads.map((u, i) => (
            <div
              key={u.id}
              className="animate-rise flex flex-col items-stretch gap-3 rounded-2xl border border-outline-variant bg-surface-container p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="flex min-w-0 items-center gap-3">
                {u.kind === "identidad_organizacion" || u.url.match(/\.(png|jpe?g|svg|webp)(\?|$)/i) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.url} alt={u.name} className="h-12 w-12 shrink-0 rounded-lg border border-outline-variant bg-white object-contain" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-700">
                    <FileImage className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{u.name}</p>
                  <p className="mt-0.5">
                    <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-[11px] font-semibold text-navy-700">
                      {KINDS.find((k) => k.value === u.kind)?.label ?? u.kind}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}
                aria-label={`Quitar ${u.name}`}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm text-error transition-colors hover:bg-error/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X className="h-4 w-4" aria-hidden /> Quitar
              </button>
            </div>
          ))}
          <label className="label-caps inline-flex min-h-11 w-fit cursor-pointer items-center justify-center gap-1.5 rounded-full border border-outline-variant bg-surface-container px-5 text-on-surface-variant transition-colors hover:border-primary/50 hover:text-primary focus-within:outline focus-within:outline-2 focus-within:outline-focus">
            {fileInput}
            <Plus className="h-4 w-4" aria-hidden />
            {busy ? "Subiendo…" : "Agregar más"}
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus sm:justify-start"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </button>
        <Button type="submit" size="lg" disabled={!session || busy} className="border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent">
          Revisar y confirmar →
        </Button>
      </div>
    </form>
  );
}
