import { describe, it, expect } from 'vitest';
import { isBlockedPastDrop, canReverseSemester } from './past-drop';
import type { Semester } from '../types';

// Chronological list: one past, one current, one future term.
const SEMESTERS: Semester[] = [
  { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' },
  { id: 'Spring 2026', label: "Sp '26", status: 'current', year: 2026, season: 'Spring' },
  { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' },
];

describe('isBlockedPastDrop', () => {
  it('blocks a palette add dropped onto a past semester', () => {
    expect(isBlockedPastDrop('Fall 2025', 'palette', undefined, SEMESTERS)).toBe(true);
  });

  it('blocks a timeline move from a different semester onto a past semester', () => {
    expect(isBlockedPastDrop('Fall 2025', 'timeline', 'Spring 2026', SEMESTERS)).toBe(true);
  });

  it('does NOT block a same-semester reorder within a past term (reorder is allowed)', () => {
    expect(isBlockedPastDrop('Fall 2025', 'timeline', 'Fall 2025', SEMESTERS)).toBe(false);
  });

  it('does NOT block a palette add dropped onto a current semester', () => {
    expect(isBlockedPastDrop('Spring 2026', 'palette', undefined, SEMESTERS)).toBe(false);
  });

  it('does NOT block a move onto a future semester', () => {
    expect(isBlockedPastDrop('Fall 2026', 'timeline', 'Spring 2026', SEMESTERS)).toBe(false);
  });

  it('returns false when the target id is unknown (no matching past term)', () => {
    expect(isBlockedPastDrop('Nope 9999', 'palette', undefined, SEMESTERS)).toBe(false);
  });
});

describe('canReverseSemester', () => {
  it('is true when a past term precedes the current term', () => {
    expect(canReverseSemester(SEMESTERS)).toBe(true);
  });

  it('is false when the current term is the earliest (no past to retreat into)', () => {
    const noPast: Semester[] = [
      { id: 'Spring 2026', label: "Sp '26", status: 'current', year: 2026, season: 'Spring' },
      { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' },
    ];
    expect(canReverseSemester(noPast)).toBe(false);
  });

  it('is false when there is no current term at all', () => {
    const noCurrent: Semester[] = [
      { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' },
      { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' },
    ];
    expect(canReverseSemester(noCurrent)).toBe(false);
  });
});
