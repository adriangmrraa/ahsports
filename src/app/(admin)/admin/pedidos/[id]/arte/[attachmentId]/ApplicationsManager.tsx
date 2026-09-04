"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { addApplication } from "@/app/actions/attachments";
import { formatCurrency } from "@/lib/utils";

export type AppLine = { id: string; productName: string; zones: string[] };
export type AppTechnique = { id: string; name: string; costPerSquareMeter: string; setupCost: string };
export type AppRow = {
  id: string;
  zone: string;
  view: string;
  techniqueId: string | null;
  techniqueName: string | null;
  techniqueCostPerSqm: number | null;
  techniqueSetup: number | null;
  widthCm: string | null;
  heightCm: string | null;
  quantity: number;
  instructions: string | null;
};

const VIEWS = ["frente", "espalda", "lateral", "manga", "otro"] as const;

export function ApplicationsManager({
  attachmentId,
  initial,
  lines,
  techniques,
}: {
  attachmentId: string;
  initial: AppRow[];
  lines: AppLine[];
  techniques: AppTechnique[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const [zone, setZone] = useState("");
  const [view, setView] = useState<string>("frente");
  const [techniqueId, setTechniqueId] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [instructions, setInstructions] = useState("");

  const activeLine = lines.find((l) => l.id === lineId);
  const zones = activeLine?.zones ?? [];
  const tech = techniques.find((t) => t.id === techniqueId);

  const estimate = useMemo(() => {
    if (!tech) return null;
    const cpsm = Number(tech.costPerSquareMeter);
    const setup = Number(tech.setupCost);
    const w = Number(width);
    const h = Number(height);
    const q = Number(quantity);
    if (!cpsm || !w || !h || !q) return null;
    const areaM2 = (w * h) / 10000;
    return q * areaM2 * cpsm + setup;
  }, [tech, width, height, quantity]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const payload = {
      orderLineId: lineId || null,
      zone,
      view: view as (typeof VIEWS)[number],
      techniqueId: techniqueId || null,
      widthCm: width ? Number(width) : null,
      heightCm: height ? Number(height) : null,
      quantity: Number(quantity) || 1,
      instructions: instructions || null,
    };
    startTransition(async () => {
      const r = await addApplication(attachmentId, payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setZone("");
      setInstructions("");
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Eliminar esta aplicación?")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error eliminando");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        {initial.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">Sin aplicaciones. Agregá la primera abajo.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Zona</TH>
                <TH>Vista</TH>
                <TH>Técnica</TH>
                <TH align="right">Medidas</TH>
                <TH align="center">Cant.</TH>
                <TH align="right">Costo est.</TH>
                <TH align="right">Acciones</TH>
              </tr>
            </THead>
            <tbody>
              {initial.map((a) => {
                const w = a.widthCm ? Number(a.widthCm) : null;
                const h = a.heightCm ? Number(a.heightCm) : null;
                const est =
                  a.techniqueCostPerSqm && w && h
                    ? a.quantity * ((w * h) / 10000) * a.techniqueCostPerSqm + (a.techniqueSetup ?? 0)
                    : null;
                return (
                  <TR key={a.id}>
                    <TD className="text-on-surface">{a.zone}</TD>
                    <TD>{a.view}</TD>
                    <TD>{a.techniqueName ?? "-"}</TD>
                    <TD align="right">{w && h ? `${w}×${h} cm` : "-"}</TD>
                    <TD align="center">{a.quantity}</TD>
                    <TD align="right">{est != null ? formatCurrency(est) : "-"}</TD>
                    <TD align="right">
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(a.id)}>
                        Eliminar
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Agregar aplicación">
        {lines.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">
            El pedido no tiene líneas. Agregá una línea antes de ubicar este archivo.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Línea del pedido">
                <Select value={lineId} onChange={(e) => { setLineId(e.target.value); setZone(""); }}>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>{l.productName}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Zona" hint={zones.length ? `Zonas del producto: ${zones.join(", ")}` : "Zona libre (producto sin zonas)"}>
                {zones.length > 0 ? (
                  <Select value={zone} onChange={(e) => setZone(e.target.value)} required>
                    <option value="">Elegir zona…</option>
                    {zones.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </Select>
                ) : (
                  <Input value={zone} onChange={(e) => setZone(e.target.value)} required placeholder="frente" maxLength={64} />
                )}
              </Field>
              <Field label="Vista">
                <Select value={view} onChange={(e) => setView(e.target.value)}>
                  {VIEWS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Field label="Técnica">
                <Select value={techniqueId} onChange={(e) => setTechniqueId(e.target.value)}>
                  <option value="">Sin técnica…</option>
                  {techniques.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Ancho (cm)"><Input type="number" step="0.5" min="0" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="8" /></Field>
              <Field label="Alto (cm)"><Input type="number" step="0.5" min="0" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="8" /></Field>
              <Field label="Cantidad"><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></Field>
            </div>
            <Field label="Instrucciones">
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} placeholder="Opcional" />
            </Field>
            {estimate != null && (
              <p className="text-sm text-on-surface-variant">
                Costo estimado: <span className="text-on-surface font-bold">{formatCurrency(estimate)}</span>
              </p>
            )}
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>{pending ? "Guardando..." : "Agregar aplicación"}</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

export function AppStatusBadge({ status }: { status: string }) {
  const tone = status === "aprobado" ? "success" : status === "rechazado" ? "error" : status === "pendiente_revision" ? "warning" : "muted";
  return <Badge tone={tone as never}>{status}</Badge>;
}
