/**
 * Extracts text from inbound documents.
 * PDFs: full text via pdf-parse (1.x, no native deps).
 * Plain text: raw buffer. Other formats: filename mention only.
 */

const TEXT_LIMIT = 1500;

export async function extractDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<string | null> {
  void fileName;
  if (!mimeType) return null;

  if (mimeType === "application/pdf") {
    try {
      const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
      const result = await pdfParse(buffer);
      const text = result.text?.trim();
      if (text && text.length > 20) {
        return text.slice(0, TEXT_LIMIT);
      }
      return null;
    } catch {
      console.warn("[document] pdf-parse failed");
      return null;
    }
  }

  if (mimeType === "text/plain") {
    return buffer.toString("utf-8").slice(0, TEXT_LIMIT);
  }

  return null;
}
