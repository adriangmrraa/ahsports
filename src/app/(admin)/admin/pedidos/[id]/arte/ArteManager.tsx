"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { uploadAttachment } from "@/app/actions/attachments";
import { File, FileText } from "lucide-react";

export type AttachmentDTO = {
  id: string;
  kind: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string;
  status: string;
  createdAt: string;
};

export const KIND_LABEL: Record<string, string> = {
  identidad_organizacion: "Identidad",
  sponsor: "Sponsor",
  diseno_pedido: "Diseño",
  personalizacion_individual: "Personalización",
  documento_operativo: "Documento",
  produccion_calidad: "Calidad",
};

const STATUS_TONE: Record<string, "warning" | "success" | "tertiary" | "error" | "muted"> = {
  pendiente_revision: "warning",
  aprobado: "success",
  requiere_reemplazo: "tertiary",
  rechazado: "error",
  archivado: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  pendiente_revision: "Pendiente",
  aprobado: "Aprobado",
  requiere_reemplazo: "Reemplazo",
  rechazado: "Rechazado",
  archivado: "Archivado",
};

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

function formatSize(bytes: number | null) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function ArteManager({
  orderId,
  initial,
  counts,
}: {
  orderId: string;
  initial: AttachmentDTO[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patchStatus(id: string, status: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/attachments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error actualizando estado");
        return;
      }
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Eliminar "${name}"? Solo sin aplicaciones asociadas.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error eliminando");
        return;
      }
      router.refresh();
    });
  }

  async function submitUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await uploadAttachment(orderId, form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card title="Subir archivo">
        <form onSubmit={submitUpload} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Field label="Archivo" hint="PNG, JPG, SVG, WEBP, PDF, PS, AI · máx 5MB">
            <Input type="file" name="file" required />
          </Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue="diseno_pedido" required>
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre" hint="Opcional (usa el original)">
            <Input name="name" maxLength={255} placeholder="Logo frente" />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Subiendo..." : "Subir"}</Button>
        </form>
        {error && <p className="text-sm text-error mt-3">{error}</p>}
      </Card>

      {initial.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant text-center py-6">Sin adjuntos. Subí el primero arriba.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {initial.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <div className="flex items-center justify-center rounded bg-surface-container-low min-h-[140px] mb-3 overflow-hidden">
                {isImage(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="max-h-[180px] object-contain" />
                ) : a.mimeType === "application/pdf" ? (
                  <FileText className="w-12 h-12 text-on-surface-variant" />
                ) : (
                  <File className="w-12 h-12 text-on-surface-variant" />
                )}
              </div>
              <p className="text-sm text-on-surface font-bold truncate" title={a.name}>{a.name}</p>
              <p className="text-xs text-on-surface-variant data-mono mb-2">
                {formatSize(a.sizeBytes)} · {new Date(a.createdAt).toLocaleDateString("es-AR")}
              </p>
              <div className="flex gap-2 flex-wrap mb-3">
                <Badge tone="muted">{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                <Badge tone={STATUS_TONE[a.status] ?? "muted"}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
              </div>
              <Link
                href={`/admin/pedidos/${orderId}/arte/${a.id}`}
                className="text-[11px] label-caps text-primary hover:underline mb-3"
              >
                {counts[a.id] ?? 0} aplicaciones →
              </Link>
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => patchStatus(a.id, "aprobado")}>Aprobar</Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => patchStatus(a.id, "rechazado")}>Rechazar</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => patchStatus(a.id, "requiere_reemplazo")}>Pedir reemplazo</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => patchStatus(a.id, "archivado")}>Archivar</Button>
              </div>
              <Button size="sm" variant="danger" className="mt-2" disabled={pending} onClick={() => remove(a.id, a.name)}>
                Eliminar
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
