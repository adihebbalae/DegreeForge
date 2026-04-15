import { describe, it, expect } from 'vitest';
import { PrereqGraph } from './graph-engine';
import type { PrereqGraphData, Plan } from '../types';

describe('PrereqGraph', () => {
  const mockData: PrereqGraphData = {
    nodes: {
      'ECE 302': { title: 'Intro to EE', credits: 3, category: 'ece_core', offered: ['Fall', 'Spring'], flags: [] },
      'ECE 306': { title: 'Intro to Computing', credits: 3, category: 'ece_core', offered: ['Fall', 'Spring'], flags: [] },
      'ECE 312': { title: 'Software I', credits: 3, category: 'ece_core', offered: ['Fall', 'Spring'], flags: [] },
      'ECE 460N': { title: 'Computer Architecture', credits: 4, category: 'tech_core', offered: ['Fall'], flags: [] },
    },
    edges: [
      { from: 'ECE 306', to: 'ECE 312', type: 'prerequisite' },
      { from: 'ECE 302', to: 'ECE 460N', type: 'prerequisite' },
      { from: 'ECE 312', to: 'ECE 460N', type: 'corequisite' },
    ],
  };

  const graph = new PrereqGraph(mockData);

  describe('validatePlacement', () => {
    const semesterOrder = ['Fall 2025', 'Spring 2026', 'Fall 2026'];

    it('should be valid when prereqs are in earlier semesters', () => {
      const plan: Plan = {
        'Fall 2025': ['ECE 306'],
        'Spring 2026': ['ECE 312'],
        'Fall 2026': [],
      };
      const violations = graph.validatePlacement('ECE 312', 1, plan, semesterOrder);
      expect(violations).toHaveLength(0);
    });

    it('should report violation when prereq is in same semester', () => {
      const plan: Plan = {
        'Fall 2025': ['ECE 306', 'ECE 312'],
        'Spring 2026': [],
        'Fall 2026': [],
      };
      const violations = graph.validatePlacement('ECE 312', 0, plan, semesterOrder);
      expect(violations).toHaveLength(1);
      expect(violations[0].missingPrereqs).toContain('ECE 306');
    });

    it('should handle corequisites in same semester', () => {
      const plan: Plan = {
        'Fall 2025': ['ECE 302'],
        'Spring 2026': ['ECE 312', 'ECE 460N'],
        'Fall 2026': [],
      };
      const violations = graph.validatePlacement('ECE 460N', 1, plan, semesterOrder);
      expect(violations).toHaveLength(0);
    });

    it('should report corequisite violation if not in same or earlier semester', () => {
      const plan: Plan = {
        'Fall 2025': ['ECE 302'],
        'Spring 2026': ['ECE 460N'],
        'Fall 2026': ['ECE 312'],
      };
      const violations = graph.validatePlacement('ECE 460N', 1, plan, semesterOrder);
      expect(violations).toHaveLength(1);
      expect(violations[0].unsatisfiedCoreqs).toContain('ECE 312');
    });
  });

  describe('getDownstream', () => {
    it('should return direct and transitive dependents', () => {
      const downstream = graph.getDownstream('ECE 306');
      expect(downstream).toContain('ECE 312');
      expect(downstream).toContain('ECE 460N');
      expect(downstream).toHaveLength(2);
    });

    it('should return empty array for leaf nodes', () => {
      const downstream = graph.getDownstream('ECE 460N');
      expect(downstream).toHaveLength(0);
    });
  });
});
