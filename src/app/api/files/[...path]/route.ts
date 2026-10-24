import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { storedFiles } from "@/db/schema";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { assertSafePath, publicUploadsDir } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Public-ish read for the public attachment scope — replicates the
 * `/uploads/` static behavior the local adapter used to rely on:
 * - STORAGE_PROVIDER=db → bytes come from `stored_files` (scope 'public').
 * - otherwise → streamed from `publicUploadsDir()`, which covers
 *   `UPLOADS_DIR` pointing outside `public/` (mounted Render disk).
 * Product images and wizard attachment previews render anonymously, so
 * there is no session gate; the per-IP limit below is the abuse bound.
 */

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".ps": "application/postscript",
  ".eps": "application/postscript",
  ".ai": "application/illustrator",
  ".psd": "image/vnd.adobe.photoshop",
};

const FILES_RATE_LIMIT = 60;
const FILES_RATE_BUCKET = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const rate = await checkRateLimit(`files:${clientIpFromRequest(req)}`, {
    bucket: "files",
    limit: FILES_RATE_LIMIT,
    bucketLimit: FILES_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const segments = (await params).path;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cleanSegments = segments.map((s) => s.replace(/\.\./g, ""));
  const rel = cleanSegments.join("/");
  try {
    assertSafePath(rel);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.STORAGE_PROVIDER === "db") {
    const [row] = await db
      .select({ mime: storedFiles.mime, bytes: storedFiles.bytes })
      .from(storedFiles)
      .where(and(eq(storedFiles.path, rel), eq(storedFiles.scope, "public")))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Paths are content-random — immutable forever-caching is safe.
    return new NextResponse(new Uint8Array(row.bytes), {
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(row.bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const uploadsDir = path.resolve(publicUploadsDir());
  const filePath = path.resolve(uploadsDir, ...cleanSegments);
  if (filePath !== uploadsDir && !filePath.startsWith(uploadsDir + path.sep)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_MAP[ext] || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
