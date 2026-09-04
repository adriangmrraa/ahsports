import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { attachments, orders, organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { activeStorage, buildAttachmentPath, validateFile } from "@/lib/storage";
import { attachmentKindSchema, attachmentStatusSchema, attachmentUploadSchema } from "@/lib/validators";
import { and, desc, eq } from "drizzle-orm";

function str(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

export async function GET(req: NextRequest) {
  await requireUser();
  const q = req.nextUrl.searchParams;
  const orderId = q.get("orderId") || undefined;
  const organizationId = q.get("organizationId") || undefined;
  const kindRaw = q.get("kind") || undefined;
  const statusRaw = q.get("status") || undefined;

  let kind: string | undefined;
  if (kindRaw !== undefined) {
    const p = attachmentKindSchema.safeParse(kindRaw);
    if (!p.success) return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    kind = p.data;
  }
  let status: string | undefined;
  if (statusRaw !== undefined) {
    const p = attachmentStatusSchema.safeParse(statusRaw);
    if (!p.success) return NextResponse.json({ error: "status inválido" }, { status: 400 });
    status = p.data;
  }

  const conds = [];
  if (orderId) conds.push(eq(attachments.orderId, orderId));
  if (organizationId) conds.push(eq(attachments.organizationId, organizationId));
  if (kind) conds.push(eq(attachments.kind, kind as never));
  if (status) conds.push(eq(attachments.status, status as never));

  const rows =
    conds.length > 0
      ? await db.select().from(attachments).where(and(...conds)).orderBy(desc(attachments.createdAt)).limit(200)
      : await db.select().from(attachments).orderBy(desc(attachments.createdAt)).limit(200);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await requireUser();
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "FormData requerido" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  const parsed = attachmentUploadSchema.safeParse({
    kind: str(form.get("kind")),
    orderId: str(form.get("orderId")) ?? null,
    organizationId: str(form.get("organizationId")) ?? null,
    name: str(form.get("name")) ?? null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const v = validateFile(file);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  let order: typeof orders.$inferSelect | undefined;
  if (d.orderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, d.orderId)).limit(1);
    if (!o) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    order = o;
  }
  const organizationId = d.organizationId ?? order?.organizationId ?? null;
  if (d.organizationId) {
    const [o] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, d.organizationId)).limit(1);
    if (!o) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }

  const originalName = file.name || "archivo";
  const relPath = buildAttachmentPath({ orderId: d.orderId ?? null, originalName });
  let stored: { url: string; size: number };
  try {
    stored = await activeStorage.upload(Buffer.from(await file.arrayBuffer()), relPath, file.type);
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el archivo" }, { status: 500 });
  }

  const [row] = await db
    .insert(attachments)
    .values({
      orderId: d.orderId ?? null,
      organizationId,
      kind: d.kind,
      name: d.name ?? originalName,
      originalName,
      mimeType: file.type,
      sizeBytes: stored.size,
      url: stored.url,
      status: "pendiente_revision",
      uploadedByRole: "admin",
    })
    .returning();
  if (!row) return NextResponse.json({ error: "No se pudo registrar el adjunto" }, { status: 500 });
  return NextResponse.json(row, { status: 201 });
}
