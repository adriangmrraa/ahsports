import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Step3Form } from "./Step3Form";
import { StepIndicator } from "../_components/StepIndicator";

export const metadata = { title: "Presupuesto · Paso 3 · AH Sports" };

/** Parsea 'S:2,M:3' → [{label:'S',qty:2}] */
function parseSizes(raw: string | undefined): { label: string; qty: number }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => {
      const [label, q] = x.split(":");
      return { label, qty: Number(q || 0) };
    })
    .filter((x) => x.qty > 0);
}

/**
 * F4-10 — Paso 3: personalizaciones individuales (nombre/número por prenda).
 * Server component: lee productId/total del paso 2 y deja que el form genere filas.
 */
export default async function PresupuestoStep3({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; sizeQuantities?: string; total?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.productId) redirect("/presupuesto/2");

  const [product] = await db.select().from(products).where(eq(products.id, sp.productId)).limit(1);
  if (!product) redirect("/presupuesto/2");

  const sizes = parseSizes(sp.sizeQuantities);
  const total = Number(sp.total || sizes.reduce((a, s) => a + s.qty, 0)) || 0;

  return (
    <div className="px-4 py-10">
      <StepIndicator current={3} />
      <h1 className="mb-2 mt-6 text-center text-2xl font-bold tracking-tight">Personalización</h1>
      <p className="mb-6 text-center text-sm text-on-surface-variant">
        {product.name} · {total} prendas
      </p>
      <Step3Form productName={product.name} sizes={sizes} total={total} />
    </div>
  );
}