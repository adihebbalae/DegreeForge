import { describe, it, expect, beforeEach } from 'vitest';
import { PrereqGraph } from './graph-engine';
import type { PrereqGraphData, Plan } from '../types';

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
    graph = new PrereqGraph(mockData);
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

  it('performs topological sort', () => {
    const courses = ['ECE 312', 'ECE 306', 'M 408C'];
    const sorted = graph.topologicalSort(courses);
    // M 408C -> ECE 306 -> ECE 312
    expect(sorted[0]).toBe('M 408C');
    expect(sorted[1]).toBe('ECE 306');
    expect(sorted[2]).toBe('ECE 312');
  });
});
