import { describe, it, expect } from 'vitest';
import { rankCoursesForSkills, buildSnapshotPlan, type SkillCourseMap, type RankedCourse } from './career';

describe('rankCoursesForSkills', () => {
  const mockMap: SkillCourseMap = {
    machine_learning: {
      label: 'Machine Learning',
      courses: ['ECE 460J', 'ECE 364D'],
      relevance: 'strong'
    },
    data_structures: {
      label: 'Data Structures',
      courses: ['ECE 312H', 'ECE 422C'],
      relevance: 'moderate'
    },
    embedded_systems: {
      label: 'Embedded Systems',
      courses: ['ECE 445L'],
      relevance: 'strong'
    }
  };

  it('returns empty array when no skills match', () => {
    const results = rankCoursesForSkills(['unknown_skill'], mockMap);
    expect(results).toHaveLength(0);
  });

  it('ranks single skill match correctly', () => {
    const results = rankCoursesForSkills(['machine_learning'], mockMap);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(2);
    expect(results[0].matchingSkills).toEqual(['Machine Learning']);
    expect(results[0].why).toBe('Matches Machine Learning.');
  });

  it('aggregates multiple skill matches and sorts by score', () => {
    // ECE 364D -> ML (strong)
    // ECE 312H -> DS (moderate)
    // We add a mock course that is in both
    const customMap: SkillCourseMap = {
      ...mockMap,
      machine_learning: { ...mockMap.machine_learning, courses: ['ECE 460J', 'SHARED_COURSE'] },
      data_structures: { ...mockMap.data_structures, courses: ['ECE 312H', 'SHARED_COURSE'] }
    };
    
    const results = rankCoursesForSkills(['machine_learning', 'data_structures'], customMap);
    
    // SHARED_COURSE should have score 3 (strong 2 + moderate 1)
    expect(results[0].courseId).toBe('SHARED_COURSE');
    expect(results[0].score).toBe(3);
    expect(results[0].matchingSkills).toEqual(['Machine Learning', 'Data Structures']);
    
    // ECE 460J should have score 2
    expect(results[1].courseId).toBe('ECE 460J');
    expect(results[1].score).toBe(2);
    
    // ECE 312H should have score 1
    expect(results[2].courseId).toBe('ECE 312H');
    expect(results[2].score).toBe(1);
  });

  it('deprioritizes existing courses with score 0 and "Already planned" message', () => {
    const results = rankCoursesForSkills(
      ['machine_learning', 'embedded_systems'], 
      mockMap, 
      ['ECE 460J']
    );
    
    // ECE 445L (embedded, strong) -> score 2
    // ECE 364D (ML, strong) -> score 2
    // ECE 460J (ML, strong) -> score 0 (existing)
    
    const ece460j = results.find(r => r.courseId === 'ECE 460J');
    expect(ece460j?.score).toBe(0);
    expect(ece460j?.why).toBe('Already planned');
    
    // Check sorting
    expect(results[results.length - 1].courseId).toBe('ECE 460J');
  });

  it('handles empty skill map gracefully', () => {
    const results = rankCoursesForSkills(['machine_learning'], {});
    expect(results).toHaveLength(0);
  });
});

describe('buildSnapshotPlan', () => {
  const basePlan: Record<string, string[]> = {
    'Fall 2025':   ['ECE 302'],
    'Fall 2026':   [],
    'Spring 2027': [],
  };

  const ranked: RankedCourse[] = [
    { courseId: 'ECE 460J', matchingSkills: ['Machine Learning'], score: 2, why: 'Matches Machine Learning.' },
    { courseId: 'ECE 445L', matchingSkills: ['Embedded Systems'],  score: 2, why: 'Matches Embedded Systems.' },
    { courseId: 'ECE 364D', matchingSkills: ['Machine Learning'], score: 2, why: 'Matches Machine Learning.' },
    { courseId: 'ECE 312H', matchingSkills: ['Data Structures'],  score: 1, why: 'Matches Data Structures.' },
  ];

  it('appends top 3 recommendations into the target semester', () => {
    const snapshot = buildSnapshotPlan(basePlan, ranked, 'Fall 2026');
    expect(snapshot['Fall 2026']).toEqual(['ECE 460J', 'ECE 445L', 'ECE 364D']);
  });

  it('does not mutate the original plan', () => {
    const original = { 'Fall 2026': [] };
    buildSnapshotPlan(original, ranked, 'Fall 2026');
    expect(original['Fall 2026']).toHaveLength(0);
  });

  it('excludes courses with why === "Already planned"', () => {
    const alreadyPlannedRanked: RankedCourse[] = [
      { courseId: 'ECE 460J', matchingSkills: ['Machine Learning'], score: 0, why: 'Already planned' },
      { courseId: 'ECE 445L', matchingSkills: ['Embedded Systems'], score: 2, why: 'Matches Embedded Systems.' },
    ];
    const snapshot = buildSnapshotPlan(basePlan, alreadyPlannedRanked, 'Fall 2026');
    expect(snapshot['Fall 2026']).toEqual(['ECE 445L']);
    expect(snapshot['Fall 2026']).not.toContain('ECE 460J');
  });

  it('deduplicates courses already present elsewhere in the plan', () => {
    const planWithExisting = { ...basePlan, 'Fall 2025': ['ECE 302', 'ECE 460J'] };
    const snapshot = buildSnapshotPlan(planWithExisting, ranked, 'Fall 2026');
    expect(snapshot['Fall 2026']).not.toContain('ECE 460J');
    // ECE 445L should be first recommendation added
    expect(snapshot['Fall 2026']).toContain('ECE 445L');
  });

  it('respects the max parameter', () => {
    const snapshot = buildSnapshotPlan(basePlan, ranked, 'Fall 2026', 1);
    expect(snapshot['Fall 2026']).toHaveLength(1);
    expect(snapshot['Fall 2026'][0]).toBe('ECE 460J');
  });

  it('creates the target semester key if it does not exist', () => {
    const snapshot = buildSnapshotPlan(basePlan, ranked, 'Spring 2099');
    expect(snapshot['Spring 2099']).toBeDefined();
    expect(snapshot['Spring 2099']).toHaveLength(3);
  });

  it('preserves existing courses in the current plan', () => {
    const snapshot = buildSnapshotPlan(basePlan, ranked, 'Fall 2026');
    expect(snapshot['Fall 2025']).toEqual(['ECE 302']);
  });
});
