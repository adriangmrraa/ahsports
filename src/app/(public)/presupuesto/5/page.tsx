import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Step5Form } from "./Step5Form";
import { StepIndicator } from "../_components/StepIndicator";

export const metadata = { title: "Presupuesto · Paso 5 · AH Sports" };

function parseLineItems(raw: string | undefined): { talle: string; name: string; number: string }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .filter(Boolean)
    .map((r) => {
      const [talle, name, number] = r.split("|");
      return { talle, name: name ?? "", number: number ?? "" };
    });
}

/**
 * F4-12 — Paso 5: confirmación + resumen + costo estimado.
 * Muestra el resumen del flujo y el form confirma → createPublicOrder.
 */
export default async function PresupuestoStep5({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (!sp.productId || !sp.lineItems) redirect("/presupuesto/2");

  const [product] = await db.select().from(products).where(eq(products.id, sp.productId)).limit(1);
  const items = parseLineItems(sp.lineItems);

  const contactInfo = {
    name: sp.name ?? "",
    email: sp.email ?? "",
    phone: sp.phone ?? "",
    org: sp.org ?? "",
  };

  return (
    <div className="px-4 py-10">
      <StepIndicator current={5} />
      <h1 className="mb-6 mt-6 text-center text-2xl font-bold tracking-tight">Confirmá tu solicitud</h1>
      <Step5Form
        productName={sp.productName ?? product?.name ?? "Producto"}
        items={items}
        total={items.length}
        contactInfo={contactInfo}
        type={(sp.type as "new" | "returning") ?? "new"}
        notes={sp.notes}
        fileIds={sp.files ? sp.files.split(",").filter(Boolean) : undefined}
      />
    </div>
  );
}