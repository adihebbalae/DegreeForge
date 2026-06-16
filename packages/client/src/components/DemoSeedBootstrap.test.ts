// @vitest-environment jsdom
/**
 * DemoSeedBootstrap — PROFILE_SOURCE_KEY tests (fix #7).
 *
 * The "Exploring the example?" CTA is gated on localStorage key df:profile-source.
 * - Key absent or 'example' → CTA shows (isExampleOrEmpty = true).
 * - Key = 'user'            → CTA hides (isExampleOrEmpty = false).
 *
 * These tests verify the exported constant and the guard logic used in PlannerPage.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { PROFILE_SOURCE_KEY } from './DemoSeedBootstrap';

afterEach(() => {
  localStorage.removeItem(PROFILE_SOURCE_KEY);
});

// Mirrors PlannerPage's gate: safeGetRaw(PROFILE_SOURCE_KEY) !== 'user'
function isExampleOrEmpty(): boolean {
  return localStorage.getItem(PROFILE_SOURCE_KEY) !== 'user';
}

describe('PROFILE_SOURCE_KEY CTA gate (fix #7)', () => {
  it('exports the correct localStorage key', () => {
    expect(PROFILE_SOURCE_KEY).toBe('df:profile-source');
  });

  it('CTA shows when key is absent', () => {
    expect(isExampleOrEmpty()).toBe(true);
  });

  it('CTA shows when key is "example" (seeded demo)', () => {
    localStorage.setItem(PROFILE_SOURCE_KEY, 'example');
    expect(isExampleOrEmpty()).toBe(true);
  });

  it('CTA hides when key is "user" (after successful import)', () => {
    localStorage.setItem(PROFILE_SOURCE_KEY, 'user');
    expect(isExampleOrEmpty()).toBe(false);
  });
});
