import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { productTaxonomyNodes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/validators";

const nodeSchema = z.object({
  kind: z.enum(["category", "subcategory", "type"]),
  value: z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/, "Usá un identificador simple: minúsculas, números, guiones o guion bajo."),
  label: z.string().trim().min(1).max(255),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
}).strict();

export async function GET() {
  await requireUser();
  const rows = await db.select().from(productTaxonomyNodes).orderBy(asc(productTaxonomyNodes.kind), asc(productTaxonomyNodes.sortOrder), asc(productTaxonomyNodes.label));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await requireUser();
  const parsed = nodeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.kind === "category" && d.parentId) return NextResponse.json({ error: "Una categoría no puede tener padre." }, { status: 400 });
  if (d.kind !== "category" && !d.parentId) return NextResponse.json({ error: "Elegí el nivel superior del catálogo." }, { status: 400 });
  if (d.parentId) {
    const [parent] = await db.select({ kind: productTaxonomyNodes.kind }).from(productTaxonomyNodes).where(eq(productTaxonomyNodes.id, d.parentId)).limit(1);
    const expected = d.kind === "subcategory" ? "category" : "subcategory";
    if (!parent || parent.kind !== expected) return NextResponse.json({ error: "El nivel superior seleccionado no es válido." }, { status: 400 });
  }
  try {
    const [row] = await db.insert(productTaxonomyNodes).values({ ...d, parentId: d.parentId ?? null }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Ya existe ese valor en el mismo nivel." }, { status: 409 });
    return NextResponse.json({ error: "No se pudo guardar la opción." }, { status: 500 });
  }
}
