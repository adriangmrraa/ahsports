import { db } from "@/db/client";
import { materials } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { InsumosTable } from "./InsumosTable";

export default async function InsumosPage() {
  const rows = await db.select().from(materials).orderBy(desc(materials.createdAt)).limit(500);

  return (
    <>
      <PageHeader
        title="Materiales e insumos"
        subtitle={`${rows.length} materiales en el catálogo`}
        action={<LinkButton href="/admin/insumos/nuevo"><Plus className="w-4 h-4" /> Nuevo insumo</LinkButton>}
      />
      {rows.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">Sin materiales</p>
            <p className="text-sm text-on-surface-variant mb-4">Cargá telas, hilos, films DTF, papel sublimación, etc.</p>
            <LinkButton href="/admin/insumos/nuevo">Cargar primer material</LinkButton>
          </div>
        </Card>
      ) : (
        <InsumosTable rows={rows} />
      )}
    </>
  );
}