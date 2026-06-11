import { describe, it, expect, beforeEach } from 'vitest';
import { PrereqGraph } from './graph-engine';
import type { PrereqGraphData, Plan, PrereqCNF } from '../types';

describe('PrereqGraph', () => {
  const mockData: PrereqGraphData = {
    nodes: {
      'ECE 302': { title: 'Intro', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      'ECE 306': { title: 'Computing', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      'M 408C': { title: 'Calc I', credits: 4, category: 'math', offered: ['fall', 'spring'], flags: [] },
      'ECE 312': { title: 'Software', credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
      'ECE 319K': { title: 'Embedded', credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
    },
    edges: [
      { from: 'M 408C', to: 'ECE 302', type: 'prerequisite' },
      { from: 'M 408C', to: 'ECE 306', type: 'corequisite' },
      { from: 'ECE 306', to: 'ECE 312', type: 'prerequisite' },
      { from: 'ECE 306', to: 'ECE 319K', type: 'prerequisite' },
    ],
  };

  let graph: PrereqGraph;

  beforeEach(() => {
    // Empty CNF: use pure flat-edge validation for these basic tests
    graph = new PrereqGraph(mockData, {});
  });

  it('correctly identifies direct prerequisites', () => {
    expect(graph.getPrereqs('ECE 302')).toEqual(['M 408C']);
    expect(graph.getPrereqs('ECE 312')).toEqual(['ECE 306']);
    expect(graph.getPrereqs('M 408C')).toEqual([]);
  });

  it('correctly identifies corequisites', () => {
    expect(graph.getCoreqs('ECE 306')).toEqual(['M 408C']);
    expect(graph.getCoreqs('ECE 302')).toEqual([]);
  });

  it('correctly computes downstream dependents', () => {
    const downstream = graph.getDownstream('ECE 306');
    expect(downstream).toContain('ECE 312');
    expect(downstream).toContain('ECE 319K');
    expect(downstream).not.toContain('ECE 302');
  });

  it('validates a correct placement', () => {
    const plan: Plan = {
      'Sem 1': ['M 408C', 'ECE 306'],
      'Sem 2': ['ECE 302', 'ECE 312'],
    };
    const semesterOrder = ['Sem 1', 'Sem 2'];

    // ECE 302 in Sem 2: prereq M 408C is in Sem 1 (valid)
    expect(graph.validatePlacement('ECE 302', 1, plan, semesterOrder)).toEqual([]);

    // ECE 306 in Sem 1: coreq M 408C is in Sem 1 (valid)
    expect(graph.validatePlacement('ECE 306', 0, plan, semesterOrder)).toEqual([]);
  });

  it('identifies missing prerequisites', () => {
    const plan: Plan = {
      'Sem 1': ['ECE 302'], // M 408C is missing
    };
    const semesterOrder = ['Sem 1'];
    const violations = graph.validatePlacement('ECE 302', 0, plan, semesterOrder);
    expect(violations.length).toBe(1);
    expect(violations[0].missingPrereqs).toContain('M 408C');
  });

  it('identifies unsatisfied corequisites', () => {
    const plan: Plan = {
      'Sem 1': ['ECE 306'], // M 408C is missing
      'Sem 2': ['M 408C'],
    };
    const semesterOrder = ['Sem 1', 'Sem 2'];
    const violations = graph.validatePlacement('ECE 306', 0, plan, semesterOrder);
    expect(violations.length).toBe(1);
    expect(violations[0].unsatisfiedCoreqs).toContain('M 408C');
  });

  it('treats honors equivalents as satisfying prerequisites', () => {
    // ECE 312 has prereq ECE 306; ECE 306H should satisfy that prereq
    const graphWithHonors: PrereqGraphData = {
      nodes: {
        'ECE 306':  { title: 'Computing', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 306H': { title: 'Computing H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 312':  { title: 'Software', credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
        'ECE 319K': { title: 'Embedded', credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
      },
      edges: [
        { from: 'ECE 306', to: 'ECE 312',  type: 'prerequisite' },
        { from: 'ECE 306', to: 'ECE 319K', type: 'prerequisite' },
      ],
    };
    const g = new PrereqGraph(graphWithHonors, {});
    const plan: Plan = {
      'Sem 1': ['ECE 306H'],          // student took honors variant
      'Sem 2': ['ECE 312', 'ECE 319K'],
    };
    const order = ['Sem 1', 'Sem 2'];
    // Both courses require ECE 306; ECE 306H should satisfy that
    expect(g.validatePlacement('ECE 312',  1, plan, order)).toEqual([]);
    expect(g.validatePlacement('ECE 319K', 1, plan, order)).toEqual([]);
  });

  it('performs topological sort', () => {
    const courses = ['ECE 312', 'ECE 306', 'M 408C'];
    const sorted = graph.topologicalSort(courses);
    // M 408C -> ECE 306 -> ECE 312
    expect(sorted[0]).toBe('M 408C');
    expect(sorted[1]).toBe('ECE 306');
    expect(sorted[2]).toBe('ECE 312');
  });
});

// ─── TASK-057: OR-group (CNF) validation ─────────────────────────────────────

describe('PrereqGraph — TASK-057 OR-group / CNF / default-OR / self-edge', () => {

  // ── AC1: ECE 312H with only ECE 306H → no violation ─────────────────────
  it('AC1: ECE 312H satisfied by ECE 306H alone (OR-pool, one member taken)', () => {
    // Build a graph matching the real ECE 312H edges: all four are OR-pool
    const data: PrereqGraphData = {
      nodes: {
        'BME 306':  { title: 'Intro Computing', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 306':  { title: 'Intro Computing', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 306H': { title: 'Intro Computing H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 319H': { title: 'Embedded H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 312H': { title: 'Software H', credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
      },
      edges: [
        { from: 'BME 306',  to: 'ECE 312H', type: 'prerequisite' },
        { from: 'ECE 306',  to: 'ECE 312H', type: 'prerequisite' },
        { from: 'ECE 306H', to: 'ECE 312H', type: 'prerequisite' },
        { from: 'ECE 319H', to: 'ECE 312H', type: 'prerequisite' },
      ],
    };
    // Use explicit CNF matching the authored PREREQ_CNF for ECE 312H
    const cnf: PrereqCNF = {
      'ECE 312H': [
        { one_of: ['ECE 306', 'ECE 306H', 'BME 306', 'ECE 319H'] },
      ],
    };
    const g = new PrereqGraph(data, cnf);

    const plan: Plan = {
      'Sem 1': ['ECE 306H'],
      'Sem 2': ['ECE 312H'],
    };
    const order = ['Sem 1', 'Sem 2'];

    // ECE 306H is in EQUIVALENCE_MAP as equivalent to ECE 306; satisfies the group
    expect(g.validatePlacement('ECE 312H', 1, plan, order)).toEqual([]);
  });

  // ── AC1b: ECE 319H satisfied by ECE 306H alone ──────────────────────────
  it('AC1b: ECE 319H satisfied by ECE 306H alone (equivalence match)', () => {
    const data: PrereqGraphData = {
      nodes: {
        'BME 306':  { title: 'Intro Computing', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 306':  { title: 'Intro Computing', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 306H': { title: 'Intro Computing H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 319H': { title: 'Embedded H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [
        { from: 'BME 306',  to: 'ECE 319H', type: 'prerequisite' },
        { from: 'ECE 306',  to: 'ECE 319H', type: 'prerequisite' },
        { from: 'ECE 306H', to: 'ECE 319H', type: 'prerequisite' },
      ],
    };
    const cnf: PrereqCNF = {
      'ECE 319H': [{ one_of: ['ECE 306', 'ECE 306H', 'BME 306'] }],
    };
    const g = new PrereqGraph(data, cnf);

    const plan: Plan = {
      'Sem 1': ['ECE 306H'],
      'Sem 2': ['ECE 319H'],
    };
    expect(g.validatePlacement('ECE 319H', 1, plan, ['Sem 1', 'Sem 2'])).toEqual([]);
  });

  // ── AC2: ECE 411 AND-stack — partial completion still flags missing ───────
  it('AC2: ECE 411 AND-stack — PHY 303L alone does NOT satisfy it', () => {
    const data: PrereqGraphData = {
      nodes: {
        'ECE 302':  { title: 'Intro EE',   credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 302H': { title: 'Intro EE H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'M 427J':   { title: 'Diff Eq',    credits: 4, category: 'math',     offered: ['fall'], flags: [] },
        'PHY 303L': { title: 'Physics II', credits: 3, category: 'math',     offered: ['fall'], flags: [] },
        'ECE 411':  { title: 'EM Eng',     credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [
        { from: 'ECE 302',  to: 'ECE 411', type: 'prerequisite' },
        { from: 'ECE 302H', to: 'ECE 411', type: 'prerequisite' },
        { from: 'M 427J',   to: 'ECE 411', type: 'prerequisite' },
        { from: 'PHY 303L', to: 'ECE 411', type: 'prerequisite' },
      ],
    };
    // Explicit AND-stack CNF
    const cnf: PrereqCNF = {
      'ECE 411': [
        { one_of: ['ECE 302', 'ECE 302H'] },
        { one_of: ['M 427J'] },
        { one_of: ['PHY 303L'] },
      ],
    };
    const g = new PrereqGraph(data, cnf);

    // Only PHY 303L taken — ECE 302 group and M 427J group are missing
    const plan: Plan = {
      'Sem 1': ['PHY 303L'],
      'Sem 2': ['ECE 411'],
    };
    const violations = g.validatePlacement('ECE 411', 1, plan, ['Sem 1', 'Sem 2']);
    expect(violations.length).toBe(1);
    // Missing: ECE 302/302H group AND M 427J
    const missing = violations[0].missingPrereqs;
    expect(missing.some(m => m === 'ECE 302' || m === 'ECE 302H')).toBe(true);
    expect(missing).toContain('M 427J');
    // PHY 303L is satisfied — should NOT be in missing
    expect(missing).not.toContain('PHY 303L');
  });

  it('AC2b: ECE 411 AND-stack — all three groups satisfied → no violation', () => {
    const data: PrereqGraphData = {
      nodes: {
        'ECE 302':  { title: 'Intro EE',   credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 302H': { title: 'Intro EE H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'M 427J':   { title: 'Diff Eq',    credits: 4, category: 'math',     offered: ['fall'], flags: [] },
        'PHY 303L': { title: 'Physics II', credits: 3, category: 'math',     offered: ['fall'], flags: [] },
        'ECE 411':  { title: 'EM Eng',     credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [
        { from: 'ECE 302',  to: 'ECE 411', type: 'prerequisite' },
        { from: 'ECE 302H', to: 'ECE 411', type: 'prerequisite' },
        { from: 'M 427J',   to: 'ECE 411', type: 'prerequisite' },
        { from: 'PHY 303L', to: 'ECE 411', type: 'prerequisite' },
      ],
    };
    const cnf: PrereqCNF = {
      'ECE 411': [
        { one_of: ['ECE 302', 'ECE 302H'] },
        { one_of: ['M 427J'] },
        { one_of: ['PHY 303L'] },
      ],
    };
    const g = new PrereqGraph(data, cnf);

    // All three AND-groups satisfied (ECE 302H satisfies the ECE 302 group via equivalence)
    const plan: Plan = {
      'Sem 1': ['ECE 302H', 'M 427J', 'PHY 303L'],
      'Sem 2': ['ECE 411'],
    };
    expect(g.validatePlacement('ECE 411', 1, plan, ['Sem 1', 'Sem 2'])).toEqual([]);
  });

  // ── AC3: Self-edges are dropped — no course is its own prereq ────────────
  it('AC3: self-edges are silently dropped (no self-prereq violation)', () => {
    const data: PrereqGraphData = {
      nodes: {
        'ECE 381K': { title: 'Some Grad Course', credits: 3, category: 'ece_upper', offered: ['fall'], flags: [] },
        'ECE 302':  { title: 'Prereq',           credits: 3, category: 'ece_core',  offered: ['fall'], flags: [] },
      },
      edges: [
        // Self-edge — should be ignored
        { from: 'ECE 381K', to: 'ECE 381K', type: 'prerequisite' },
        // Real edge
        { from: 'ECE 302', to: 'ECE 381K', type: 'prerequisite' },
      ],
    };
    const g = new PrereqGraph(data, {});

    // ECE 381K should NOT be listed as its own prereq
    expect(g.getPrereqs('ECE 381K')).not.toContain('ECE 381K');
    expect(g.getPrereqs('ECE 381K')).toContain('ECE 302');

    // Placing ECE 381K after ECE 302 — no self-prereq violation
    const plan: Plan = {
      'Sem 1': ['ECE 302'],
      'Sem 2': ['ECE 381K'],
    };
    const violations = g.validatePlacement('ECE 381K', 1, plan, ['Sem 1', 'Sem 2']);
    expect(violations).toHaveLength(0);

    // Placing ECE 381K without ECE 302 — violation for ECE 302, NOT for ECE 381K itself
    const badPlan: Plan = { 'Sem 1': ['ECE 381K'] };
    const badViolations = g.validatePlacement('ECE 381K', 0, badPlan, ['Sem 1']);
    expect(badViolations.length).toBe(1);
    expect(badViolations[0].missingPrereqs).not.toContain('ECE 381K');
    expect(badViolations[0].missingPrereqs).toContain('ECE 302');
  });

  // ── AC5: Honors/cross-list equivalence satisfies OR-group ────────────────
  it('AC5: ECE 306H (honors) satisfies a group listing ECE 306', () => {
    const data: PrereqGraphData = {
      nodes: {
        'ECE 306':  { title: 'Intro Computing',   credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 306H': { title: 'Intro Computing H', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 312':  { title: 'Software',          credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
      },
      edges: [{ from: 'ECE 306', to: 'ECE 312', type: 'prerequisite' }],
    };
    // CNF group lists only 'ECE 306' — but ECE 306H is equivalent
    const cnf: PrereqCNF = {
      'ECE 312': [{ one_of: ['ECE 306'] }],
    };
    const g = new PrereqGraph(data, cnf);

    const plan: Plan = {
      'Sem 1': ['ECE 306H'],
      'Sem 2': ['ECE 312'],
    };
    // ECE 306H ≡ ECE 306 via EQUIVALENCE_MAP → group satisfied
    expect(g.validatePlacement('ECE 312', 1, plan, ['Sem 1', 'Sem 2'])).toEqual([]);
  });

  it('AC5b: BME 306 (cross-list) satisfies a group listing ECE 306', () => {
    const data: PrereqGraphData = {
      nodes: {
        'ECE 306':  { title: 'Intro Computing',    credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'BME 306':  { title: 'Intro Computing BME', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'ECE 319K': { title: 'Embedded',           credits: 3, category: 'ece_core', offered: ['spring'], flags: [] },
      },
      edges: [
        { from: 'ECE 306', to: 'ECE 319K', type: 'prerequisite' },
        { from: 'BME 306', to: 'ECE 319K', type: 'prerequisite' },
      ],
    };
    const cnf: PrereqCNF = {
      'ECE 319K': [{ one_of: ['ECE 306', 'ECE 306H', 'BME 306'] }],
    };
    const g = new PrereqGraph(data, cnf);

    const plan: Plan = {
      'Sem 1': ['BME 306'],
      'Sem 2': ['ECE 319K'],
    };
    expect(g.validatePlacement('ECE 319K', 1, plan, ['Sem 1', 'Sem 2'])).toEqual([]);
  });

  // ── Default-OR fallback: ungrouped multi-edge courses use OR ─────────────
  it('default-OR: multi-edge course without explicit CNF requires only ONE prereq', () => {
    // Course with 3 prereq edges but no explicit CNF → default single OR-group
    const data: PrereqGraphData = {
      nodes: {
        'A': { title: 'Course A', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'B': { title: 'Course B', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'C': { title: 'Course C', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'TARGET': { title: 'Target', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [
        { from: 'A', to: 'TARGET', type: 'prerequisite' },
        { from: 'B', to: 'TARGET', type: 'prerequisite' },
        { from: 'C', to: 'TARGET', type: 'prerequisite' },
      ],
    };
    // No CNF override for TARGET → default-OR (any one of A, B, C satisfies it)
    const g = new PrereqGraph(data, {});

    // Only A taken → TARGET satisfied (default-OR)
    const plan: Plan = {
      'Sem 1': ['A'],
      'Sem 2': ['TARGET'],
    };
    expect(g.validatePlacement('TARGET', 1, plan, ['Sem 1', 'Sem 2'])).toEqual([]);

    // Nothing taken → violation
    const emptyPlan: Plan = { 'Sem 1': ['TARGET'] };
    const violations = g.validatePlacement('TARGET', 0, emptyPlan, ['Sem 1']);
    expect(violations.length).toBe(1);
  });

  // ── getPrereqGroups API ───────────────────────────────────────────────────
  it('getPrereqGroups returns explicit CNF when present', () => {
    const data: PrereqGraphData = {
      nodes: {
        'A': { title: 'A', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'B': { title: 'B', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'TARGET': { title: 'T', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [
        { from: 'A', to: 'TARGET', type: 'prerequisite' },
        { from: 'B', to: 'TARGET', type: 'prerequisite' },
      ],
    };
    const cnf: PrereqCNF = {
      'TARGET': [
        { one_of: ['A'] },
        { one_of: ['B'] },
      ],
    };
    const g = new PrereqGraph(data, cnf);
    const groups = g.getPrereqGroups('TARGET');
    expect(groups).toHaveLength(2);
    expect(groups[0].one_of).toEqual(['A']);
    expect(groups[1].one_of).toEqual(['B']);
  });

  it('getPrereqGroups returns empty for course with no prereqs', () => {
    const data: PrereqGraphData = {
      nodes: {
        'ECE 302': { title: 'Intro', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [],
    };
    const g = new PrereqGraph(data, {});
    expect(g.getPrereqGroups('ECE 302')).toEqual([]);
  });

  it('getPrereqGroups returns single OR-group for ungrouped multi-edge course', () => {
    const data: PrereqGraphData = {
      nodes: {
        'A': { title: 'A', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'B': { title: 'B', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
        'TARGET': { title: 'T', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
      },
      edges: [
        { from: 'A', to: 'TARGET', type: 'prerequisite' },
        { from: 'B', to: 'TARGET', type: 'prerequisite' },
      ],
    };
    const g = new PrereqGraph(data, {});
    const groups = g.getPrereqGroups('TARGET');
    expect(groups).toHaveLength(1);
    expect(groups[0].one_of).toContain('A');
    expect(groups[0].one_of).toContain('B');
  });
});
