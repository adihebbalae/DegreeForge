/**
 * Minimal ambient type for the `pdf-parse` fallback. The published package
 * ships no types; the scraper only ever reads `.text`. This declaration keeps
 * the project's `strict`/no-`any` posture without pulling an external @types
 * package (which does not exist for pdf-parse).
 */
declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
  }
  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
