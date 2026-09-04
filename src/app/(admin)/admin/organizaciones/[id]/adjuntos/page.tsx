import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { attachments, organizations } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { ArrowLeft, File, FileText } from "lucide-react";
import { KIND_LABEL } from "@/app/(admin)/admin/pedidos/[id]/arte/ArteManager";
import { CopyToOrderButton, type OpenOrder } from "./CopyToOrderButton";
import { listOpenOrgOrders } from "@/app/actions/attachments";
import { attachmentKindSchema } from "@/lib/validators";

export default async function BibliotecaOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) notFound();

  const kindFilter = attachmentKindSchema.safeParse(sp.kind).success ? (sp.kind as string) : undefined;

  const conds = [
    eq(attachments.organizationId, id),
    isNull(attachments.orderId),
    eq(attachments.status, "aprobado"),
  ];
  if (kindFilter) conds.push(eq(attachments.kind, kindFilter as never));
  const library = await db
    .select()
    .from(attachments)
    .where(and(...conds))
    .orderBy(desc(attachments.createdAt));

  const openOrders: OpenOrder[] = await listOpenOrgOrders(id);

  const chips: Array<{ value?: string; label: string }> = [
    { label: "Todos" },
    ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href={`/admin/organizaciones/${org.id}`} className="text-on-surface-variant hover:text-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            Biblioteca · {org.name}
          </span>
        }
        subtitle="Archivos aprobados sin pedido (orderId NULL). Copiar comparte el archivo, no lo duplica."
        action={
          <LinkButton href={`/admin/organizaciones/${org.id}`} variant="secondary" size="sm">
            Volver a la organización
          </LinkButton>
        }
      />

      <div className="flex gap-2 flex-wrap mb-6">
        {chips.map((c) => {
          const active = (c.value ?? undefined) === kindFilter;
          return (
            <LinkButton
              key={c.label}
              href={c.value ? `/admin/organizaciones/${org.id}/adjuntos?kind=${c.value}` : `/admin/organizaciones/${org.id}/adjuntos`}
              variant={active ? "primary" : "secondary"}
              size="sm"
            >
              {c.label}
            </LinkButton>
          );
        })}
      </div>

      {library.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant text-center py-6">
            Sin archivos aprobados en la biblioteca{kindFilter ? " para este filtro" : ""}.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {library.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <div className="flex items-center justify-center rounded bg-surface-container-low min-h-[120px] mb-3 overflow-hidden">
                {a.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="max-h-[160px] object-contain" />
                ) : a.mimeType === "application/pdf" ? (
                  <FileText className="w-10 h-10 text-on-surface-variant" />
                ) : (
                  <File className="w-10 h-10 text-on-surface-variant" />
                )}
              </div>
              <p className="text-sm text-on-surface font-bold truncate" title={a.name}>{a.name}</p>
              <div className="flex gap-2 flex-wrap my-2">
                <Badge tone="muted">{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                <Badge tone="success">aprobado</Badge>
              </div>
              <div className="mt-auto pt-2 border-t border-outline-variant">
                <CopyToOrderButton attachmentId={a.id} attachmentName={a.name} orders={openOrders} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
