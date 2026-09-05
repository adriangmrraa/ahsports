"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { z } from "zod";

const updateSettingSchema = z
  .object({
    key: z.string().trim().min(1).max(128),
    value: z.unknown(),
  })
  .strict();

/** Claves de taller editables desde el hub de configuración. */
export const WORKSHOP_SETTING_KEYS = [
  "taller_nombre",
  "taller_cbu",
  "taller_contacto_email",
  "taller_contacto_phone",
  "taller_direccion",
] as const;

/**
 * F5-08 — Upsert en `settings` (INSERT ... ON CONFLICT DO UPDATE).
 * Solo claves conocidas o prefijo `taller_` para evitar polución arbitraria.
 */
export async function updateSetting(input: unknown) {
  await requireUser();
  const parsed = updateSettingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { key, value } = parsed.data;
  const allowed =
    (WORKSHOP_SETTING_KEYS as readonly string[]).includes(key) || key.startsWith("taller_");
  if (!allowed) return { ok: false as const, error: "Clave de configuración no permitida" };
  if (value === undefined) return { ok: false as const, error: "Valor requerido" };

  await db
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as never, updatedAt: new Date() } });
  revalidatePath("/admin/configuracion");
  return { ok: true as const };
}
