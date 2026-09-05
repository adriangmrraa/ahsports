import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products, sizes } from "@/db/schema";
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
  if (!sp.uploadSessionId || !sp.uploadSessionSecret) redirect("/presupuesto/4");

  const [product] = await db.select().from(products).where(eq(products.id, sp.productId)).limit(1);
  if (!product || !product.active) redirect("/presupuesto/2");
  const items = parseLineItems(sp.lineItems);
  const productSizes = await db.select({ id: sizes.id, label: sizes.label }).from(sizes).where(eq(sizes.productId, product.id));
  const sizeByLabel = new Map(productSizes.map((size) => [size.label, size.id]));
  const serializedItems = items.map((item) => ({ ...item, sizeId: sizeByLabel.get(item.talle) ?? "" }));
  const quantities = new Map<string, number>();
  for (const item of serializedItems) {
    if (item.sizeId) quantities.set(item.sizeId, (quantities.get(item.sizeId) ?? 0) + 1);
  }

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
        productName={product.name}
        items={serializedItems}
        total={items.length}
        sizeQuantities={Array.from(quantities, ([sizeId, quantity]) => ({ sizeId, quantity }))}
        contactInfo={contactInfo}
        type={(sp.type as "new" | "returning") ?? "new"}
        notes={sp.notes}
        fileIds={sp.files ? sp.files.split(",").filter(Boolean) : undefined}
        uploadSessionId={sp.uploadSessionId}
        uploadSessionSecret={sp.uploadSessionSecret}
        backHref={`/presupuesto/4?${new URLSearchParams(sp as Record<string, string>).toString()}`}
      />
    </div>
  );
}
