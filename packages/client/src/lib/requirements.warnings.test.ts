/**
 * requirements.warnings.test.ts
 *
 * Wiring-regression guard for the manual-slots step in FirstRunTour.
 *
 * The tour's manual-slots step renders live warnings produced by
 * computeRemainingRequired(). This test loads the REAL production data and
 * asserts those warnings are present and contain the expected strings, so a
 * future change that silently returns [] (wrong hook, bad techCoreId, degree-JSON
 * schema drift) will fail loudly here before the step ships empty.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { DegreeRequirements, TechCores, MathRequirements } from '../types';
import { computeRemainingRequired } from './requirements';

// ─── Real data loader (same pattern as auto-planner.test.ts) ─────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');

// Default tech-core id — matches SettingsContext initial value ('computer_architecture').
const DEFAULT_TECH_CORE_ID = 'computer_architecture';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeRemainingRequired — manual-selection warnings wiring', () => {
  it('produces at least one warning when no courses are satisfied', () => {
    const techCore = techCores[DEFAULT_TECH_CORE_ID];
    const { warnings } = computeRemainingRequired(
      degreeReqs,
      techCore,
      mathReqs,
      false,
      new Set<string>()
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('includes a free-electives manual-selection warning', () => {
    const techCore = techCores[DEFAULT_TECH_CORE_ID];
    const { warnings } = computeRemainingRequired(
      degreeReqs,
      techCore,
      mathReqs,
      false,
      new Set<string>()
    );
    expect(warnings.some((w) => /free electives are left for manual selection/i.test(w))).toBe(true);
  });

  it('includes at least one list_of_approved slot warning (manual selection from approved list)', () => {
    const techCore = techCores[DEFAULT_TECH_CORE_ID];
    const { warnings } = computeRemainingRequired(
      degreeReqs,
      techCore,
      mathReqs,
      false,
      new Set<string>()
    );
    expect(warnings.some((w) => /manual selection from approved list/i.test(w))).toBe(true);
  });
});
