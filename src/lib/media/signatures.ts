/**
 * Magic-byte sniffing for inbound customer media.
 *
 * Detection is container-level (kind + canonical mime): the same container
 * covers several wire mimes (`audio/ogg` vs `audio/opus`, `video/mp4` vs
 * `audio/mp4`), so validation compares *kinds*, not exact mimes. Unknown
 * binary content and markup/script payloads always fail — inbound media is
 * served back through /api/media and must never include executable text.
 */

export type MediaKind = "image" | "audio" | "video" | "pdf" | "doc" | "text";

export type MediaSniff = { kind: MediaKind; mime: string };

function startsWith(buffer: Buffer, ascii: string, offset = 0): boolean {
  if (buffer.length < offset + ascii.length) return false;
  return buffer.subarray(offset, offset + ascii.length).toString("latin1") === ascii;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function hasBytes(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

function isTextLike(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  for (const byte of sample) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x20 || byte === 0x7f) return false;
  }
  return true;
}

function isMarkup(buffer: Buffer): boolean {
  const head = buffer
    .subarray(0, Math.min(buffer.length, 1024))
    .toString("utf-8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<");
}

/**
 * Returns the detected container, `null` for unrecognized or unsafe payloads.
 * Markup/XML/script-shaped text is rejected here, before it can ever be
 * served back through the media route.
 */
export function sniffMediaMime(buffer: Buffer): MediaSniff | null {
  if (buffer.length < 4) return null;
  if (isMarkup(buffer)) return null;
  if (startsWith(buffer, "%PDF")) return { kind: "pdf", mime: "application/pdf" };
  if (startsWith(buffer, "PK\x03\x04")) return { kind: "doc", mime: "application/zip" };
  if (hasBytes(buffer, OLE_SIGNATURE)) return { kind: "doc", mime: "application/msword" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (hasBytes(buffer, PNG_SIGNATURE)) return { kind: "image", mime: "image/png" };
  if (startsWith(buffer, "GIF87a") || startsWith(buffer, "GIF89a")) return { kind: "image", mime: "image/gif" };
  if (startsWith(buffer, "RIFF") && startsWith(buffer, "WEBP", 8)) return { kind: "image", mime: "image/webp" };
  if (startsWith(buffer, "RIFF") && startsWith(buffer, "WAVE", 8)) return { kind: "audio", mime: "audio/wav" };
  if (startsWith(buffer, "OggS")) return { kind: "audio", mime: "audio/ogg" };
  if (startsWith(buffer, "fLaC")) return { kind: "audio", mime: "audio/flac" };
  if (startsWith(buffer, "#!AMR")) return { kind: "audio", mime: "audio/amr" };
  if (startsWith(buffer, "ID3") || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    return { kind: "audio", mime: "audio/mpeg" };
  }
  if (startsWith(buffer, "ftyp", 4)) return { kind: "video", mime: "video/mp4" };
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { kind: "video", mime: "video/webm" };
  }
  if (isTextLike(buffer)) return { kind: "text", mime: "text/plain" };
  return null;
}

/** Normalizes a wire mime to its container kind. Returns `null` when the mime isn't inbound media. */
export function mimeKind(mime: string): MediaKind | null {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.startsWith("text/")) return "text";
  if (normalized.startsWith("image/") && normalized !== "image/svg+xml") return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  if (normalized === "application/pdf") return "pdf";
  if (
    normalized === "application/zip" ||
    normalized === "application/msword" ||
    normalized.startsWith("application/vnd.ms-") ||
    normalized.startsWith("application/vnd.openxmlformats-officedocument.")
  ) {
    return "doc";
  }
  return null;
}

/** True when the declared mime belongs to the same container family as the sniffed bytes. */
export function sniffMatchesMime(sniff: MediaSniff, expectedMime: string): boolean {
  const normalized = expectedMime.toLowerCase().split(";")[0]?.trim() ?? "";
  const expected = mimeKind(normalized);
  if (!expected) return false;
  if (sniff.kind === expected) return true;
  // mp4-family containers (ftyp) carry audio brands too — `video/mp4`-shaped
  // bytes are a legitimate match for audio/mp4, audio/x-m4a and friends.
  if (sniff.kind === "video" && sniff.mime === "video/mp4" && expected === "audio") {
    return /^audio\/(mp4|m4a|x-m4a|aac|mp4a-latm|3gpp)$/.test(normalized);
  }
  return false;
}

/**
 * Validates raw inbound bytes against magic bytes. Throws (es-AR) when the
 * payload is empty, looks like markup/script, is unrecognized, or — when
 * `expectedMime` is provided — disagrees with the declared type.
 */
export function assertMediaBytes(buffer: Buffer, expectedMime?: string): asserts buffer is Buffer {
  if (buffer.length === 0) throw new Error("El archivo está vacío");
  const sniff = sniffMediaMime(buffer);
  if (!sniff) throw new Error("Tipo de archivo no permitido o no reconocido");
  if (expectedMime && !sniffMatchesMime(sniff, expectedMime)) {
    throw new Error("El contenido no coincide con el tipo declarado");
  }
}
