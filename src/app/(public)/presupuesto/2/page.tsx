import { db } from "@/db/client";
import { products, sizes } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Step2Form } from "./Step2Form";
import { StepIndicator } from "../_components/StepIndicator";

export const metadata = { title: "Presupuesto · Paso 2 · AH Sports" };

/**
 * F4-09 — Paso 2: seleccionar producto + talles + cantidades.
 * Server component carga productods activos y sus talles reales (no inventa).
 */
export default async function PresupuestoStep2() {
  const [productRows, sizeRows] = await Promise.all([
    db.select().from(products).where(eq(products.active, true)).orderBy(products.name),
    db
      .select({ id: sizes.id, productId: sizes.productId, label: sizes.label, order: sizes.order })
      .from(sizes)
      .orderBy(asc(sizes.order)),
  ]);

  const sizesByProduct = new Map<string, { id: string; label: string }[]>();
  for (const s of sizeRows) {
    const list = sizesByProduct.get(s.productId) ?? [];
    list.push({ id: s.id, label: s.label });
    sizesByProduct.set(s.productId, list);
  }

  const catalog = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    basePrice: p.basePrice,
    minOrder: p.minOrder,
    sizes: sizesByProduct.get(p.id) ?? [],
  }));

  return (
    <div className="px-4 py-10">
      <StepIndicator current={2} />
      <h1 className="mb-6 mt-6 text-center text-2xl font-bold tracking-tight">Elegí el producto y los talles</h1>
      <Step2Form catalog={catalog} />
    </div>
  );
}