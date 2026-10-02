import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { activeStorage, sanitizeFileName, validateFile } from "@/lib/storage";
import { randomBytes } from "node:crypto";

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [product] = await db.select({ id: products.id, imageUrl: products.imageUrl }).from(products).where(eq(products.id, id)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido (campo 'file')" }, { status: 400 });
  }
  if (!IMAGE_MIMES.includes(file.type)) {
    return NextResponse.json({ error: "Solo imágenes PNG, JPG, WebP o SVG" }, { status: 400 });
  }
  const check = validateFile(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const relPath = `products/${id}/${randomBytes(8).toString("hex")}-${sanitizeFileName(file.name)}`;
  let uploaded: { url: string };
  try {
    uploaded = await activeStorage.upload(file, relPath, file.type);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir la imagen" }, { status: 500 });
  }

  await db.update(products).set({ imageUrl: uploaded.url }).where(eq(products.id, id));
  if (product.imageUrl && product.imageUrl !== uploaded.url) {
    await activeStorage.delete(product.imageUrl).catch(() => {});
  }
  return NextResponse.json({ imageUrl: uploaded.url }, { status: 201 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [product] = await db.select({ imageUrl: products.imageUrl }).from(products).where(eq(products.id, id)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (product.imageUrl) {
    await activeStorage.delete(product.imageUrl).catch(() => {});
  }
  await db.update(products).set({ imageUrl: null }).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}
