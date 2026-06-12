/**
 * equivalence.test.ts — E3 (Brief 2, equivalence sub-PR)
 *
 * THE equivalence registry. Pins:
 *   1. transitive symmetric closure (legacy ↔ canonical ↔ honors ↔ cross-dept),
 *   2. directional transfer satisfaction (never symmetric),
 *   3. the cross-engine coherence guarantee: expandSatisfied (solver side) and
 *      satisfiesRequirement (prereq-check side) can never disagree,
 *   4. the BME 311 resolution (no automatic equivalence — see
 *      .agents/data-diffs/e3-equivalence.md).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getEquivalenceRegistry,
  expandSatisfied,
  satisfiesRequirement,
} from './equivalence';
import { expandVariants } from './variants';
import { isRequirementSatisfied } from './requirements';
import type { DegreeRequirements } from '../types';

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const registry = getEquivalenceRegistry(degreeReqs);

// ─── 1. Symmetric transitive closure ──────────────────────────────────────────

describe('equivalence registry — symmetric closure', () => {
  it('legacy ↔ canonical ↔ honors are all mutual (ECE 302 family)', () => {
    for (const taken of ['ECE 302', 'ECE 402', 'ECE 302H']) {
      const expanded = expandSatisfied(taken, registry);
      expect(expanded).toEqual(expect.arrayContaining(['ECE 302', 'ECE 402', 'ECE 302H']));
    }
  });

  it('cross-dept reaches through the closure: C S 312 satisfies the renumbered ECE 412', () => {
    expect(satisfiesRequirement('ECE 412', new Set(['C S 312']), registry)).toBe(true);
    expect(satisfiesRequirement('ECE 312', new Set(['C S 312']), registry)).toBe(true);
  });

  it('the 306 family spans ECE/BME/CS labels', () => {
    const expanded = expandSatisfied('BME 306', registry);
    expect(expanded).toEqual(
      expect.arrayContaining(['ECE 306', 'ECE 306H', 'ECE 406', 'BME 306', 'C S 429'])
    );
  });
});

// ─── 2. Directional transfer satisfaction ─────────────────────────────────────

describe('equivalence registry — directional transfer', () => {
  it('M 411 satisfies M 340L', () => {
    expect(satisfiesRequirement('M 340L', new Set(['M 411']), registry)).toBe(true);
    expect(expandSatisfied('M 411', registry)).toContain('M 340L');
  });

  it('the reverse is NOT granted: M 340L earns no M 411 credit', () => {
    expect(satisfiesRequirement('M 411', new Set(['M 340L']), registry)).toBe(false);
    expect(expandSatisfied('M 340L', registry)).not.toContain('M 411');
  });

  it('M 508M satisfies both M 408C and M 408D', () => {
    const taken = new Set(['M 508M']);
    expect(satisfiesRequirement('M 408C', taken, registry)).toBe(true);
    expect(satisfiesRequirement('M 408D', taken, registry)).toBe(true);
  });
});

// ─── 3. Cross-engine coherence (the E3 contract) ──────────────────────────────

describe('solver side and prereq-check side can never disagree', () => {
  // Every course mentioned anywhere in the registry
  const allIds = new Set<string>();
  for (const cls of registry.classOf.values()) for (const id of cls) allIds.add(id);
  for (const [k, targets] of registry.satisfiesOf) {
    allIds.add(k);
    for (const t of targets) allIds.add(t);
  }

  it('expandVariants(taken) ∋ required ⇔ isRequirementSatisfied(required, {taken})', () => {
    for (const taken of allIds) {
      const expanded = new Set(expandVariants(taken, degreeReqs));
      for (const required of allIds) {
        const viaExpand = expanded.has(required);
        const viaCheck = isRequirementSatisfied(required, new Set([taken]));
        expect(
          viaCheck,
          `${taken} → ${required}: expandVariants says ${viaExpand}, isRequirementSatisfied says ${viaCheck}`
        ).toBe(viaExpand);
      }
    }
  });
});

// ─── 4. BME 311 resolution ────────────────────────────────────────────────────

describe('BME 311 — contradictory claims dropped', () => {
  it('carries no automatic equivalence (graph edges still apply where authored)', () => {
    expect(expandSatisfied('BME 311', registry)).toEqual(['BME 311']);
    expect(satisfiesRequirement('ECE 319K', new Set(['BME 311']), registry)).toBe(false);
  });
});
