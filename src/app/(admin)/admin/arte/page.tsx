import Link from "next/link";
import { db } from "@/db/client";
import { attachments, orders, organizations } from "@/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";
import { PageHeader, Badge } from "@/components/ui/Card";

export const metadata = { title: "Arte global · AH Sports" };

const KIND_LABEL: Record<string, string> = {
  identidad_organizacion: "Logo",
  sponsor: "Sponsor",
  diseno_pedido: "Diseño pedido",
  personalizacion_individual: "Personalización",
  documento_operativo: "Doc. operativo",
  produccion_calidad: "Producción/Calidad",
};

const STATUS_LABEL: Record<string, string> = {
  pendiente_revision: "Pendiente",
  aprobado: "Aprobado",
  requiere_reemplazo: "Requiere reemplazo",
  rechazado: "Rechazado",
  archivado: "Archivado",
};

/**
 * F4-16 — /admin/arte: listado global de adjuntos con filtros por kind/status.
 */
export default async function ArteGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const sp = await searchParams;

  const conditions = [];
  if (sp.kind) conditions.push(eq(attachments.kind, sp.kind as never));
  if (sp.status) conditions.push(eq(attachments.status, sp.status as never));

  const rows = await db
    .select()
    .from(attachments)
    .where(conditions.length ? or(...conditions) : undefined)
    .orderBy(desc(attachments.createdAt))
    .limit(200);

  const orderIds = [...new Set(rows.map((r) => r.orderId).filter((v): v is string => !!v))];
  const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((v): v is string => !!v))];
  const [ordersMap, orgsMap] = await Promise.all([
    orderIds.length ? db.select({ id: orders.id, number: orders.number }).from(orders).where(inArray(orders.id, orderIds)) : Promise.resolve([]),
    orgIds.length ? db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds)) : Promise.resolve([]),
  ]);
  const orderNumber = new Map(ordersMap.map((o) => [o.id, o.number]));
  const orgName = new Map(orgsMap.map((o) => [o.id, o.name]));

  return (
    <div className="p-6">
      <PageHeader title="Arte global" subtitle="Todos los adjuntos del sistema" />

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <select name="kind" className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm">
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v} selected={sp.kind === v}>{l}</option>
          ))}
        </select>
        <select name="status" className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v} selected={sp.status === v}>{l}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-surface-container-high px-4 py-1.5 text-sm">
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant">
        <table className="w-full text-sm">
          <thead className="border-b border-outline-variant bg-surface-container text-left text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Pedido</th>
              <th className="px-3 py-2 font-medium">Organización</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-outline-variant/50 last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {a.mimeType?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="h-8 w-8 rounded bg-white object-contain" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded bg-surface-container-high text-xs">📄</span>
                    )}
                    <span className="font-medium">{a.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2"><Badge>{KIND_LABEL[a.kind] ?? a.kind}</Badge></td>
                <td className="px-3 py-2"><Badge>{STATUS_LABEL[a.status] ?? a.status}</Badge></td>
                <td className="px-3 py-2">
                  {a.orderId ? <Link href={`/admin/pedidos/${a.orderId}`} className="text-primary hover:underline">#{orderNumber.get(a.orderId)}</Link> : <span className="text-on-surface-variant">—</span>}
                </td>
                <td className="px-3 py-2">{a.organizationId ? orgName.get(a.organizationId) ?? "—" : "—"}</td>
                <td className="px-3 py-2 text-on-surface-variant">{new Date(a.createdAt).toLocaleDateString("es-AR")}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-on-surface-variant">Sin adjuntos. Subí uno desde un pedido.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}