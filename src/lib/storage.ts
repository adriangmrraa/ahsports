import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { storedFiles } from "@/db/schema";
import { assertMediaBytes, mimeKind } from "@/lib/media/signatures";

/**
 * F4-01 — Contrato de almacenamiento conmutable (D11).
 * `local` (default): disco. `db`: bytea en Postgres (`stored_files`,
 * migración 0025) para el fs efímero de Render. `s3`: stub honesto.
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

export function assertSafePath(p: string) {
  if (!p || p.includes("..") || p.startsWith("/") || path.isAbsolute(p) || p.includes("\\")) {
    throw new Error("Ruta de archivo inválida");
  }
}

/** Read path for the db adapter and for local dirs outside `public/`. */
export const PUBLIC_FILES_URL_PREFIX = "/api/files/";

const DEFAULT_PUBLIC_UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads");

/**
 * Public attachments (order files, product images) live under
 * `public/uploads` by default so Next serves them statically at
 * `/uploads/*`. `UPLOADS_DIR` overrides the dir for deploys that mount
 * persistent storage elsewhere — outside `public/` the same files are
 * streamed by `/api/files/[...path]` instead.
 */
export function publicUploadsDir(): string {
  const configured = process.env.UPLOADS_DIR;
  return configured ? path.resolve(configured) : DEFAULT_PUBLIC_UPLOADS_DIR;
}

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
    const uploadsDir = publicUploadsDir();
    const dest = path.resolve(uploadsDir, relPath);
    if (dest !== uploadsDir && !dest.startsWith(uploadsDir + path.sep)) {
      throw new Error("Ruta de archivo inválida");
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    const rel = relPath.split(path.sep).join("/");
    const url =
      uploadsDir === DEFAULT_PUBLIC_UPLOADS_DIR
        ? `/uploads/${rel}`
        : `${PUBLIC_FILES_URL_PREFIX}${rel}`;
    return { url, size: buffer.length };
  },

  async delete(url: string) {
    const rel = url.startsWith("/uploads/")
      ? url.slice("/uploads/".length)
      : url.startsWith(PUBLIC_FILES_URL_PREFIX)
        ? url.slice(PUBLIC_FILES_URL_PREFIX.length)
        : null;
    if (rel === null) return;
    assertSafePath(rel);
    const uploadsDir = publicUploadsDir();
    const target = path.resolve(uploadsDir, rel);
    if (target !== uploadsDir && !target.startsWith(uploadsDir + path.sep)) {
      throw new Error("Ruta de archivo inválida");
    }
    try {
      await fs.unlink(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
    }
  },
};

/**
 * Media entrante de clientes (canales WhatsApp/Telegram): la allowlist de
 * mimes declarados vive en `mimeKind` (src/lib/media/signatures.ts) — un mime
 * sin kind reconocido se rechaza, y además cada buffer pasa por
 * `assertMediaBytes`: el contenido real manda sobre el mime declarado.
 * Sin SVG: servir SVG entrante sería un vector de XSS.
 */

/** Same 25MB ceiling as the transcription endpoint — one cap for the whole pipeline. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/**
 * Inbound customer media lives OUTSIDE `public/` — anything under public/ is
 * served statically without auth and these are customer files. Default
 * `<cwd>/private/uploads`; `MEDIA_UPLOADS_DIR` overrides it for deploys that
 * mount persistent storage elsewhere. The /api/media/[...path] route is the
 * only read path (session-gated).
 */
export function privateUploadsDir(): string {
  const configured = process.env.MEDIA_UPLOADS_DIR;
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "private", "uploads");
}

export const PRIVATE_MEDIA_URL_PREFIX = "/api/media/";

function normalizeMime(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
}

export const privateStorageAdapter: StorageAdapter = {
  async upload(file: File | Buffer, relPath: string, mimeType: string) {
    assertSafePath(relPath);
    const normalized = normalizeMime(mimeType);
    if (!normalized || !mimeKind(normalized)) {
      throw new Error(`Tipo de archivo no permitido: ${mimeType || "desconocido"}`);
    }
    const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) {
      throw new Error("El archivo supera los 25MB");
    }
    assertMediaBytes(buffer, normalized);
    const uploadsDir = privateUploadsDir();
    const dest = path.resolve(uploadsDir, relPath);
    if (dest !== uploadsDir && !dest.startsWith(uploadsDir + path.sep)) {
      throw new Error("Ruta de archivo inválida");
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    const url = `${PRIVATE_MEDIA_URL_PREFIX}${relPath.split(path.sep).join("/")}`;
    return { url, size: buffer.length };
  },

  async delete(url: string) {
    if (!url.startsWith(PRIVATE_MEDIA_URL_PREFIX)) return;
    const rel = url.slice(PRIVATE_MEDIA_URL_PREFIX.length);
    assertSafePath(rel);
    const uploadsDir = privateUploadsDir();
    const target = path.resolve(uploadsDir, rel);
    if (target !== uploadsDir && !target.startsWith(uploadsDir + path.sep)) {
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

/**
 * STORAGE_PROVIDER=db — bytes en `stored_files` (migración 0025). El import
 * de `@/db/client` es perezoso: storage.ts también se carga en tests y
 * tooling sin DATABASE_URL, y client.ts lanza al evaluarse sin ella.
 */
async function dbClient() {
  const { db } = await import("@/db/client");
  return db;
}

async function insertStoredFile(
  scope: "public" | "media",
  relPath: string,
  mime: string,
  buffer: Buffer,
) {
  const db = await dbClient();
  await db
    .insert(storedFiles)
    .values({ path: relPath, scope, mime, bytes: buffer, size: buffer.length })
    .onConflictDoNothing();
}

async function deleteStoredFile(scope: "public" | "media", url: string, urlPrefix: string) {
  if (!url.startsWith(urlPrefix)) return;
  const rel = url.slice(urlPrefix.length);
  assertSafePath(rel);
  const db = await dbClient();
  await db
    .delete(storedFiles)
    .where(and(eq(storedFiles.path, rel), eq(storedFiles.scope, scope)));
}

/** Public attachments in Postgres; streamed back by /api/files/[...path]. */
export const dbStorageAdapter: StorageAdapter = {
  async upload(file: File | Buffer, relPath: string, mimeType: string) {
    assertSafePath(relPath);
    if (!mimeType || !(ALLOWED_MIMES as readonly string[]).includes(mimeType)) {
      throw new Error(`Tipo de archivo no permitido: ${mimeType || "desconocido"}`);
    }
    const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error("El archivo supera los 5MB");
    }
    await insertStoredFile("public", relPath, mimeType, buffer);
    return { url: `${PUBLIC_FILES_URL_PREFIX}${relPath.split(path.sep).join("/")}`, size: buffer.length };
  },

  async delete(url: string) {
    await deleteStoredFile("public", url, PUBLIC_FILES_URL_PREFIX);
  },
};

/** Inbound customer media in Postgres; streamed back by session-gated /api/media/[...path]. */
export const dbPrivateStorageAdapter: StorageAdapter = {
  async upload(file: File | Buffer, relPath: string, mimeType: string) {
    assertSafePath(relPath);
    const normalized = normalizeMime(mimeType);
    if (!normalized || !mimeKind(normalized)) {
      throw new Error(`Tipo de archivo no permitido: ${mimeType || "desconocido"}`);
    }
    const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) {
      throw new Error("El archivo supera los 25MB");
    }
    assertMediaBytes(buffer, normalized);
    await insertStoredFile("media", relPath, normalized, buffer);
    return { url: `${PRIVATE_MEDIA_URL_PREFIX}${relPath.split(path.sep).join("/")}`, size: buffer.length };
  },

  async delete(url: string) {
    await deleteStoredFile("media", url, PRIVATE_MEDIA_URL_PREFIX);
  },
};

function resolveStorageAdapter(kind: "public" | "media"): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER;
  if (provider === "s3") return s3StorageAdapter;
  if (provider === "db") {
    return kind === "media" ? dbPrivateStorageAdapter : dbStorageAdapter;
  }
  return kind === "media" ? privateStorageAdapter : localStorageAdapter;
}

export const activeStorage: StorageAdapter = resolveStorageAdapter("public");

/**
 * El path de media privada sigue el mismo switch de provider — con
 * STORAGE_PROVIDER=db la media entrante tampoco puede quedar en el disco
 * efímero. `saveMediaLocally` escribe a través de esta seam.
 */
export const activePrivateStorage: StorageAdapter = resolveStorageAdapter("media");
