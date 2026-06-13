/**
 * TASK-067 — scrape-audit deterministic checks.
 *
 * Synthetic healthy + broken fixtures prove each check fails on exactly the
 * corruption it targets and passes on clean data. No disk, no network — the
 * audit core (auditTerms) is pure.
 */

import { describe, it, expect } from 'vitest';
import {
  auditTerms,
  deptOf,
  ANCHOR_COURSES,
  type TermInput,
} from '../scrape-audit';
import type { FallSections, CourseSections } from '../lib/parse-html';

let uniqueSeq = 1;
function course(id: string, sectionCount = 1): CourseSections {
  const sections = Array.from({ length: sectionCount }, () => ({
    unique: uniqueSeq++,
    meetings: [],
    instruction_mode: 'Face-to-face',
    instructor: 'Test',
    status: 'open',
    core: '',
  }));
  return { course: id, title: `${id} TITLE`, sections };
}

function term(slug: string, ids: string[]): TermInput {
  const courses: Record<string, CourseSections> = {};
  for (const id of ids) courses[id] = course(id);
  const data: FallSections = {
    semester: slug,
    semester_code: '00000',
    source: 'fixture',
    courses,
  };
  return { slug, data };
}

/** A healthy two-term corpus that includes every anchor course. */
function healthyCorpus(): TermInput[] {
  const anchors = [...ANCHOR_COURSES];
  // Every term carries all anchors plus a couple extras, so no dept is 0 and
  // counts are stable across terms.
  return [
    term('fall-2026', [...anchors, 'ECE 360K', 'M 408D']),
    term('spring-2027', [...anchors, 'ECE 460N', 'M 408L']),
  ];
}

// ─── deptOf ───────────────────────────────────────────────────────────────────

describe('deptOf', () => {
  it('extracts single-token dept', () => {
    expect(deptOf('ECE 302')).toBe('ECE');
  });
  it('extracts spaced two-token dept', () => {
    expect(deptOf('C S 314')).toBe('C S');
    expect(deptOf('F A 320K')).toBe('F A');
  });
});

// ─── Healthy corpus passes ────────────────────────────────────────────────────

describe('auditTerms — healthy', () => {
  it('passes (ok=true, no FAIL findings) on a clean corpus', () => {
    const result = auditTerms(healthyCorpus());
    const fails = result.findings.filter((f) => f.severity === 'FAIL');
    expect(fails).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

// ─── Broken: zero-count ───────────────────────────────────────────────────────

describe('auditTerms — zero-count', () => {
  it('FAILs when a dept present in one term is 0 in another', () => {
    // C S appears in fall (via anchor C S 314) but is entirely absent in spring.
    const corpus: TermInput[] = [
      term('fall-2026', [...ANCHOR_COURSES, 'ECE 360K']),
      // spring drops every C S course → C S = 0 there
      term('spring-2027', ['ECE 302', 'M 408C', 'PHY 303K', 'HIS 315K', 'ECE 360K']),
    ];
    const result = auditTerms(corpus);
    expect(result.ok).toBe(false);
    const zc = result.findings.filter((f) => f.check === 'zero-count' && f.severity === 'FAIL');
    expect(zc.length).toBeGreaterThan(0);
    expect(zc[0].message).toContain('C S');
    expect(zc[0].message).toContain('spring-2027');
  });
});

// ─── Broken: missing anchor ───────────────────────────────────────────────────

describe('auditTerms — anchors', () => {
  it('FAILs and names the missing anchor (silent dept rename)', () => {
    // Drop C S 314 entirely from the corpus — simulates a dept rename.
    const noCS = [...ANCHOR_COURSES].filter((a) => a !== 'C S 314');
    const corpus = [
      term('fall-2026', [...noCS, 'ECE 360K']),
      term('spring-2027', [...noCS, 'ECE 460N']),
    ];
    const result = auditTerms(corpus);
    expect(result.ok).toBe(false);
    const anchor = result.findings.find((f) => f.check === 'anchors' && f.severity === 'FAIL');
    expect(anchor).toBeDefined();
    expect(anchor!.message).toContain('C S 314');
  });
});

// ─── Broken: sections < courses ───────────────────────────────────────────────

describe('auditTerms — sections>=courses', () => {
  it('FAILs when a term has fewer sections than courses', () => {
    // Hand-build a term where one course has 0 sections (corruption the parser
    // normally strips, but which could leak via a bad merge).
    const courses: Record<string, CourseSections> = {};
    for (const id of ANCHOR_COURSES) courses[id] = course(id, 1);
    courses['ECE 999'] = { course: 'ECE 999', title: 'BROKEN', sections: [] };
    // Force sections < courses by giving every course 0 sections except none.
    for (const id of Object.keys(courses)) courses[id].sections = [];

    const corpus: TermInput[] = [
      { slug: 'fall-2026', data: { semester: 'f', semester_code: '0', source: 'x', courses } },
      term('spring-2027', [...ANCHOR_COURSES]),
    ];
    const result = auditTerms(corpus);
    expect(result.ok).toBe(false);
    const sc = result.findings.find((f) => f.check === 'sections>=courses' && f.severity === 'FAIL');
    expect(sc).toBeDefined();
    expect(sc!.message).toContain('fall-2026');
  });
});

// ─── Cross-term is WARN, not FAIL ─────────────────────────────────────────────

describe('auditTerms — cross-term', () => {
  it('emits WARN (not FAIL) on large seasonal swing — does not flip ok', () => {
    // ECE has many more courses in fall than spring, but neither is 0.
    const fallEce = ['ECE 302', 'ECE 360K', 'ECE 460N', 'ECE 411', 'ECE 445L', 'ECE 313'];
    const corpus: TermInput[] = [
      term('fall-2026', [...ANCHOR_COURSES, ...fallEce.filter((c) => c !== 'ECE 302')]),
      term('spring-2027', [...ANCHOR_COURSES]),
    ];
    const result = auditTerms(corpus);
    expect(result.ok).toBe(true); // WARN must not fail the audit
    const warn = result.findings.find((f) => f.check === 'cross-term' && f.severity === 'WARN');
    expect(warn).toBeDefined();
    expect(warn!.message).toContain('ECE');
  });
});
