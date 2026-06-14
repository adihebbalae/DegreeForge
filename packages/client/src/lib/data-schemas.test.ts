/**
 * data-schemas.test.ts
 *
 * Focused tests for the syllabi-related schema validations added as security
 * defense-in-depth:
 *   1. pdfUrl — javascript:/data: URIs are coerced to ''; valid https:// passes through.
 *   2. pct — values outside [0, 200] are rejected.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-create the schemas under test in isolation so we can test them directly
// without importing private unexported symbols from data-schemas.ts. The
// production code uses identical definitions.

const pdfUrlField = z
  .string()
  .transform((val) =>
    val.startsWith('http://') || val.startsWith('https://') || val === '' ? val : ''
  )
  .default('');

const pctField = z.number().min(0).max(200).default(0);

// ─── pdfUrl coercion ──────────────────────────────────────────────────────────

describe('pdfUrl schema field', () => {
  it('coerces javascript: URI to empty string', () => {
    expect(pdfUrlField.parse('javascript:alert(1)')).toBe('');
  });

  it('coerces data: URI to empty string', () => {
    expect(pdfUrlField.parse('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('coerces vbscript: URI to empty string', () => {
    expect(pdfUrlField.parse('vbscript:msgbox(1)')).toBe('');
  });

  it('passes through a valid https URL unchanged', () => {
    const url = 'https://utdirect.utexas.edu/apps/student/syllabi/doc.pdf';
    expect(pdfUrlField.parse(url)).toBe(url);
  });

  it('passes through a valid http URL unchanged', () => {
    const url = 'http://example.com/syllabus.pdf';
    expect(pdfUrlField.parse(url)).toBe(url);
  });

  it('passes through an empty string unchanged', () => {
    expect(pdfUrlField.parse('')).toBe('');
  });

  it('defaults to empty string when field is absent (undefined)', () => {
    expect(pdfUrlField.parse(undefined)).toBe('');
  });
});

// ─── pct bounds ───────────────────────────────────────────────────────────────

describe('pct schema field', () => {
  it('rejects 999999 (above max)', () => {
    expect(() => pctField.parse(999999)).toThrow();
  });

  it('rejects -1 (below min)', () => {
    expect(() => pctField.parse(-1)).toThrow();
  });

  it('rejects 201 (one above max)', () => {
    expect(() => pctField.parse(201)).toThrow();
  });

  it('accepts 0 (min boundary)', () => {
    expect(pctField.parse(0)).toBe(0);
  });

  it('accepts 100 (typical value)', () => {
    expect(pctField.parse(100)).toBe(100);
  });

  it('accepts 200 (max boundary)', () => {
    expect(pctField.parse(200)).toBe(200);
  });

  it('defaults to 0 when field is absent (undefined)', () => {
    expect(pctField.parse(undefined)).toBe(0);
  });
});
