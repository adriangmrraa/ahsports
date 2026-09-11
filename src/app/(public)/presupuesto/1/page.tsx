import { db } from "@/db/client";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Step1Form } from "./Step1Form";
import { StepIndicator } from "../_components/StepIndicator";

export const metadata = { title: "Presupuesto · Paso 1 · AH Sports" };

/**
 * F4-08 — Paso 1: tipo de cliente + datos del contacto.
 * Si viene con type=returning + email, busca el contact existente para autollenar.
 */
export default async function PresupuestoStep1({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; email?: string; name?: string; phone?: string }>;
}) {
  const sp = await searchParams;

  let existing: { name?: string; email?: string; phone?: string } | null = null;
  if (sp.type === "returning" && sp.email) {
    const [row] = await db
      .select({ name: contacts.name, email: contacts.email, phone: contacts.phone })
      .from(contacts)
      .where(eq(contacts.email, sp.email))
      .limit(1);
    if (row) existing = { name: row.name ?? undefined, email: row.email ?? undefined, phone: row.phone ?? undefined };
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <StepIndicator current={1} />
      <h1 className="mb-6 mt-6 text-balance text-center text-xl font-bold tracking-tight sm:text-2xl">Pedí tu presupuesto</h1>
      <Step1Form existing={existing} />
    </div>
  );
}
