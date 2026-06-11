/**
 * Tests for BUG 1 (pagination) and BUG 2 (summer session-letter prefix).
 *
 * BUG 1: fetchWithCookie / probePublicHtml only retrieved the first 40-result
 *   page. extractNextUnique detects the next-page link; the fetch loop follows
 *   it until no link is present, merging all pages.
 *
 * BUG 2: Summer course headers include a lowercase session letter before the
 *   course number (e.g. "ECE w422C", "ECE n333T"). parseRegistrarHtml was
 *   silently dropping all summer courses because the regex expected digits
 *   immediately after the department code.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fetchWithCookie } from '../fetch-term';
import { extractNextUnique } from '../fetch-term';
import { parseRegistrarHtml } from '../lib/parse-html';
import { parseTermSlug } from '../lib/term-codes';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

const FALL_2026 = parseTermSlug('fall-2026');
const SUMMER_2026 = parseTermSlug('summer-2026');

// ─── extractNextUnique ────────────────────────────────────────────────────────

describe('extractNextUnique', () => {
  it('returns the next_unique value when a next_nav_link is present', () => {
    const html = loadFixture('pagination-page1.html');
    expect(extractNextUnique(html)).toBe('18864');
  });

  it('returns null when no next_nav_link is present (last page)', () => {
    const html = loadFixture('pagination-page2.html');
    expect(extractNextUnique(html)).toBeNull();
  });

  it('returns null for a page with no next_nav_link at all', () => {
    const html = loadFixture('fall-2026-fixture.html');
    expect(extractNextUnique(html)).toBeNull();
  });

  it('handles href-before-id attribute order', () => {
    const html = `<a href="?fos_fl=ECE&level=U&search_type_main=FIELD&next_unique=99999" id="next_nav_link" title="next page">Next page</a>`;
    expect(extractNextUnique(html)).toBe('99999');
  });

  it('handles HTML-encoded &amp; in href (as seen in real registrar pages)', () => {
    // Real registrar pages use &amp; in href attributes
    const html = `<a href="?fos_fl=ECE&amp;level=U&amp;search_type_main=FIELD&amp;next_unique=18864" id="next_nav_link" title="next page">Next page &raquo;</a>`;
    expect(extractNextUnique(html)).toBe('18864');
  });

  it('handles literal & in href', () => {
    const html = `<a href="?fos_fl=ECE&level=U&search_type_main=FIELD&next_unique=18864" id="next_nav_link" title="next page">Next page</a>`;
    expect(extractNextUnique(html)).toBe('18864');
  });
});

// ─── BUG 1 — pagination: fetchWithCookie follows all pages ───────────────────

describe('fetchWithCookie pagination', () => {
  const FAKE_COOKIE = 'SC=fakecookiefortest123';

  it('merges sections from page 1 and page 2, total = sum of both pages', async () => {
    const page1Html = loadFixture('pagination-page1.html');
    const page2Html = loadFixture('pagination-page2.html');

    // Page 1 has 2 sections (18685, 18690). Page 2 has 2 sections (18864, 18870).
    // fetchWithCookie loops L/U/G — all levels return page1 then page2 then no more.
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      // Each level: first call returns page1 (with next_unique=18864),
      // second call (with &next_unique=18864) returns page2 (no next link).
      const isNextPage = (url as string).includes('next_unique=18864');
      const html = isNextPage ? page2Html : page1Html;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => html,
      };
    }) as unknown as typeof fetch;

    const result = await fetchWithCookie(FALL_2026, 'ECE', FAKE_COOKIE, mockFetch);

    // 3 levels × 2 pages each = 6 total fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(6);

    // Courses from both pages should be merged
    expect(result.courses['ECE 422C']).toBeDefined();
    expect(result.courses['ECE 460J']).toBeDefined();
    expect(result.courses['ECE 461L']).toBeDefined();

    // Total unique numbers across both pages
    const page1Uniques = [18685, 18690];
    const page2Uniques = [18864, 18870];
    const allUniques = [...page1Uniques, ...page2Uniques];

    // Sections from page2 should appear in result (not silently dropped)
    expect(result.courses['ECE 460J'].sections[0].unique).toBe(18864);
    expect(result.courses['ECE 461L'].sections[0].unique).toBe(18870);

    // Total section count = page1 sections + page2 sections (per level, deduplicated)
    const totalSections = Object.values(result.courses).reduce(
      (sum, c) => sum + c.sections.length,
      0
    );
    // 2 + 2 sections = 4 (deduplicated across L/U/G since same HTML is returned)
    expect(totalSections).toBe(allUniques.length);
  });

  it('stops after one page when there is no next_nav_link', async () => {
    const page2Html = loadFixture('pagination-page2.html'); // no next link
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => page2Html,
    }) as unknown as typeof fetch;

    await fetchWithCookie(FALL_2026, 'ECE', FAKE_COOKIE, mockFetch);

    // 3 levels × 1 page each = 3 total fetch calls (no pagination)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('second page URL includes &next_unique= parameter', async () => {
    const page1Html = loadFixture('pagination-page1.html');
    const page2Html = loadFixture('pagination-page2.html');

    let page2Url: string | null = null;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const isNextPage = (url as string).includes('next_unique=');
      if (isNextPage) page2Url = url as string;
      const html = isNextPage ? page2Html : page1Html;
      return { ok: true, status: 200, statusText: 'OK', text: async () => html };
    }) as unknown as typeof fetch;

    await fetchWithCookie(FALL_2026, 'ECE', FAKE_COOKIE, mockFetch, 'U');

    expect(page2Url).not.toBeNull();
    expect(page2Url).toContain('next_unique=18864');
    expect(page2Url).toContain('search_type_main=FIELD');
  });
});

// ─── BUG 2 — summer session-letter prefix is stripped ────────────────────────

describe('parseRegistrarHtml summer session prefix', () => {
  it('strips w-prefix: "ECE w422C" → course id "ECE 422C"', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    expect(out.courses['ECE 422C']).toBeDefined();
    expect(out.courses['ECE 422C'].sections[0].unique).toBe(75195);
  });

  it('strips n-prefix: "ECE n333T" → course id "ECE 333T"', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    expect(out.courses['ECE 333T']).toBeDefined();
    expect(out.courses['ECE 333T'].sections[0].unique).toBe(75199);
  });

  it('strips f-prefix: "ECE f351K" → course id "ECE 351K"', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    expect(out.courses['ECE 351K']).toBeDefined();
    expect(out.courses['ECE 351K'].sections[0].unique).toBe(75210);
  });

  it('does not drop normal (non-prefixed) courses on same page', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    expect(out.courses['ECE 302']).toBeDefined();
    expect(out.courses['ECE 302'].sections[0].unique).toBe(75220);
  });

  it('strips session-term suffix from title: "(Whole term)" is not part of the title', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    // Title should not include " (Whole term)" or " (Nine week term)"
    expect(out.courses['ECE 422C'].title).not.toMatch(/whole term/i);
    expect(out.courses['ECE 333T'].title).not.toMatch(/nine week term/i);
  });

  it('does not create a spurious course key with the session letter in the id', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    // Keys like "ECE w422C" must not exist — only "ECE 422C"
    const ids = Object.keys(out.courses);
    expect(ids.every((id) => !/^ECE [a-z]/.test(id))).toBe(true);
  });

  it('parses all four summer courses from the fixture', () => {
    const html = loadFixture('summer-session-prefix.html');
    const out = parseRegistrarHtml(html, SUMMER_2026, 'summer-session-prefix.html');

    expect(Object.keys(out.courses).sort()).toEqual(['ECE 302', 'ECE 333T', 'ECE 351K', 'ECE 422C']);
  });
});

// ─── Regression: existing fall fixture still works after parse-html changes ──

describe('regression: fall fixture unaffected by parse-html changes', () => {
  it('parses fall-2026 fixture without regressions', () => {
    const html = loadFixture('fall-2026-fixture.html');
    const out = parseRegistrarHtml(html, FALL_2026, 'fall-2026-fixture.html');

    expect(out.courses['ECE 302']).toBeDefined();
    expect(out.courses['ECE 316']).toBeDefined();
    expect(out.courses['ECE 460N']).toBeDefined();
    expect(out.courses['ECE 302'].sections[0].unique).toBe(18310);
  });
});
