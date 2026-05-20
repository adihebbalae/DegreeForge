import { describe, it, expect } from 'vitest';
import { getSectionInfo } from '../get-section-info';
import { FIXTURE_CTX } from './fixture';

describe('getSectionInfo', () => {
  it('returns sections for a known course', () => {
    const result = getSectionInfo(FIXTURE_CTX, { course_id: 'ECE 302' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.course_id).toBe('ECE 302');
    expect((content.sections as unknown[]).length).toBeGreaterThan(0);
    expect(content.semester).toBe('Fall 2026');
  });

  it('returns empty sections with a note for unlisted course', () => {
    const result = getSectionInfo(FIXTURE_CTX, { course_id: 'ECE 999' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect((content.sections as unknown[]).length).toBe(0);
    expect(content.note).toBeTruthy();
  });

  it('returns note when fallSections is null', () => {
    const ctx = { ...FIXTURE_CTX, fallSections: null };
    const result = getSectionInfo(ctx, { course_id: 'ECE 302' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.note).toBeTruthy();
  });

  it('returns error if course_id missing', () => {
    const result = getSectionInfo(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
