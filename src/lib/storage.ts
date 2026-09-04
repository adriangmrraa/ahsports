import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * F4-01 — Contrato de almacenamiento conmutable (D11).
 * MVP: `localStorageAdapter` en `public/uploads/`. S3 en F5.
 */

export const ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
  "application/pdf",
  "application/postscript",
  "application/illustrator",
  "application/photoshop",
  "image/vnd.adobe.photoshop",
] as const;

export type AllowedMime = (typeof ALLOWED_MIMES)[number];

/** Alias del design (ATTACHMENT_MIMES / MAX_5MB). */
export const ATTACHMENT_MIMES = ALLOWED_MIMES;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_5MB = MAX_FILE_BYTES;

export interface StorageAdapter {
  upload(file: File | Buffer, path: string, mimeType: string): Promise<{ url: string; size: number }>;
  delete(url: string): Promise<void>;
}

export type FileLike = { type?: string; size?: number; name?: string };

export function validateFile(file: FileLike): { ok: true } | { ok: false; error: string } {
  const mime = file?.type ?? "";
  const size = file?.size ?? 0;
  if (!mime || !(ALLOWED_MIMES as readonly string[]).includes(mime)) {
    return { ok: false, error: `Tipo de archivo no permitido: ${mime || "desconocido"}` };
  }
  if (size > MAX_FILE_BYTES) {
    return { ok: false, error: "El archivo supera los 5MB" };
  }
  return { ok: true };
}

/** basename + whitelist [a-z0-9._-]; resto → `_`. Sin `..` ni `/`. */
export function sanitizeFileName(name: string): string {
  const base = path.basename(String(name ?? "")).replace(/\\/g, "/").split("/").pop() ?? "";
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 120);
  return clean || "archivo";
}

export function buildAttachmentPath({
  orderId,
  originalName,
}: {
  orderId?: string | null;
  originalName: string;
}): string {
  const rand = randomBytes(8).toString("hex");
  const scope = orderId ?? "pending";
  return `${scope}/${rand}-${sanitizeFileName(originalName)}`;
}

function assertSafePath(p: string) {
  if (!p || p.includes("..") || p.startsWith("/") || path.isAbsolute(p) || p.includes("\\")) {
    throw new Error("Ruta de archivo inválida");
  }
}

const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads");

export const localStorageAdapter: StorageAdapter = {
  async upload(file: File | Buffer, relPath: string, mimeType: string) {
    assertSafePath(relPath);
    if (!mimeType || !(ALLOWED_MIMES as readonly string[]).includes(mimeType)) {
      throw new Error(`Tipo de archivo no permitido: ${mimeType || "desconocido"}`);
    }
    const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error("El archivo supera los 5MB");
    }
    const dest = path.resolve(UPLOADS_DIR, relPath);
    if (dest !== UPLOADS_DIR && !dest.startsWith(UPLOADS_DIR + path.sep)) {
      throw new Error("Ruta de archivo inválida");
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    const url = `/uploads/${relPath.split(path.sep).join("/")}`;
    return { url, size: buffer.length };
  },

  async delete(url: string) {
    if (!url.startsWith("/uploads/")) return;
    const rel = url.replace(/^\/uploads\//, "");
    assertSafePath(rel);
    const target = path.resolve(UPLOADS_DIR, rel);
    if (target !== UPLOADS_DIR && !target.startsWith(UPLOADS_DIR + path.sep)) {
      throw new Error("Ruta de archivo inválida");
    }
    try {
      await fs.unlink(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
    }
  },
};

export const s3StorageAdapter: StorageAdapter = {
  async upload() {
    throw new Error("Almacenamiento S3 no implementado, ver F5");
  },
  async delete() {
    throw new Error("Almacenamiento S3 no implementado, ver F5");
  },
};

export const activeStorage: StorageAdapter =
  process.env.STORAGE_PROVIDER === "s3" ? s3StorageAdapter : localStorageAdapter;
