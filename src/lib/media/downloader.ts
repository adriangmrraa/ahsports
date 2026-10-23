import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { assertMediaBytes } from "@/lib/media/signatures";
import { MAX_MEDIA_BYTES, privateUploadsDir } from "@/lib/storage";

const ALLOWED_DOMAINS = [
  "api.ycloud.com",
  "cdn.ycloud.com",
  "api.telegram.org",
];

/**
 * Inbound customer media lives OUTSIDE `public/` — see `privateUploadsDir`
 * in src/lib/storage.ts. The /api/media/[...path] route is the only read
 * path (session-gated).
 */
export function mediaUploadsDir(): string {
  return privateUploadsDir();
}

function isAllowedDomain(url: string, extraAllowedDomains: readonly string[] = []): boolean {
  try {
    const parsed = new URL(url);
    // https only — an http fetch would carry provider auth headers in clear.
    if (parsed.protocol !== "https:") return false;
    // Anchored match: "evil-ycloud.com" / "api.ycloud.com.evil.com" must not
    // pass — a lookalike domain would receive the provider's auth headers.
    return [...ALLOWED_DOMAINS, ...extraAllowedDomains].some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

function sanitizeScope(scope: string): string {
  const clean = String(scope ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 80);
  return clean || "media";
}

/**
 * `extraAllowedDomains` is the per-provider seam (C12): provider adapters
 * pass their media domains (e.g. KAPSO_MEDIA_DOMAINS) so the global
 * allowlist never grows speculatively.
 *
 * Downloaded bytes are validated against magic bytes before returning —
 * `expectedMime` (the provider-declared type) must match the detected
 * container kind when provided. Payloads that look like markup/script or
 * are unrecognized are rejected.
 */
export async function downloadMedia(
  url: string,
  headers?: Record<string, string>,
  extraAllowedDomains?: readonly string[],
  expectedMime?: string
): Promise<Buffer> {
  if (!isAllowedDomain(url, extraAllowedDomains)) {
    throw new Error(`Domain not allowed: ${url}`);
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_MEDIA_BYTES) {
    throw new Error("El archivo supera los 25MB");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error("El archivo supera los 25MB");
  }
  assertMediaBytes(buffer, expectedMime);
  return buffer;
}

/**
 * Persists an inbound buffer under the private uploads dir, scoped by an
 * opaque id (conversation id, upload session id, etc). Returns the
 * session-gated `/api/media/<scope>/<file>` URL — never a public path.
 */
export async function saveMediaLocally(
  buffer: Buffer,
  scope: string,
  filename: string,
  mimeType?: string
): Promise<string> {
  assertMediaBytes(buffer, mimeType);
  const dir = path.join(mediaUploadsDir(), sanitizeScope(scope));
  await fs.mkdir(dir, { recursive: true });

  const ext = mimeType ? mimeTypeToExt(mimeType) : path.extname(filename) || ".bin";
  const safeName = `${Date.now()}-${randomBytes(4).toString("hex")}-${sanitizeFilename(filename)}`;
  const finalName = safeName.endsWith(ext) ? safeName : `${safeName}${ext}`;

  const filePath = path.join(dir, finalName);
  await fs.writeFile(filePath, buffer);

  return `/api/media/${sanitizeScope(scope)}/${finalName}`;
}

function mimeTypeToExt(mime: string): string {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/ogg": ".ogg",
    "audio/opus": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/amr": ".amr",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/3gpp": ".3gp",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/plain": ".txt",
    "text/csv": ".csv",
  };
  return map[normalized] || ".bin";
}

/**
 * YCloud two-step media fetch: media id → metadata (url, mime, filename) →
 * bytes. Prefer `resolveMedia` on the messaging provider when an account is
 * available — this helper covers callers that only hold mediaId + apiKey.
 */
export async function downloadYCloudMedia(
  mediaId: string,
  apiKey: string
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const baseUrl = process.env.YCLOUD_BASE_URL?.trim() || "https://api.ycloud.com";
  const metaResp = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/v2/whatsapp/media/${encodeURIComponent(mediaId)}`,
    {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!metaResp.ok) {
    const body = await metaResp.text().catch(() => "no body");
    throw new Error(
      `YCloud media metadata failed: ${metaResp.status} - ${body.slice(0, 200)}` +
      (metaResp.status === 401 ? " — La API key de YCloud no tiene permiso para leer medios. En YCloud Dashboard > API Keys, habilitá el permiso 'Media > Read'." : "")
    );
  }

  const meta = (await metaResp.json()) as {
    url?: string;
    mime_type?: string;
    file_name?: string;
  };

  if (!meta.url) throw new Error("No media URL returned by YCloud");

  const mimeType = meta.mime_type || "application/octet-stream";
  const buffer = await downloadMedia(
    meta.url,
    { "X-API-Key": apiKey },
    undefined,
    mimeType === "application/octet-stream" ? undefined : mimeType
  );

  return {
    buffer,
    mimeType,
    filename: meta.file_name || `media-${sanitizeScope(mediaId)}`,
  };
}
