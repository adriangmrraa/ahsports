import { redirect } from "next/navigation";

/** F4-14 — /seguimiento sin token redirige al inicio. */
export default function SeguimientoIndex() {
  redirect("/");
}