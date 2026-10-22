/**
 * Type shim for the direct `pdf-parse/lib/pdf-parse.js` import.
 * The package index reads a test fixture when `module.parent` is unset
 * (bundled builds), so we import the lib entry point directly.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text?: string;
    numpages?: number;
    info?: unknown;
  }
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export default pdfParse;
}
