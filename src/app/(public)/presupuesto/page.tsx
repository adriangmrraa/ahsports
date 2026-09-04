import { redirect } from "next/navigation";

/** F4-07 — /presupuesto redirige al paso 1 del wizard público. */
export default function PresupuestoIndex() {
  redirect("/presupuesto/1");
}