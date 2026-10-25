"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  GarmentConfigurator,
  type ConfiguratorFabric,
  type ConfiguratorProduct,
  type ConfiguratorState,
  type GarmentConfig,
  type GarmentConfiguratorHandle,
} from "@/configurator";
import type { GarmentConfigInput } from "@/configurator/model";
import { uploadAttachment } from "@/app/actions/attachments";
import { recordOrderDesignRender, saveOrderDesignRevision } from "@/app/actions/configurator";
import { formatDateTime } from "@/lib/utils";
import { Camera, History, Save } from "lucide-react";

type RevisionRow = {
  id: string;
  revisionNo: number;
  source: string;
  note: string | null;
  createdAt: string;
};

type RenderRow = {
  id: string;
  revisionNo: number | null;
  view: string;
  createdAt: string;
  url: string | null;
};

/**
 * Admin design surface: the same GarmentConfigurator as home/wizard. Saving
 * never mutates — it appends an immutable revision and repoints the order
 * line. Renders are captured PNG frames stored as order attachments with
 * revision provenance in design_renders.
 */
export function OrderDesignEditor({
  orderId,
  orderLineId,
  orderNumber,
  product,
  fabrics,
  initialConfig,
  initialAssets,
  currentRevisionNo,
  revisions,
  renders,
}: {
  orderId: string;
  orderLineId: string;
  orderNumber: number;
  product: ConfiguratorProduct;
  fabrics: readonly ConfiguratorFabric[];
  initialConfig: GarmentConfig | null;
  initialAssets: readonly { id: string; url: string; name: string; kind: string }[];
  currentRevisionNo: number;
  revisions: RevisionRow[];
  renders: RenderRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renderPending, startRenderTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const configuratorRef = useRef<GarmentConfiguratorHandle>(null);
  const latest = useRef<ConfiguratorState | null>(null);

  const onStateChange = useCallback((s: ConfiguratorState) => {
    latest.current = s;
  }, []);

  const adminUpload = useCallback(
    async (file: File, kind: string) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await uploadAttachment(orderId, form);
      if (!res.ok) throw new Error(res.error);
      return { id: res.id, url: res.url, name: res.name, kind: res.kind };
    },
    [orderId],
  );

  function saveRevision() {
    setError(null);
    setNotice(null);
    const config: GarmentConfigInput | undefined = latest.current?.config ?? initialConfig ?? undefined;
    startTransition(async () => {
      const res = await saveOrderDesignRevision(orderLineId, config);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`Revisión ${res.revisionNo} guardada — el historial quedó intacto.`);
      router.refresh();
    });
  }

  function saveRender() {
    setError(null);
    setNotice(null);
    startRenderTransition(async () => {
      const blob = await configuratorRef.current?.captureImage("image/png");
      if (!blob) {
        setError("No se pudo capturar la vista actual");
        return;
      }
      const view = latest.current?.config.view ?? "front";
      const file = new File([blob], `pedido-${orderNumber}-rev${currentRevisionNo}-${view}.png`, { type: "image/png" });
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "diseno_pedido");
      form.append("name", `Render ${view} · rev. ${currentRevisionNo}`);
      const up = await uploadAttachment(orderId, form);
      if (!up.ok) {
        setError(up.error);
        return;
      }
      const rec = await recordOrderDesignRender(orderLineId, view, up.id);
      if (!rec.ok) {
        setError(rec.error);
        return;
      }
      // Also hand the operator the PNG directly — "generar y descargar".
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Render guardado en el pedido y descargado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card
        title={`Diseño 3D · ${product.name}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {currentRevisionNo > 0 && <Badge tone="muted">rev. {currentRevisionNo}</Badge>}
            <Button size="sm" variant="secondary" disabled={renderPending} onClick={saveRender}>
              <Camera className="w-3.5 h-3.5" /> {renderPending ? "Capturando…" : "Guardar render"}
            </Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={saveRevision}>
              <Save className="w-3.5 h-3.5" /> {pending ? "Guardando…" : "Guardar revisión"}
            </Button>
          </div>
        }
      >
        <GarmentConfigurator
          ref={configuratorRef}
          mode="admin"
          products={[product]}
          fabrics={fabrics}
          lockProductId={product.id}
          initialConfig={initialConfig}
          initialAssets={initialAssets}
          uploader={adminUpload}
          onStateChange={onStateChange}
          showExport
        />
        <p className="text-xs text-on-surface-variant mt-3">
          Los archivos cargados acá quedan como adjuntos del pedido (tipo Diseño/Sponsor).
          Guardar crea una revisión nueva — las anteriores nunca se editan.
        </p>
        {error && <p className="text-sm text-error mt-3">{error}</p>}
        {notice && <p className="text-sm text-success mt-3">{notice}</p>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={<span className="inline-flex items-center gap-2"><History className="w-4 h-4" /> Revisiones</span>}>
          {revisions.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">
              Todavía no hay revisiones — la primera se crea al guardar.
            </p>
          ) : (
            <ul className="space-y-2">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-on-surface">
                    Rev. {r.revisionNo}
                    {r.revisionNo === currentRevisionNo && <Badge tone="primary" className="ml-2">vigente</Badge>}
                  </span>
                  <span className="flex-1 truncate text-on-surface-variant">{r.note ?? r.source}</span>
                  <span className="data-mono text-xs text-on-surface-variant">{formatDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Renders guardados">
          {renders.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">
              Sin renders todavía — capturá la vista actual con “Guardar render”.
            </p>
          ) : (
            <ul className="space-y-2">
              {renders.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-on-surface">
                    Vista {r.view}{r.revisionNo != null ? ` · rev. ${r.revisionNo}` : ""}
                  </span>
                  <span className="data-mono text-xs text-on-surface-variant">{formatDateTime(r.createdAt)}</span>
                  {r.url ? (
                    <a href={r.url} download target="_blank" rel="noreferrer" className="text-[11px] label-caps text-primary hover:underline">
                      Descargar
                    </a>
                  ) : (
                    <span className="text-xs text-on-surface-variant">sin archivo</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
