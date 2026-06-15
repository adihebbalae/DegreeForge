/**
 * Client-side PDF text extraction using pdfjs-dist.
 *
 * Loaded via dynamic import() so the ~1 MB pdfjs bundle is lazy — users who
 * never upload a PDF pay zero initial load cost.
 *
 * Line-break reconstruction: pdfjs TextItem.transform[5] is the y-position of
 * each text chunk in PDF user space.  When consecutive items have a y-position
 * that differs by more than a threshold (about one line height, heuristically
 * derived from item height), we emit a newline.  This preserves the row
 * structure that the IDA / transcript parsers rely on — avoiding the
 * "PDF copy-paste lost line breaks" problem the parsers already document.
 *
 * CSP note: the worker is configured with a same-origin URL
 * (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`) so that
 * Vite bundles/fingerprints it under our own origin.  No CDN fetch occurs.
 * If the browser console shows a CSP worker violation (blob: worker), the
 * server CSP must add `worker-src 'self' blob:` — see packages/server/src/index.ts.
 */

// ─── Narrow types (only what we actually use from pdfjs-dist) ────────────────

interface PdfjsTextItem {
  str: string;
  transform: number[];   // [a,b,c,d,e,f] — index 5 is y
  height: number;
  hasEOL: boolean;
}

interface PdfjsTextContent {
  items: Array<PdfjsTextItem | { type: string }>;
}

interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>;
}

interface PdfjsDoc {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
}

interface PdfjsLoadingTask {
  promise: Promise<PdfjsDoc>;
  destroy(): Promise<void>;
}

interface PdfjsModule {
  getDocument(params: { data: ArrayBuffer }): PdfjsLoadingTask;
  GlobalWorkerOptions: { workerSrc: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true when the item is a real text chunk (not a marked-content boundary). */
function isTextItem(item: PdfjsTextItem | { type: string }): item is PdfjsTextItem {
  return !('type' in item);
}

/**
 * Reconstruct plain text from a page's TextContent, inserting newlines when
 * items jump to a new visual row.  The y-coordinate lives at transform[5].
 * A new row is detected when |Δy| > half the most recently seen item height
 * (guards against false positives from sub-pixel baseline shifts within a row).
 */
function pageTextFromContent(content: PdfjsTextContent): string {
  const chunks: string[] = [];
  let lastY: number | null = null;
  let lastHeight = 12; // fallback: assume 12pt if height is absent

  for (const raw of content.items) {
    if (!isTextItem(raw)) continue;

    const y = raw.transform[5];
    const h = raw.height > 0 ? raw.height : lastHeight;

    if (lastY !== null && Math.abs(y - lastY) > h * 0.5) {
      // New visual row — emit a newline separator.
      chunks.push('\n');
    } else if (chunks.length > 0 && !chunks[chunks.length - 1].endsWith('\n')) {
      // Same row, but pdfjs may split mid-word; insert a space only when the
      // previous chunk doesn't already end with one and the gap is significant
      // enough (pdfjs sets hasEOL on items where it detected an explicit EOL).
      if (raw.hasEOL === false) {
        // no separator needed — chunk will be concatenated
      }
    }

    if (raw.str) {
      chunks.push(raw.str);
    }

    if (raw.hasEOL) {
      chunks.push('\n');
    }

    lastY = y;
    lastHeight = h;
  }

  return chunks.join('');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Extracts all text from a PDF file and returns it as a single string with
 * newlines preserved between visual rows.
 *
 * Throws a plain Error (with a user-friendly message) when:
 *  - the file is not a valid PDF (magic bytes mismatch)
 *  - the PDF has no text layer (scanned / image-only)
 *  - the PDF is password-protected / unreadable
 *  - the file is empty
 */
export async function extractPdfText(file: File): Promise<string> {
  if (file.size === 0) {
    throw new Error('The file is empty. Please select a valid PDF.');
  }

  // pdfjs-dist is lazy-loaded so it never enters the initial bundle.
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfjsModule;

  // Configure the worker to load from our own origin so no CDN request occurs.
  // Vite resolves `new URL(..., import.meta.url)` to a same-origin bundled path;
  // pdfjs v6 workerSrc requires a string (not a URL object), so `.href` extracts it.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;

  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });

  let doc: PdfjsDoc;
  try {
    doc = await task.promise;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Clean up the loading task before surfacing the error.
    await task.destroy().catch(() => undefined);
    throw new Error(
      `Could not open PDF — ${msg}. Try pasting the text instead.`
    );
  }

  const pageTexts: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pageTexts.push(pageTextFromContent(content));
    }
  } finally {
    // destroy() is on the loading task, not the document proxy.
    await task.destroy().catch(() => undefined);
  }

  const combined = pageTexts.join('\n').trim();
  if (!combined) {
    throw new Error(
      'This PDF has no selectable text (it may be a scanned image). Try pasting the text instead.'
    );
  }

  return combined;
}
