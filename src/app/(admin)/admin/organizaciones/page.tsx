import Link from "next/link";
import { db } from "@/db/client";
import { contacts, organizations } from "@/db/schema";
import { desc, eq, ilike, sql } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Building2, Plus, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";

const kindLabel: Record<string, string> = {
  club: "Club",
  empresa: "Empresa",
  colegio: "Colegio",
  institucion: "Institución",
  particular: "Particular",
};

export default async function OrganizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const filterKind = sp.kind && sp.kind in kindLabel ? sp.kind : undefined;
  const q = sp.q?.trim() || undefined;

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      kind: organizations.kind,
      createdAt: organizations.createdAt,
      contactCount: sql<number>`count(${contacts.id})`.as("contact_count"),
    })
    .from(organizations)
    .leftJoin(contacts, eq(contacts.organizationId, organizations.id))
    .where(
      filterKind && q
        ? sql`${organizations.kind} = ${filterKind} AND ${organizations.name} ILIKE ${"%" + q + "%"}`
        : filterKind
          ? eq(organizations.kind, filterKind as never)
          : q
            ? ilike(organizations.name, `%${q}%`)
            : undefined,
    )
    .groupBy(organizations.id, organizations.name, organizations.kind, organizations.createdAt)
    .orderBy(desc(organizations.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader
        title="Organizaciones"
        subtitle={`${rows.length} organizaciones en el sistema`}
        action={
          <LinkButton href="/admin/organizaciones/nuevo">
            <Plus className="w-4 h-4" /> Nueva organización
          </LinkButton>
        }
      />

      <form method="get" className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre..." className="pl-9" />
        </div>
        {filterKind && <input type="hidden" name="kind" value={filterKind} />}
        <button
          type="submit"
          className="rounded-md font-label-caps text-sm px-4 py-2 bg-surface-container-high text-on-surface border border-outline-variant hover:border-primary transition-colors"
        >
          Buscar
        </button>
      </form>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin">
        <Link
          href={q ? `/admin/organizaciones?q=${encodeURIComponent(q)}` : "/admin/organizaciones"}
          className={`label-caps px-3 py-1.5 rounded-md border transition-colors ${!filterKind ? "border-primary text-primary bg-primary/10" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}
        >
          Todas
        </Link>
        {Object.entries(kindLabel).map(([k, v]) => {
          const href = q
            ? `/admin/organizaciones?kind=${k}&q=${encodeURIComponent(q)}`
            : `/admin/organizaciones?kind=${k}`;
          return (
            <Link
              key={k}
              href={href}
              className={`label-caps px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${filterKind === k ? "border-primary text-primary bg-primary/10" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}
            >
              {v}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <Building2 className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="label-caps text-primary mb-2">Sin organizaciones</p>
            <p className="text-sm text-on-surface-variant mb-4">Cuando se creen organizaciones aparecerán acá.</p>
            <LinkButton href="/admin/organizaciones/nuevo">Crear la primera</LinkButton>
          </div>
        </Card>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Nombre</TH>
              <TH>Tipo</TH>
              <TH align="center">Contactos</TH>
              <TH>Alta</TH>
              <TH align="right">Acciones</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((o) => (
              <TR key={o.id}>
                <TD className="text-on-surface">{o.name}</TD>
                <TD className="text-on-surface-variant">{kindLabel[o.kind] ?? o.kind}</TD>
                <TD align="center">{Number(o.contactCount)}</TD>
                <TD className="text-on-surface-variant">{formatDate(o.createdAt)}</TD>
                <TD align="right">
                  <Link href={`/admin/organizaciones/${o.id}`} className="text-primary hover:underline label-caps">
                    Abrir →
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
