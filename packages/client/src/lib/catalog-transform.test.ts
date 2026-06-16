/**
 * catalog-transform.test.ts — pins the pure transform logic that builds
 * course-catalog.json from the UT course feed (scripts/catalog/build-catalog.ts).
 *
 * The driver script is thin I/O; all the logic worth testing (dedup picking max
 * credits, the merge preserving existing entries verbatim, core-label → CoreCategory
 * mapping, description/grading selection) lives in catalog-transform.ts and is
 * exercised here. Imported across the package boundary via relative path — the
 * module is pure TS with no fs/network/React, so it runs fine under vitest.
 */

import { describe, it, expect } from 'vitest';
import {
  mapCoreLabels,
  courseIdOf,
  normalizeDept,
  selectDescription,
  detectGrading,
  dedupRows,
  mergeCatalog,
  CORE_LABEL_MAP,
  type UtCourseRow,
} from '../../../../scripts/catalog/catalog-transform';
import type { CourseCatalog } from '../types';

describe('mapCoreLabels', () => {
  it('maps each UT label to its CoreCategory', () => {
    expect(mapCoreLabels(['Visual and Performing Arts'])).toEqual(['vapa']);
    expect(mapCoreLabels(['Social and Behavioral Sciences'])).toEqual(['sbs']);
    expect(mapCoreLabels(['U.S. History'])).toEqual(['his']);
    expect(mapCoreLabels(['American and Texas Government'])).toEqual(['gov']);
    expect(mapCoreLabels(['First-Year Signature Course'])).toEqual(['ugs']);
    expect(mapCoreLabels(['Humanities'])).toEqual(['humanities']);
    expect(mapCoreLabels(['Communication'])).toEqual(['communication']);
    expect(mapCoreLabels(['Mathematics'])).toEqual(['math']);
  });

  it('collapses both Natural Science labels to one bucket', () => {
    expect(mapCoreLabels(['Natural Science and Technology, Part I'])).toEqual(['natural_science']);
    expect(mapCoreLabels(['Natural Science and Technology, Part II'])).toEqual(['natural_science']);
    expect(
      mapCoreLabels(['Natural Science and Technology, Part I', 'Natural Science and Technology, Part II'])
    ).toEqual(['natural_science']);
  });

  it('returns a sorted, deduped multi-category set', () => {
    // Order in input is reversed vs CORE_ORDER; output must follow CORE_ORDER.
    expect(mapCoreLabels(['Humanities', 'Visual and Performing Arts'])).toEqual(['vapa', 'humanities']);
  });

  it('returns undefined for empty / unrecognized labels', () => {
    expect(mapCoreLabels([])).toBeUndefined();
    expect(mapCoreLabels(undefined)).toBeUndefined();
    expect(mapCoreLabels(['Some Unknown Flag'])).toBeUndefined();
  });

  it('CORE_LABEL_MAP covers exactly the 10 distinct UT labels', () => {
    expect(Object.keys(CORE_LABEL_MAP)).toHaveLength(10);
  });
});

describe('courseIdOf / normalizeDept', () => {
  it('builds "<dept> <number>" and normalizes E E → ECE', () => {
    expect(courseIdOf({ department: 'PHY', number: '303K' })).toBe('PHY 303K');
    expect(courseIdOf({ department: 'E E', number: '411' })).toBe('ECE 411');
    expect(normalizeDept('E E')).toBe('ECE');
    expect(normalizeDept('PHY')).toBe('PHY');
  });

  it('returns null for malformed rows', () => {
    expect(courseIdOf({ number: '303K' })).toBeNull();
    expect(courseIdOf({ department: 'PHY' })).toBeNull();
    expect(courseIdOf({ department: '  ', number: '303K' })).toBeNull();
  });
});

describe('selectDescription', () => {
  it('keeps the human blurb and drops metadata lines', () => {
    const lines = [
      'A general survey of physics; laws of motion, heat, and waves.',
      'Prerequisite: Mathematics 408C with a grade of at least C.',
      'Restricted to students in the College of Natural Sciences.',
      'Offered on the letter-grade basis only.',
      'Same As : PHY 301',
      'Designed to accommodate 100 or more students.',
    ];
    expect(selectDescription(lines)).toBe(
      'A general survey of physics; laws of motion, heat, and waves.'
    );
  });

  it('unwraps a "Topic description:" prefix', () => {
    const lines = [
      'Prerequisite: Additional prerequisites vary with the topic.',
      'Topic description: Explore the relationship between firms and society.',
    ];
    expect(selectDescription(lines)).toBe(
      'Explore the relationship between firms and society.'
    );
  });

  it('returns empty string when nothing descriptive remains', () => {
    expect(selectDescription(['Offered on the pass/fail basis only.'])).toBe('');
    expect(selectDescription([])).toBe('');
    expect(selectDescription(undefined)).toBe('');
  });
});

describe('detectGrading', () => {
  it('detects pass/fail and credit/no-credit, defaults to letter', () => {
    expect(detectGrading(['Offered on the letter-grade basis only.'])).toBe('letter');
    expect(detectGrading(['Offered on the pass/fail basis only.'])).toBe('pass/fail');
    expect(detectGrading(['Some blurb.', 'Offered on the pass/fail basis only.'])).toBe('pass/fail');
    expect(detectGrading(undefined)).toBe('letter');
  });
});

describe('dedupRows', () => {
  it('collapses sections into one entry, picking MAX credits', () => {
    const rows: UtCourseRow[] = [
      { department: 'PHY', number: '303K', courseName: 'Engineering Physics I', creditHours: 0, description: ['short'] },
      { department: 'PHY', number: '303K', courseName: 'Engineering Physics I', creditHours: 3, description: ['a much longer descriptive sentence here'] },
    ];
    const out = dedupRows(rows);
    expect(Object.keys(out)).toEqual(['PHY 303K']);
    expect(out['PHY 303K'].credits).toBe(3);
    // longest description wins
    expect(out['PHY 303K'].description).toBe('a much longer descriptive sentence here');
  });

  it('unions core labels across sections of the same course', () => {
    const rows: UtCourseRow[] = [
      { department: 'XYZ', number: '101', courseName: 'X', creditHours: 3, core: ['Visual and Performing Arts'] },
      { department: 'XYZ', number: '101', courseName: 'X', creditHours: 3, core: ['Humanities'] },
    ];
    const out = dedupRows(rows);
    expect(out['XYZ 101'].core).toEqual(['vapa', 'humanities']);
  });

  it('emits empty prerequisites/corequisites and skips malformed rows', () => {
    const rows: UtCourseRow[] = [
      { department: 'HIS', number: '315K', courseName: 'US History', creditHours: 3, core: ['U.S. History'], description: ['Survey of US history.'] },
      { number: '999' }, // malformed — no department
    ];
    const out = dedupRows(rows);
    expect(Object.keys(out)).toEqual(['HIS 315K']);
    expect(out['HIS 315K'].prerequisites).toEqual([]);
    expect(out['HIS 315K'].corequisites).toEqual([]);
    expect(out['HIS 315K'].core).toEqual(['his']);
  });

  it('leaves core undefined for courses with no recognized core label', () => {
    const out = dedupRows([{ department: 'ARI', number: '310K', courseName: 'Design I', creditHours: 3, core: [] }]);
    expect(out['ARI 310K'].core).toBeUndefined();
  });
});

describe('mergeCatalog', () => {
  const existing: CourseCatalog = {
    'ECE 302': {
      id: 'ECE 302',
      title: 'Introduction to Electrical Engineering',
      credits: 3,
      description: 'curated blurb',
      prerequisites: ['M 408C'],
      corequisites: ['M 408C'],
      grading: 'letter',
      department: 'ECE',
    },
  };

  it('preserves an existing ECE entry verbatim and ADDS new courses', () => {
    const deduped = dedupRows([
      // collides with existing ECE 302 — the UT feed version must be ignored
      { department: 'ECE', number: '302', courseName: 'WRONG', creditHours: 4, description: ['scraped blurb'], core: ['Communication'] },
      // genuinely new
      { department: 'PHY', number: '303K', courseName: 'Engineering Physics I', creditHours: 3, description: ['Physics blurb.'], core: ['Natural Science and Technology, Part I'] },
    ]);
    const { catalog, added, preserved } = mergeCatalog(existing, deduped);

    // ECE 302 is byte-for-byte the curated entry — NOT the scraped one.
    expect(catalog['ECE 302']).toEqual(existing['ECE 302']);
    expect(catalog['ECE 302'].prerequisites).toEqual(['M 408C']);
    expect(catalog['ECE 302'].title).toBe('Introduction to Electrical Engineering');
    expect('core' in catalog['ECE 302']).toBe(false);

    // PHY 303K added.
    expect(catalog['PHY 303K'].core).toEqual(['natural_science']);
    expect(added).toEqual(['PHY 303K']);
    expect(preserved).toEqual(['ECE 302']);
  });

  it('produces sorted, stable key order', () => {
    const deduped = dedupRows([
      { department: 'ZZZ', number: '100', courseName: 'Z', creditHours: 3 },
      { department: 'AAA', number: '100', courseName: 'A', creditHours: 3 },
    ]);
    const { catalog } = mergeCatalog(existing, deduped);
    const keys = Object.keys(catalog);
    expect(keys).toEqual([...keys].sort());
  });
});
