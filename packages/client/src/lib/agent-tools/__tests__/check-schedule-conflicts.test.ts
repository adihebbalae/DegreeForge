import { describe, it, expect } from 'vitest';
import { checkScheduleConflicts } from '../check-schedule-conflicts';
import { FIXTURE_CTX } from './fixture';

describe('checkScheduleConflicts', () => {
  it('detects a conflict when two courses overlap in time', () => {
    // In fixture, Fall 2026 has ECE 306 (MWF 9:30-10:30) and ECE 312 (no sections in fixture)
    // ECE 302 (MWF 9:00-10:00) and ECE 306 (MWF 9:30-10:30) overlap
    // We set up a semester with both conflicting courses
    const ctx = {
      ...FIXTURE_CTX,
      plan: { ...FIXTURE_CTX.plan, 'Fall 2026': ['ECE 302', 'ECE 306'] },
    };
    const result = checkScheduleConflicts(ctx, { semester_id: 'Fall 2026' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.has_conflicts).toBe(true);
    expect((content.conflicts as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns no conflicts for an empty semester', () => {
    const result = checkScheduleConflicts(FIXTURE_CTX, { semester_id: 'Spring 2027' });
    const content = result.content as Record<string, unknown>;
    expect(content.has_conflicts).toBe(false);
  });

  it('returns error if semester_id is missing', () => {
    const result = checkScheduleConflicts(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });

  it('returns note when no section data is available', () => {
    const ctx = { ...FIXTURE_CTX, fallSections: null };
    const result = checkScheduleConflicts(ctx, { semester_id: 'Fall 2026' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.note).toBeTruthy();
  });
});
