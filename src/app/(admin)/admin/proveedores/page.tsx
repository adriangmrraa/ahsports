import { db } from "@/db/client";
import { suppliers } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
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
      {rows.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">Sin proveedores</p>
            <p className="text-sm text-on-surface-variant mb-4">Cargá las textiles y casas de insumos con sus datos de contacto.</p>
            <LinkButton href="/admin/proveedores/nuevo">Cargar primer proveedor</LinkButton>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
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
                  <TD>{s.contactName ?? "—"}</TD>
                  <TD className="data-mono">{s.phone ?? "—"}</TD>
                  <TD>{s.email ?? "—"}</TD>
                  <TD>
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
