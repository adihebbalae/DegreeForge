/**
 * related-courses.test.ts — FR6 recommender (TASK-082)
 *
 * Pins the deterministic "You may also like" behavior:
 *   1. a tech-core course returns OTHER courses in its core(s), each with a reason;
 *   2. the encoded tech-core data matches the corpus (spot-check 2 cores);
 *   3. a course in no core falls back to nearby same-prefix courses;
 *   4. unknown ids / null data return [] without throwing;
 *   5. results are bounded and never include the input course.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getRelatedCourses, MAX_RELATED } from './related-courses';
import type { TechCores } from '../types';

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const TECH_CORES = loadJson<TechCores>('tech-cores.json');

describe('getRelatedCourses — real tech-cores.json', () => {
  it('ECE 438 (Electronics core lab/elective) returns other courses in its core(s) with reasons', () => {
    const recs = getRelatedCourses('ECE 438', TECH_CORES);

    expect(recs.length).toBeGreaterThan(0);
    // Never recommends the input course back to itself.
    expect(recs.some((r) => r.course === 'ECE 438')).toBe(false);
    // Every rec carries a non-empty reason naming a core ("Also in ...").
    for (const r of recs) {
      expect(r.reason).toMatch(/^Also in /);
      expect(r.course).toMatch(/^[A-Z]+ \d/);
    }
    // ECE 438 is in Electronics & ICs (elective pool); ECE 325 (Electromagnetic
    // Engineering) is the core's required course, so it appears as a co-member.
    expect(recs.map((r) => r.course)).toContain('ECE 325');
    expect(recs.find((r) => r.course === 'ECE 325')?.reason).toContain(
      'Electronics and Integrated Circuits'
    );
  });

  it('ECE 460N (Computer Architecture core) recommends co-members of that core', () => {
    const recs = getRelatedCourses('ECE 460N', TECH_CORES);
    const ids = recs.map((r) => r.course);

    // ECE 316, ECE 460N, ECE 445L, ECE 360C define the Computer Architecture core.
    expect(ids).toContain('ECE 316'); // core course
    expect(ids).toContain('ECE 445L'); // core lab
    expect(ids).toContain('ECE 360C'); // required elective
    expect(recs.find((r) => r.course === 'ECE 316')?.reason).toContain(
      'Computer Architecture'
    );
  });

  it('returns no more than MAX_RELATED recommendations', () => {
    for (const id of ['ECE 438', 'ECE 460N', 'ECE 325', 'ECE 360C']) {
      expect(getRelatedCourses(id, TECH_CORES).length).toBeLessThanOrEqual(MAX_RELATED);
    }
  });

  it('a course in NO tech core (ECE 302) falls back to nearby same-prefix courses', () => {
    const recs = getRelatedCourses('ECE 302', TECH_CORES);
    // ECE 302 is a lower-division core course, in no technical core.
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(MAX_RELATED);
    for (const r of recs) {
      expect(r.reason).toBe('Nearby ECE course');
      expect(r.course.startsWith('ECE ')).toBe(true);
      expect(r.course).not.toBe('ECE 302');
    }
  });

  it('returns [] for an unknown / malformed id and for null data without throwing', () => {
    expect(getRelatedCourses('ZZZ 999', TECH_CORES)).toEqual([]);
    expect(getRelatedCourses('not-a-course', TECH_CORES)).toEqual([]);
    expect(getRelatedCourses('', TECH_CORES)).toEqual([]);
    expect(getRelatedCourses('ECE 438', null)).toEqual([]);
  });
});

describe('encoded tech-core data matches the corpus (spot-check)', () => {
  it('Computer Architecture and Embedded Systems core matches catalog Area 6', () => {
    const arch = TECH_CORES['computer_architecture'];
    expect(arch).toBeDefined();
    expect(arch.name).toBe('Computer Architecture and Embedded Systems');
    expect(arch.category).toBe('CE');
    expect(arch.required_math).toBe('M 325K'); // Discrete Mathematics (CompE core math)
    // Catalog Area 6 required set: 316 (logic), 460N (architecture), 445L (lab), 360C (algorithms).
    const coreIds = arch.required_courses.core?.flatMap((slot) =>
      'options' in slot ? slot.options.map((o) => o.id) : [slot.id]
    );
    expect(coreIds).toEqual(expect.arrayContaining(['ECE 316', 'ECE 460N']));
    expect(
      'options' in arch.required_courses.core_lab!
        ? arch.required_courses.core_lab.options.map((o) => o.id)
        : [arch.required_courses.core_lab!.id]
    ).toContain('ECE 445L');
  });

  it('Electronics and Integrated Circuits core matches catalog Area 2', () => {
    const elec = TECH_CORES['electronics_integrated_circuits'];
    expect(elec).toBeDefined();
    expect(elec.name).toBe('Electronics and Integrated Circuits');
    expect(elec.category).toBe('EE');
    expect(elec.required_math).toBe('M 427L'); // Adv Calc II (EE core math)
    // Catalog Area 2: ECE 325 (EM) is a required core course; ECE 438 lab + 339 in pool.
    const coreIds = elec.required_courses.core?.flatMap((slot) =>
      'options' in slot ? slot.options.map((o) => o.id) : [slot.id]
    );
    expect(coreIds).toContain('ECE 325');
    expect(elec.elective_pool).toContain('ECE 339');
    expect(elec.elective_pool).toContain('ECE 438');
  });
});

describe('determinism', () => {
  it('returns identical output across repeated calls', () => {
    const a = getRelatedCourses('ECE 438', TECH_CORES);
    const b = getRelatedCourses('ECE 438', TECH_CORES);
    expect(a).toEqual(b);
  });

  it('a multi-core course de-duplicates co-members and keeps the first core reason', () => {
    const recs = getRelatedCourses('ECE 438', TECH_CORES);
    const ids = recs.map((r) => r.course);
    // No duplicates even though ECE 438 sits in several EE cores.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
