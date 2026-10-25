import { db } from "@/db/client";
import { suppliers } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { PageGuide } from "@/components/admin/PageGuide";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Plus } from "lucide-react";

export default async function ProveedoresPage() {
  const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name)).limit(500);

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle={`${rows.length} proveedores cargados`}
        action={<LinkButton href="/admin/proveedores/nuevo"><Plus className="w-4 h-4" /> Nuevo proveedor</LinkButton>}
      />
      <PageGuide
        what="Los proveedores son las textiles y casas de insumos a las que les comprás."
        whatFor="Asociá cada material con su proveedor para saber a quién pedirle y a qué precio."
        nextStep={{ href: "/admin/proveedores/nuevo", label: "Nuevo proveedor" }}
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="Sin proveedores"
          what="Sin proveedores no podés registrar de dónde viene cada material ni su costo de compra."
          whatFor="Cargá primero las textiles y casas de insumos que más uses."
          action={<LinkButton href="/admin/proveedores/nuevo">Cargar primer proveedor</LinkButton>}
        />
      ) : (
        <Card>
          <Table responsive>
            <THead>
              <tr>
                <TH>Nombre</TH>
                <TH>Contacto</TH>
                <TH>Teléfono</TH>
                <TH>Email</TH>
                <TH>Estado</TH>
                <TH align="right">Acciones</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD className="text-on-surface">
                    {s.name}
                    {s.contactName && <span className="block text-xs text-on-surface-variant">{s.contactName}</span>}
                  </TD>
                  <TD label="Contacto">{s.contactName ?? "—"}</TD>
                  <TD className="data-mono" label="Teléfono">{s.phone ?? "—"}</TD>
                  <TD label="Email">{s.email ?? "—"}</TD>
                  <TD label="Estado">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.active ? "bg-primary/10 border-primary/40 text-primary" : "border-outline-variant text-on-surface-variant"}`}>
                      {s.active ? "activo" : "inactivo"}
                    </span>
                  </TD>
                  <TD align="right"><LinkButton href={`/admin/proveedores/${s.id}`} variant="ghost" size="sm">Abrir →</LinkButton></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
