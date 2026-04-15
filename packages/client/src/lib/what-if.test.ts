import { describe, it, expect } from 'vitest';
import { computeWhatIfDiff } from './what-if';
import type { 
  TechCoreTrack, 
  MathRequirements, 
  CourseCatalog 
} from '../types';

describe('computeWhatIfDiff', () => {
  const mockCatalog: CourseCatalog = {
    'ECE 316': { id: 'ECE 316', title: 'Sequential Machine Design', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
    'ECE 460N': { id: 'ECE 460N', title: 'Computer Architecture', credits: 4, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
    'M 362K': { id: 'M 362K', title: 'Probability', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'M' },
  };

  const mockTechCores: Record<string, TechCoreTrack> = {
    'track_a': {
      name: 'Track A',
      graduate_track: '',
      category: '',
      required_math: '',
      required_courses: {
        core: [{ id: 'ECE 316', title: '' }]
      },
      elective_count: { general: 0, ecb: 0 },
      elective_pool: []
    },
    'track_b': {
      name: 'Track B',
      graduate_track: '',
      category: '',
      required_math: '',
      required_courses: {
        core: [{ id: 'ECE 460N', title: '' }]
      },
      elective_count: { general: 0, ecb: 0 },
      elective_pool: []
    }
  };

  const mockMathReqs: MathRequirements = {
    math_ba: {
      program_name: '',
      catalog_url: '',
      total_upper_division_hours: 24,
      requirements: [],
      overlap_with_ece: [],
      additional_courses_needed: {
        note: '',
        minimum_additional_hours: 15,
        breakdown: [
          { requirement: 'prob', hours: 3, example: 'M 362K' }
        ]
      }
    }
  };

  it('should identify added and removed courses when switching tech cores', () => {
    const diff = computeWhatIfDiff(
      { techCoreId: 'track_a', mathBAToggle: false },
      { techCoreId: 'track_b', mathBAToggle: false },
      mockTechCores,
      mockMathReqs,
      mockCatalog,
      []
    );

    expect(diff.coursesAdded).toContain('ECE 460N');
    expect(diff.coursesRemoved).toContain('ECE 316');
    expect(diff.creditHourDelta).toBe(1); // 4 - 3 = 1
  });

  it('should identify added math courses when toggling Math BA', () => {
    const diff = computeWhatIfDiff(
      { techCoreId: 'track_a', mathBAToggle: false },
      { techCoreId: 'track_a', mathBAToggle: true },
      mockTechCores,
      mockMathReqs,
      mockCatalog,
      []
    );

    expect(diff.coursesAdded).toContain('M 362K');
    expect(diff.coursesRemoved).toHaveLength(0);
    expect(diff.creditHourDelta).toBe(3);
  });

  it('should exclude completed courses from diff', () => {
    const diff = computeWhatIfDiff(
      { techCoreId: 'track_a', mathBAToggle: false },
      { techCoreId: 'track_b', mathBAToggle: false },
      mockTechCores,
      mockMathReqs,
      mockCatalog,
      ['ECE 460N']
    );

    expect(diff.coursesAdded).not.toContain('ECE 460N');
    expect(diff.coursesRemoved).toContain('ECE 316');
  });
});
