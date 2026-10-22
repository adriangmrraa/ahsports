import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { privateUploadsDir } from "@/lib/storage";

export const runtime = "nodejs";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".3gp": "video/3gpp",
  ".mkv": "video/x-matroska",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".amr": "audio/amr",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

const MEDIA_RATE_LIMIT = 60;
const MEDIA_RATE_BUCKET = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Per-IP limit bounds the unauthenticated session lookup below; a dedicated
  // bucket keeps media flooding from starving inbound message processing.
  const rate = await checkRateLimit(`media:${clientIpFromRequest(req)}`, {
    bucket: "media",
    limit: MEDIA_RATE_LIMIT,
    bucketLimit: MEDIA_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // The private media dir only holds INBOUND customer media (voice notes,
  // photos, docs saved by saveMediaLocally / privateStorageAdapter). Nothing
  // here is meant to be public: require a session. getCurrentUser throwing
  // (no request scope, misconfigured secret) fails closed.
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const segments = (await params).path;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent directory traversal — resolve fully, then require confinement.
  const uploadsDir = path.resolve(privateUploadsDir());
  const cleanSegments = segments.map((s) => s.replace(/\.\./g, ""));
  const filePath = path.resolve(uploadsDir, ...cleanSegments);

  if (filePath !== uploadsDir && !filePath.startsWith(uploadsDir + path.sep)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
