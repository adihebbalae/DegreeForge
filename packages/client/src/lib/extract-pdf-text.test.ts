import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock pdfjs-dist before importing the module under test ──────────────────
// The dynamic import inside extractPdfText is intercepted by Vitest's module
// mocking.  We stub getDocument / GlobalWorkerOptions and return a controllable
// in-memory "document".

vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(),
  };
});

// Import AFTER the mock is in place so the dynamic import() resolves to it.
import { extractPdfText } from './extract-pdf-text';
import * as pdfjs from 'pdfjs-dist';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeFile(size = 1): File {
  const buf = new Uint8Array(size).fill(0x25); // 0x25 = '%', like %PDF
  return new File([buf], 'test.pdf', { type: 'application/pdf' });
}

/** Build the getDocument mock to return an in-memory page list. */
function mockPdf(pages: Array<Array<{ str: string; y: number; height: number; hasEOL?: boolean }>>) {
  const pagesProxy = pages.map(items => ({
    getTextContent: async () => ({
      items: items.map(it => ({
        str: it.str,
        transform: [1, 0, 0, 1, 0, it.y],
        height: it.height,
        hasEOL: it.hasEOL ?? false,
      })),
    }),
  }));

  const docProxy = {
    numPages: pages.length,
    getPage: async (n: number) => pagesProxy[n - 1],
  };

  // destroy() is on the loading task (PDFDocumentLoadingTask), not the doc proxy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs.getDocument as any).mockReturnValue({
    promise: Promise.resolve(docProxy),
    destroy: async () => {},
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractPdfText', () => {
  it('returns empty-file error before touching pdfjs', async () => {
    const empty = new File([], 'empty.pdf', { type: 'application/pdf' });
    await expect(extractPdfText(empty)).rejects.toThrow('empty');
  });

  it('reconstructs multi-page text with newlines between rows', async () => {
    // Page 1: two rows (different y), Page 2: one row
    mockPdf([
      [
        { str: 'ECE 302', y: 700, height: 12 },
        { str: ' Intro Elec Eng', y: 700, height: 12 },
        { str: ' A', y: 700, height: 12 },
        // Second row — y drops by 20 (> height*0.5)
        { str: 'M 408C', y: 680, height: 12 },
        { str: ' Calculus', y: 680, height: 12 },
        { str: ' B', y: 680, height: 12 },
      ],
      [
        { str: 'PHY 303L', y: 650, height: 12 },
        { str: ' Physics', y: 650, height: 12 },
      ],
    ]);

    const text = await extractPdfText(makeFile());
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // All three course codes should appear as separate lines
    expect(lines.some(l => l.includes('ECE 302'))).toBe(true);
    expect(lines.some(l => l.includes('M 408C'))).toBe(true);
    expect(lines.some(l => l.includes('PHY 303L'))).toBe(true);

    // ECE 302 and M 408C must be on different lines
    const ece302Line = lines.findIndex(l => l.includes('ECE 302'));
    const m408Line = lines.findIndex(l => l.includes('M 408C'));
    expect(ece302Line).not.toBe(-1);
    expect(m408Line).not.toBe(-1);
    expect(ece302Line).not.toBe(m408Line);
  });

  it('throws a friendly error when the PDF has no text layer (empty text)', async () => {
    mockPdf([
      [{ str: '', y: 700, height: 12 }],
    ]);

    await expect(extractPdfText(makeFile())).rejects.toThrow('no selectable text');
  });

  it('throws a friendly error when pdfjs rejects (unreadable / encrypted PDF)', async () => {
    // Use mockImplementation so the rejection is created only when getDocument
    // is called by the code under test — prevents a dangling unhandled rejection
    // that Vitest detects as a test-run error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs.getDocument as any).mockImplementation(() => ({
      promise: Promise.reject(new Error('InvalidPDFException')),
      destroy: async () => {},
    }));

    await expect(extractPdfText(makeFile())).rejects.toThrow('Could not open PDF');
  });

  it('hasEOL items produce a newline after the item text', async () => {
    mockPdf([
      [
        { str: 'Line One', y: 700, height: 12, hasEOL: true },
        { str: 'Line Two', y: 700, height: 12, hasEOL: false },
      ],
    ]);

    const text = await extractPdfText(makeFile());
    // hasEOL on "Line One" should result in a newline before "Line Two"
    expect(text).toContain('Line One\nLine Two');
  });
});
