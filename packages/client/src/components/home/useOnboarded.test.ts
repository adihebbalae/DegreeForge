/**
 * @vitest-environment jsdom
 *
 * useOnboarded — derivation logic tests (TASK-105 critic fix)
 *
 * Verifies the Zod-guarded onboarded derivation, specifically the "wizard
 * completed but import skipped" case that the previous bare JSON.parse + name/
 * courses check misclassified.
 *
 * Uses relative imports only (no @/ alias) so the test resolves correctly
 * without depending on the Vite alias config being loaded by Vitest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PROFILE_STORAGE_KEY, EMPTY_PROFILE } from '../../context/ProfileContext';
import { useOnboarded } from './useOnboarded';

// Build a minimal storable profile blob
function storeProfile(overrides: Record<string, unknown>) {
  const profile = { ...EMPTY_PROFILE, ...overrides };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

describe('useOnboarded', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns false when no profile is stored (true first-timer)', () => {
    expect(useOnboarded()).toBe(false);
  });

  it('returns false for a fully-empty profile (EMPTY_PROFILE defaults)', () => {
    storeProfile({});
    expect(useOnboarded()).toBe(false);
  });

  it('returns true when only graduation_target is set (skipped import)', () => {
    // This is the bug: name='', empty arrays, but graduation_target set.
    // The previous derivation returned false; the fix makes it return true.
    storeProfile({ name: '', completed_courses: [], in_progress_courses: [], graduation_target: 'Spring 2028' });
    expect(useOnboarded()).toBe(true);
  });

  it('returns true when name is set', () => {
    storeProfile({ name: 'Alice' });
    expect(useOnboarded()).toBe(true);
  });

  it('returns true when completed_courses is non-empty', () => {
    storeProfile({
      completed_courses: [{
        course: 'ECE 302',
        title: 'Intro to EE',
        grade: 'A',
        semester: 'Fall 2023',
        type: 'Imported',
        credit_hours: 3,
        source: 'in_residence',
      }],
    });
    expect(useOnboarded()).toBe(true);
  });

  it('returns true when in_progress_courses is non-empty', () => {
    storeProfile({
      in_progress_courses: [{
        course: 'ECE 302',
        title: 'Intro to EE',
        semester: 'Fall 2024',
        credit_hours: 3,
      }],
    });
    expect(useOnboarded()).toBe(true);
  });

  it('returns false when graduation_target is empty string', () => {
    storeProfile({ graduation_target: '', name: '', completed_courses: [], in_progress_courses: [] });
    expect(useOnboarded()).toBe(false);
  });

  it('returns false on corrupt JSON', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'not-valid-json{{{');
    expect(useOnboarded()).toBe(false);
  });
});
