/**
 * PDF → plain text for syllabus extraction.
 *
 * Strategy (documented in scripts/syllabi/README.md):
 *   1. Prefer the `pdftotext -layout` binary if it is on PATH. `-layout`
 *      preserves column structure, which matters for tabular grading blocks.
 *   2. Fall back to the `pdf-parse` Node library when the binary is absent, so
 *      the scraper runs in any environment without a system install.
 *
 * In THIS environment `pdftotext` (poppler/xpdf 4.00) is present, so that is
 * the active path; the pdf-parse fallback is the portability safety net.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let pdftotextChecked = false;
let pdftotextAvailable = false;

/** True if a usable `pdftotext` binary is on PATH. Result is memoized. */
export function hasPdftotext(): boolean {
  if (pdftotextChecked) return pdftotextAvailable;
  pdftotextChecked = true;
  try {
    const res = spawnSync('pdftotext', ['-v'], { encoding: 'utf-8' });
    // pdftotext prints its version banner to stderr and exits non-zero on -v
    // for some builds; treat "spawned without ENOENT" as available.
    pdftotextAvailable = res.error == null;
  } catch {
    pdftotextAvailable = false;
  }
  return pdftotextAvailable;
}

/** Extract text from a PDF on disk using `pdftotext -layout`. */
function extractWithBinary(pdfPath: string): string {
  const txtPath = `${pdfPath}.txt`;
  try {
    execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, txtPath], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return fs.readFileSync(txtPath, 'utf-8');
  } finally {
    if (fs.existsSync(txtPath)) fs.rmSync(txtPath, { force: true });
  }
}

/** Extract text from PDF bytes using the `pdf-parse` library (lazy import). */
async function extractWithLib(bytes: Buffer): Promise<string> {
  // Lazy import so the binary path never loads the dependency (pdf-parse runs
  // file IO at import time in its debug branch).
  const { default: pdfParse } = await import('pdf-parse');
  const result = await pdfParse(bytes);
  return result.text;
}

/**
 * Extract plain text from PDF bytes. Uses `pdftotext -layout` when present,
 * else `pdf-parse`. Throws if both paths fail. Returns the extracted text,
 * which may be empty for image-only (scanned) PDFs without OCR.
 */
export async function pdfToText(bytes: Buffer): Promise<{ text: string; engine: 'pdftotext' | 'pdf-parse' }> {
  if (hasPdftotext()) {
    const tmp = path.join(os.tmpdir(), `df-syllabus-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(tmp, bytes);
    try {
      const text = extractWithBinary(tmp);
      return { text, engine: 'pdftotext' };
    } finally {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    }
  }
  const text = await extractWithLib(bytes);
  return { text, engine: 'pdf-parse' };
}
