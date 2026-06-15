/**
 * equivalence.ts — E3 (Brief 2, equivalence sub-PR)
 *
 * THE single course-equivalence registry. Every "does taking X satisfy a
 * requirement for Y" question in the app — solver/auto-planner satisfied sets
 * (via variants.expandVariants), graph-engine CNF prereq checks (via
 * requirements.isRequirementSatisfied), and progress counting — resolves
 * through the registry built here, so prereq-satisfaction and
 * requirement-satisfaction can never disagree.
 *
 * Two relations, deliberately distinct:
 *   1. SYMMETRIC equivalence classes — honors variants, the 2026 catalog
 *      renumber, and cross-department listings. Same course, different label:
 *      membership is mutual and transitive (union-find closure at build time).
 *   2. DIRECTIONAL transfer satisfaction — credit for K also grants credit
 *      toward T (e.g. M 411 ⊨ M 340L), but NOT the reverse: taking M 340L
 *      earns no M 411 credit. A plain union registry would wrongly
 *      symmetrize this.
 *
 * Sources merged here (formerly three divergent engines):
 *   - variants.ts COURSE_EQUIVALENTS + TRANSFER_EQUIVALENTS (solver side)
 *   - requirements.ts EQUIVALENCE_GROUPS / EQUIVALENCE_MAP (prereq-check side)
 *   - progress.ts inline honors+legacy normalization (progress side)
 *   - catalog-rename.ts LEGACY_TO_CANONICAL (kept there; consumed here)
 *   - degree-requirements.json ece_core.honors_variants (merged per-build;
 *     the static groups already cover today's three pairs)
 *
 * Resolved contradiction (see .agents/data-diffs/e3-equivalence.md): BME 311
 * was claimed ≡ ECE 319K/H (embedded) by variants.ts and ≡ ECE 311 (circuits)
 * by requirements.ts. The graph's own edges (BME 311 → ECE 438/445L) and
 * prereq-cnf.ts support the circuits reading; both claims are dropped — the
 * explicit BME 311 prereq edges in the graph still apply where authored.
 *
 * Pure TypeScript — no React, no I/O.
 */

import { LEGACY_TO_CANONICAL } from './catalog-rename';
import type { DegreeRequirements } from '../types';

// ─── Source tables ────────────────────────────────────────────────────────────

/**
 * Symmetric equivalence groups: same course under different labels
 * (honors / 2026 renumber / cross-department). Closed transitively at build.
 */
const EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
  // Intro to EE (+ 2026 renumber, honors)
  ['ECE 302', 'ECE 302H', 'ECE 402'],
  // Intro to Computing (+ renumber, honors, BME/CS cross-lists)
  ['ECE 306', 'ECE 306H', 'ECE 406', 'BME 306', 'C S 429'],
  // Software Design (+ renumber, honors, CS cross-list)
  ['ECE 312', 'ECE 312H', 'ECE 412', 'C S 312'],
  // Intro to Embedded Systems (+ renumber, honors)
  ['ECE 319K', 'ECE 319H', 'ECE 419K'],
  // Technical Communication (BME cross-list)
  ['ECE 333T', 'BME 333T'],
  // Data Structures (CS cross-list + honors)
  ['ECE 422C', 'C S 314', 'C S 314H'],
  // Discrete Math
  ['M 325K', 'C S 311'],
];

/**
 * Directional transfer satisfaction: completing the KEY also satisfies each
 * VALUE requirement. Never symmetric.
 */
const TRANSFER_SATISFIES: Readonly<Record<string, readonly string[]>> = {
  'M 411': ['M 340L'],
  'M 508M': ['M 408C', 'M 408D'],
};

/**
 * 2026-28 catalog: PHY 303L + PHY 105N (4 hr combined) are replaced by
 * PHY 303E (3 hr). A returning student who completed BOTH old courses
 * satisfies the PHY 303E requirement; the net is -1 hr (no re-take needed).
 *
 * This is a 2-course → 1-course replacement — not a 1:1 symmetric rename and
 * not a simple directional transfer — so it cannot be cleanly encoded in
 * EQUIVALENCE_GROUPS or TRANSFER_SATISFIES without adding a companion-required
 * condition neither data structure currently supports.
 *
 * TODO(returning-student-wiring): When the returning-student dedup path is
 * wired (downstream of TASK-102), check BOTH PHY 303L and PHY 105N in the
 * student's completed set before granting PHY 303E satisfaction. The -1 hr
 * delta means the solver's credit total for that student also decreases by 1.
 *
 * Source: https://www.ece.utexas.edu/academics/undergraduate/admissions#notes-on-the-26-28-catalog
 * Effective: 2026-28 catalog year only.
 */
export const PHY_303L_105N_REPLACES_303E = {
  takenOld: ['PHY 303L', 'PHY 105N'] as const,
  satisfiesNew: 'PHY 303E',
  hoursOld: 4,
  hoursNew: 3,
  hoursDelta: -1,
} as const;

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface EquivalenceRegistry {
  /** courseId → all members of its symmetric class (incl. itself). */
  classOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** takenId → everything that taking it satisfies (its class ∪ directional targets' classes). */
  satisfiesOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** requiredId → courses beyond its own class whose completion satisfies it. */
  satisfiedBy: ReadonlyMap<string, ReadonlySet<string>>;
}

function buildRegistry(degreeReqs: DegreeRequirements | null): EquivalenceRegistry {
  // Union-find over all symmetric pairs
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = parent.get(x);
    if (r === undefined) {
      parent.set(x, x);
      return x;
    }
    if (r !== x) {
      r = find(r);
      parent.set(x, r);
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const group of EQUIVALENCE_GROUPS) {
    for (let i = 1; i < group.length; i++) union(group[0], group[i]);
  }
  for (const [legacy, canonical] of Object.entries(LEGACY_TO_CANONICAL)) {
    union(legacy, canonical);
  }
  // honors_variants from degree-requirements.json (canonical → honors). The
  // static groups already cover the shipped three pairs; this picks up any
  // future data-authored additions.
  if (degreeReqs) {
    for (const [canonical, honors] of Object.entries(degreeReqs.ece_core.honors_variants ?? {})) {
      union(canonical, honors);
    }
  }

  // Materialize classes
  const members = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const root = find(id);
    let set = members.get(root);
    if (!set) {
      set = new Set();
      members.set(root, set);
    }
    set.add(id);
  }
  const classOf = new Map<string, ReadonlySet<string>>();
  for (const set of members.values()) {
    for (const id of set) classOf.set(id, set);
  }

  const classMembers = (id: string): readonly string[] => {
    const c = classOf.get(id);
    return c ? Array.from(c) : [id];
  };

  // Directional satisfaction, lifted to whole classes on both sides
  const satisfiesOf = new Map<string, Set<string>>();
  const satisfiedBy = new Map<string, Set<string>>();
  for (const [taken, targets] of Object.entries(TRANSFER_SATISFIES)) {
    for (const takenMember of classMembers(taken)) {
      const out = satisfiesOf.get(takenMember) ?? new Set<string>();
      for (const target of targets) for (const t of classMembers(target)) out.add(t);
      satisfiesOf.set(takenMember, out);
    }
    for (const target of targets) {
      for (const targetMember of classMembers(target)) {
        const sources = satisfiedBy.get(targetMember) ?? new Set<string>();
        for (const k of classMembers(taken)) sources.add(k);
        satisfiedBy.set(targetMember, sources);
      }
    }
  }

  return { classOf, satisfiesOf, satisfiedBy };
}

// Memoization: one registry per DegreeRequirements object + a static base.
const registryCache = new WeakMap<DegreeRequirements, EquivalenceRegistry>();
const baseRegistry = buildRegistry(null);

/**
 * THE registry accessor. Pass degreeReqs when available so data-authored
 * honors variants are merged; the static base covers all shipped pairs.
 */
export function getEquivalenceRegistry(
  degreeReqs?: DegreeRequirements | null
): EquivalenceRegistry {
  if (!degreeReqs) return baseRegistry;
  let reg = registryCache.get(degreeReqs);
  if (!reg) {
    reg = buildRegistry(degreeReqs);
    registryCache.set(degreeReqs, reg);
  }
  return reg;
}

// ─── Read API ─────────────────────────────────────────────────────────────────

/**
 * Everything that taking `courseId` satisfies: its symmetric class plus any
 * directional transfer targets (and their classes). Always includes itself.
 */
export function expandSatisfied(
  courseId: string,
  registry: EquivalenceRegistry
): string[] {
  const out = new Set<string>([courseId]);
  for (const m of registry.classOf.get(courseId) ?? []) out.add(m);
  for (const t of registry.satisfiesOf.get(courseId) ?? []) out.add(t);
  return Array.from(out);
}

/**
 * True when `requiredId` is satisfied by anything in `takenSet`: the course
 * itself, any member of its symmetric class, or any directional satisfier
 * (e.g. M 411 in the set satisfies a required M 340L).
 */
export function satisfiesRequirement(
  requiredId: string,
  takenSet: ReadonlySet<string>,
  registry: EquivalenceRegistry
): boolean {
  if (takenSet.has(requiredId)) return true;
  const cls = registry.classOf.get(requiredId);
  if (cls) {
    for (const m of cls) if (takenSet.has(m)) return true;
  }
  const sources = registry.satisfiedBy.get(requiredId);
  if (sources) {
    for (const s of sources) if (takenSet.has(s)) return true;
  }
  return false;
}
