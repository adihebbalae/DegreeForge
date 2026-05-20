import { describe, it, expect } from 'vitest';
import { getCreditProgress } from '../get-credit-progress';
import { FIXTURE_CTX } from './fixture';

describe('getCreditProgress', () => {
  it('returns credit progress fields', () => {
    const result = getCreditProgress(FIXTURE_CTX, {});
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(typeof content.total_required).toBe('number');
    expect(typeof content.completed_hours).toBe('number');
    expect(typeof content.in_progress_hours).toBe('number');
    expect(typeof content.planned_future_hours).toBe('number');
    expect(typeof content.percent_complete).toBe('number');
  });

  it('counts completed course hours', () => {
    const result = getCreditProgress(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    // Fixture has M 408C (4 hours) completed
    expect(content.completed_hours).toBe(4);
  });

  it('counts in-progress course hours', () => {
    const result = getCreditProgress(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    // Fixture has ECE 302 (3 hours) in progress
    expect(content.in_progress_hours).toBe(3);
  });
});
