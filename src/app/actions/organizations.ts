"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { contacts, organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { organizationWithContactSchema } from "@/lib/validators";

export async function createOrganizationWithContact(input: unknown) {
  const user = await requireUser();
  void user;
  const parsed = organizationWithContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { organization, contact } = parsed.data;
  // Neon HTTP: sin tx — writes secuenciales (org primero, contacto después).
  const [org] = await db
    .insert(organizations)
    .values({
      name: organization.name,
      kind: organization.kind,
      taxId: organization.taxId ?? null,
      notes: organization.notes ?? null,
    })
    .returning({ id: organizations.id });
  if (!org) {
    return { ok: false as const, error: "No se pudo crear la organización" };
  }
  const [ct] = await db
    .insert(contacts)
    .values({
      organizationId: org.id,
      name: contact.name,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      role: contact.role ?? null,
      notes: contact.notes ?? null,
      status: contact.status ?? "nuevo",
    })
    .returning({ id: contacts.id });
  if (!ct) {
    return { ok: false as const, error: "No se pudo crear el contacto" };
  }
  revalidatePath("/admin/organizaciones");
  redirect(`/admin/organizaciones/${org.id}`);
}
