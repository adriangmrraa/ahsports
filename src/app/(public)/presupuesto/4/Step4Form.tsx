"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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

  return (
    <form onSubmit={goNext} className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {uploads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container p-4 text-center sm:p-8">
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md px-3 focus-within:outline focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2">
            <input
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              disabled={busy}
            />
            <span className="text-sm font-medium text-primary">
              {busy ? "Subiendo…" : "＋ Agregar archivo (escudo, logo, sponsor, planilla)"}
            </span>
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {uploads.map((u) => (
            <div key={u.id} className="flex flex-col items-stretch gap-3 rounded-xl border border-outline-variant bg-surface-container p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <img src={u.url} alt={u.name} className="h-10 w-10 rounded object-contain bg-white" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-on-surface-variant">{KINDS.find((k) => k.value === u.kind)?.label ?? u.kind}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}
                className="min-h-11 rounded-md px-3 text-left text-sm text-red-400 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus sm:text-center"
              >
                Quitar
              </button>
            </div>
          ))}
          <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1 rounded-xl border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container focus-within:outline focus-within:outline-2 focus-within:outline-focus sm:w-auto">
            <input
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              disabled={busy}
            />
            ＋ Agregar más
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => router.back()} className="text-sm text-on-surface-variant hover:text-on-surface">
          ← Volver
        </button>
        <Button type="submit" disabled={!session || busy}>Revisar y confirmar →</Button>
      </div>
    </form>
  );
}
