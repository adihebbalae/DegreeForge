/**
 * score.test.ts — Unit tests for 6-factor schedule scoring (TASK-021)
 * 25+ tests across all 6 factors + composite
 */

import { describe, it, expect } from 'vitest';
import type { ScheduledSection } from './scheduler';
import type { GradeDistributions } from '../types';
import {
  parseTimeToMinutes,
  parseInterval,
  extractBuilding,
  getBuildingDistance,
  scoreGpa,
  scoreTimeOfDay,
  scoreBuildingBreak,
  scoreInstructionMode,
  scoreProfessor,
  scoreDaySpread,
  compositeScore,
  scoreScheduleFull,
  DEFAULT_WEIGHTS,
  type ScoreWeights,
  type FactorScores,
} from './score';
import type { ProfPreference } from '../context/SettingsContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSection(
  courseId: string,
  meetings: { days?: string; time: string; room?: string }[],
  instructor = '',
  instruction_mode = 'Face-to-face',
): ScheduledSection {
  return {
    courseId,
    courseTitle: `Title ${courseId}`,
    unique: 12345,
    meetings,
    instructor,
    instruction_mode,
    status: 'open',
    core: '',
  };
}

const mockGrades: GradeDistributions = {
  'ECE 302': {
    department: 'ECE',
    department_code: 'ECE',
    course_number: '302',
    course_title: 'Probability',
    sections: [],
    avg_gpa: 3.5,
    a_pct: 60,
    b_pct: 30,
    c_pct: 10,
    d_pct: 0,
    f_pct: 0,
    total_enrollment: 100,
    total_sections: 3,
    byInstructor: {
      'Alice Smith': { avg_gpa: 3.8, total_enrollment: 40, distribution: {} },
      'Bob Jones': { avg_gpa: 2.9, total_enrollment: 30, distribution: {} },
    },
  },
  'ECE 306': {
    department: 'ECE',
    department_code: 'ECE',
    course_number: '306',
    course_title: 'Microcontrollers',
    sections: [],
    avg_gpa: 2.2,
    a_pct: 20,
    b_pct: 40,
    c_pct: 30,
    d_pct: 10,
    f_pct: 0,
    total_enrollment: 80,
    total_sections: 2,
    byInstructor: {},
  },
};

const distanceTable: Record<string, number> = {
  'EER-GDC': 5,
  'EER-ETC': 4,
  'GDC-ETC': 3,
};

// ─── parseTimeToMinutes ───────────────────────────────────────────────────────

describe('parseTimeToMinutes', () => {
  it('parses 9:00 a.m. correctly', () => {
    expect(parseTimeToMinutes('9:00 a.m.')).toBe(540);
  });

  it('parses 1:30 p.m. correctly', () => {
    expect(parseTimeToMinutes('1:30 p.m.')).toBe(810);
  });

  it('parses 12:00 p.m. (noon) correctly', () => {
    expect(parseTimeToMinutes('12:00 p.m.')).toBe(720);
  });

  it('parses 12:00 a.m. (midnight) correctly', () => {
    expect(parseTimeToMinutes('12:00 a.m.')).toBe(0);
  });

  it('returns -1 for unparseable strings', () => {
    expect(parseTimeToMinutes('TBA')).toBe(-1);
    expect(parseTimeToMinutes('')).toBe(-1);
  });
});

// ─── parseInterval ────────────────────────────────────────────────────────────

describe('parseInterval', () => {
  it('parses a valid interval', () => {
    const result = parseInterval('9:00 a.m.-10:30 a.m.');
    expect(result).toEqual([540, 630]);
  });

  it('returns null for invalid interval', () => {
    expect(parseInterval('TBA')).toBeNull();
  });

  // TASK-072: guard for undefined/null/empty — real data has meetings with days but no time
  it('returns null for undefined (TBA/no-time meeting shape)', () => {
    expect(parseInterval(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseInterval(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseInterval('')).toBeNull();
  });
});

// ─── extractBuilding ──────────────────────────────────────────────────────────

describe('extractBuilding', () => {
  it('extracts building code from a room string', () => {
    expect(extractBuilding('EER 1.516')).toBe('EER');
    expect(extractBuilding('GDC 6.202')).toBe('GDC');
  });

  it('returns null for unrecognized format', () => {
    expect(extractBuilding('123')).toBeNull();
    expect(extractBuilding('')).toBeNull();
  });
});

// ─── getBuildingDistance ──────────────────────────────────────────────────────

describe('getBuildingDistance', () => {
  it('finds distance in canonical order', () => {
    expect(getBuildingDistance('EER', 'GDC', distanceTable)).toBe(5);
  });

  it('finds distance in reverse order', () => {
    expect(getBuildingDistance('GDC', 'EER', distanceTable)).toBe(5);
  });

  it('returns null for unknown pair', () => {
    expect(getBuildingDistance('EER', 'ZZZ', distanceTable)).toBeNull();
  });
});

// ─── scoreGpa ────────────────────────────────────────────────────────────────

describe('scoreGpa', () => {
  it('returns 0 for empty sections', () => {
    expect(scoreGpa([], mockGrades)).toBe(0);
  });

  it('normalizes high GPA toward 1', () => {
    const sections = [makeSection('ECE 302', [{ time: '9:00 a.m.-10:30 a.m.' }])];
    const score = scoreGpa(sections, mockGrades);
    // avg_gpa=3.5, normalized: (3.5-2)/2=0.75
    expect(score).toBeCloseTo(0.75);
  });

  it('normalizes low GPA toward 0', () => {
    const sections = [makeSection('ECE 306', [{ time: '9:00 a.m.-10:30 a.m.' }])];
    const score = scoreGpa(sections, mockGrades);
    // avg_gpa=2.2, normalized: (2.2-2)/2=0.1
    expect(score).toBeCloseTo(0.1);
  });

  it('falls back to 3.0 for unknown course', () => {
    const sections = [makeSection('ECE 999', [{ time: '9:00 a.m.-10:30 a.m.' }])];
    const score = scoreGpa(sections, mockGrades);
    // fallback 3.0, normalized: (3.0-2)/2=0.5
    expect(score).toBeCloseTo(0.5);
  });

  it('clamps to 0 for very low GPA', () => {
    const lowGrades: GradeDistributions = {
      'ECE 100': {
        ...mockGrades['ECE 302'],
        avg_gpa: 1.0,
        byInstructor: {},
      },
    };
    const sections = [makeSection('ECE 100', [{ time: '9:00 a.m.-10:30 a.m.' }])];
    expect(scoreGpa(sections, lowGrades)).toBe(0);
  });
});

// ─── scoreTimeOfDay ───────────────────────────────────────────────────────────

describe('scoreTimeOfDay', () => {
  it('returns 0 for empty sections', () => {
    expect(scoreTimeOfDay([], [])).toBe(0);
  });

  it('returns 1.0 when no preferred windows (no preference)', () => {
    const sections = [makeSection('ECE 302', [{ days: 'MWF', time: '9:00 a.m.-10:30 a.m.' }])];
    expect(scoreTimeOfDay(sections, [])).toBe(1.0);
  });

  it('scores 1.0 when all meetings are within preferred window', () => {
    const sections = [makeSection('ECE 302', [{ days: 'MWF', time: '10:00 a.m.-11:00 a.m.' }])];
    const windows = [{ start: 540, end: 780 }]; // 9 AM to 1 PM
    expect(scoreTimeOfDay(sections, windows)).toBe(1.0);
  });

  it('scores 0 when no meetings match preferred window', () => {
    const sections = [makeSection('ECE 302', [{ days: 'MWF', time: '8:00 a.m.-9:00 a.m.' }])];
    const windows = [{ start: 720, end: 900 }]; // 12 PM to 3 PM
    expect(scoreTimeOfDay(sections, windows)).toBe(0);
  });

  it('scores proportionally for mixed meetings', () => {
    const sections = [
      makeSection('ECE 302', [
        { days: 'MWF', time: '10:00 a.m.-11:00 a.m.' },
        { days: 'T', time: '8:00 a.m.-9:00 a.m.' },
      ]),
    ];
    const windows = [{ start: 540, end: 780 }]; // 9 AM to 1 PM
    // 10:00 AM is in window (start=600 >= 540 and < 780), 8:00 AM is not (480 < 540)
    expect(scoreTimeOfDay(sections, windows)).toBeCloseTo(0.5);
  });
});

// ─── scoreBuildingBreak ───────────────────────────────────────────────────────

describe('scoreBuildingBreak', () => {
  it('returns 1.0 for single section (no transitions)', () => {
    const sections = [makeSection('ECE 302', [{ days: 'MWF', time: '9:00 a.m.-10:30 a.m.', room: 'EER 1.516' }])];
    expect(scoreBuildingBreak(sections, distanceTable)).toBe(1.0);
  });

  it('returns 1.0 when gap is sufficient for building distance', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'M', time: '9:00 a.m.-10:00 a.m.', room: 'EER 1.516' }]),
      makeSection('ECE 306', [{ days: 'M', time: '10:30 a.m.-11:30 a.m.', room: 'GDC 6.202' }]),
    ];
    // Gap = 30 min, EER-GDC = 5 min walk + 2 buffer = 7 min, so gap (30) >= 7, ok
    expect(scoreBuildingBreak(sections, distanceTable)).toBe(1.0);
  });

  it('penalizes insufficient gap between distant buildings', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'M', time: '9:00 a.m.-10:00 a.m.', room: 'EER 1.516' }]),
      makeSection('ECE 306', [{ days: 'M', time: '10:02 a.m.-11:00 a.m.', room: 'GDC 6.202' }]),
    ];
    // Gap = 2 min, EER-GDC = 5 min walk + 2 buffer = 7 min, gap (2) < walkTime (5), no credit
    const score = scoreBuildingBreak(sections, distanceTable);
    expect(score).toBeLessThan(1.0);
  });

  it('returns 1.0 with empty sections', () => {
    expect(scoreBuildingBreak([], distanceTable)).toBe(1.0);
  });
});

// ─── scoreInstructionMode ─────────────────────────────────────────────────────

describe('scoreInstructionMode', () => {
  it('returns 0 for empty sections', () => {
    expect(scoreInstructionMode([], 'in-person')).toBe(0);
  });

  it('returns 1.0 for null preference (no preference)', () => {
    const sections = [makeSection('ECE 302', [], '', 'Online')];
    expect(scoreInstructionMode(sections, null)).toBe(1.0);
  });

  it('scores 1.0 when all sections match preference', () => {
    const sections = [
      makeSection('ECE 302', [], '', 'Face-to-face'),
      makeSection('ECE 306', [], '', 'In Person'),
    ];
    expect(scoreInstructionMode(sections, 'in-person')).toBe(1.0);
  });

  it('scores 0 when no sections match preference', () => {
    const sections = [
      makeSection('ECE 302', [], '', 'Online'),
      makeSection('ECE 306', [], '', 'Fully Online'),
    ];
    expect(scoreInstructionMode(sections, 'in-person')).toBe(0);
  });

  it('scores proportionally for mixed modes', () => {
    const sections = [
      makeSection('ECE 302', [], '', 'Face-to-face'),
      makeSection('ECE 306', [], '', 'Online'),
    ];
    expect(scoreInstructionMode(sections, 'in-person')).toBe(0.5);
  });

  it('matches online preference', () => {
    const sections = [makeSection('ECE 302', [], '', 'Fully Online')];
    expect(scoreInstructionMode(sections, 'online')).toBe(1.0);
  });
});

// ─── scoreProfessor ───────────────────────────────────────────────────────────

describe('scoreProfessor', () => {
  it('returns 0 for empty sections', () => {
    expect(scoreProfessor([], mockGrades)).toBe(0);
  });

  it('uses per-instructor GPA when available', () => {
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    // Alice Smith: avg_gpa=3.8, normalized: (3.8-2)/2=0.9
    expect(scoreProfessor(sections, mockGrades)).toBeCloseTo(0.9);
  });

  it('uses lower-rated instructor GPA', () => {
    const sections = [makeSection('ECE 302', [], 'Bob Jones')];
    // Bob Jones: avg_gpa=2.9, normalized: (2.9-2)/2=0.45
    expect(scoreProfessor(sections, mockGrades)).toBeCloseTo(0.45);
  });

  it('falls back to course avg_gpa when instructor not in byInstructor', () => {
    const sections = [makeSection('ECE 302', [], 'Unknown Prof')];
    // Course avg_gpa=3.5, normalized: (3.5-2)/2=0.75
    expect(scoreProfessor(sections, mockGrades)).toBeCloseTo(0.75);
  });

  it('falls back to 3.0 when course not in grade distributions', () => {
    const sections = [makeSection('ECE 999', [], 'Someone')];
    // fallback 3.0, normalized: (3.0-2)/2=0.5
    expect(scoreProfessor(sections, mockGrades)).toBeCloseTo(0.5);
  });
});

// ─── scoreProfessor — prefer/avoid adjustments ────────────────────────────────

describe('scoreProfessor with profPreferences', () => {
  it('empty preferences → unchanged behavior (same as no-arg call)', () => {
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    // Alice Smith GPA 3.8, normalized = 0.9
    expect(scoreProfessor(sections, mockGrades, [])).toBeCloseTo(0.9);
  });

  it('avoided prof scores ≤ 0.1 regardless of GPA signal', () => {
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    // Alice Smith normally scores 0.9 (high GPA); avoided → clamped to ≤ 0.1
    const prefs: ProfPreference[] = [{ name: 'Alice Smith', type: 'avoid' }];
    const score = scoreProfessor(sections, mockGrades, prefs);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it('preferred prof scores ≥ 0.9 regardless of GPA signal', () => {
    const sections = [makeSection('ECE 302', [], 'Bob Jones')];
    // Bob Jones normally scores 0.45 (low GPA); preferred → boosted to ≥ 0.9
    const prefs: ProfPreference[] = [{ name: 'Bob Jones', type: 'prefer' }];
    const score = scoreProfessor(sections, mockGrades, prefs);
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('avoided prof scores lower than same section with no preference', () => {
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    const noPrefs: ProfPreference[] = [];
    const avoidPrefs: ProfPreference[] = [{ name: 'Alice Smith', type: 'avoid' }];
    const baseline = scoreProfessor(sections, mockGrades, noPrefs);
    const withAvoid = scoreProfessor(sections, mockGrades, avoidPrefs);
    expect(withAvoid).toBeLessThan(baseline);
  });

  it('preferred prof scores higher than same section with no preference', () => {
    const sections = [makeSection('ECE 302', [], 'Bob Jones')];
    const noPrefs: ProfPreference[] = [];
    const preferPrefs: ProfPreference[] = [{ name: 'Bob Jones', type: 'prefer' }];
    const baseline = scoreProfessor(sections, mockGrades, noPrefs);
    const withPrefer = scoreProfessor(sections, mockGrades, preferPrefs);
    expect(withPrefer).toBeGreaterThan(baseline);
  });

  it('avoid takes precedence when prof matches both prefer and avoid', () => {
    // Avoid is checked first; if isAvoided → clamp low even if also preferred
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    const prefs: ProfPreference[] = [
      { name: 'Alice Smith', type: 'avoid' },
      { name: 'Alice Smith', type: 'prefer' },
    ];
    const score = scoreProfessor(sections, mockGrades, prefs);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it('case-insensitive match: "alice smith" matches "Alice Smith"', () => {
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    const prefs: ProfPreference[] = [{ name: 'alice smith', type: 'avoid' }];
    const score = scoreProfessor(sections, mockGrades, prefs);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it('partial last-name match: "Smith" matches "Alice Smith"', () => {
    const sections = [makeSection('ECE 302', [], 'Alice Smith')];
    const prefs: ProfPreference[] = [{ name: 'Smith', type: 'avoid' }];
    const score = scoreProfessor(sections, mockGrades, prefs);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it('no instructor name on section → preferences have no effect', () => {
    // Empty string instructor → falls through to course avg_gpa unchanged
    const sections = [makeSection('ECE 302', [], '')];
    const prefs: ProfPreference[] = [{ name: 'Alice Smith', type: 'avoid' }];
    // Should equal the no-pref baseline (course avg 3.5 → 0.75)
    const score = scoreProfessor(sections, mockGrades, prefs);
    expect(score).toBeCloseTo(0.75);
  });

  it('prefer/avoid only applies to matching section; other sections unaffected', () => {
    // Two-course schedule: one avoided prof, one neutral
    const sections = [
      makeSection('ECE 302', [], 'Alice Smith'),  // avoided → capped at 0.1
      makeSection('ECE 302', [], 'Bob Jones'),    // no match → 0.45
    ];
    const prefs: ProfPreference[] = [{ name: 'Alice Smith', type: 'avoid' }];
    const score = scoreProfessor(sections, mockGrades, prefs);
    // Average of capped 0.1 and base 0.45 = 0.275
    expect(score).toBeCloseTo(0.275);
  });
});

// ─── scoreDaySpread ───────────────────────────────────────────────────────────

describe('scoreDaySpread', () => {
  it('returns 0 for empty sections', () => {
    expect(scoreDaySpread([], 'condensed')).toBe(0);
  });

  it('returns 1.0 for null preference', () => {
    const sections = [makeSection('ECE 302', [{ days: 'MWF', time: '9:00 a.m.-10:00 a.m.' }])];
    expect(scoreDaySpread(sections, null)).toBe(1.0);
  });

  it('condensed: 2 days = 1.0', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'TR', time: '9:00 a.m.-10:30 a.m.' }]),
    ];
    expect(scoreDaySpread(sections, 'condensed')).toBe(1.0);
  });

  it('condensed: 4 days = 0.4', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'MTWF', time: '9:00 a.m.-10:30 a.m.' }]),
    ];
    expect(scoreDaySpread(sections, 'condensed')).toBe(0.4);
  });

  it('spread: 5 days = 1.0', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'MTWRF', time: '9:00 a.m.-10:30 a.m.' }]),
    ];
    expect(scoreDaySpread(sections, 'spread')).toBe(1.0);
  });

  it('spread: 2 days = 0.2', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'TR', time: '9:00 a.m.-10:30 a.m.' }]),
    ];
    expect(scoreDaySpread(sections, 'spread')).toBe(0.2);
  });

  it('spread: 1 day = 0.0', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'M', time: '9:00 a.m.-10:30 a.m.' }]),
    ];
    expect(scoreDaySpread(sections, 'spread')).toBe(0.0);
  });
});

// ─── compositeScore ───────────────────────────────────────────────────────────

describe('compositeScore', () => {
  it('returns 0 when all weights are 0', () => {
    const weights: ScoreWeights = { gpa: 0, timeOfDay: 0, buildingBreak: 0, instructionMode: 0, professor: 0, daySpread: 0 };
    const factors: FactorScores = { gpa: 1, timeOfDay: 1, buildingBreak: 1, instructionMode: 1, professor: 1, daySpread: 1 };
    expect(compositeScore(weights, factors)).toBe(0);
  });

  it('returns weighted average', () => {
    const weights: ScoreWeights = { gpa: 1, timeOfDay: 1, buildingBreak: 0, instructionMode: 0, professor: 0, daySpread: 0 };
    const factors: FactorScores = { gpa: 0.8, timeOfDay: 0.6, buildingBreak: 0, instructionMode: 0, professor: 0, daySpread: 0 };
    // (0.8*1 + 0.6*1) / (1+1) = 0.7
    expect(compositeScore(weights, factors)).toBeCloseTo(0.7);
  });

  it('normalizes unequal weights', () => {
    const weights: ScoreWeights = { gpa: 2, timeOfDay: 0, buildingBreak: 0, instructionMode: 0, professor: 0, daySpread: 0 };
    const factors: FactorScores = { gpa: 0.5, timeOfDay: 0, buildingBreak: 0, instructionMode: 0, professor: 0, daySpread: 0 };
    // (0.5*2) / 2 = 0.5
    expect(compositeScore(weights, factors)).toBeCloseTo(0.5);
  });

  it('returns value in [0,1] with DEFAULT_WEIGHTS and perfect scores', () => {
    const factors: FactorScores = { gpa: 1, timeOfDay: 1, buildingBreak: 1, instructionMode: 1, professor: 1, daySpread: 1 };
    expect(compositeScore(DEFAULT_WEIGHTS, factors)).toBe(1.0);
  });
});

// ─── scoreScheduleFull ────────────────────────────────────────────────────────

describe('scoreScheduleFull', () => {
  it('returns all 6 factor scores and composite', () => {
    const sections = [
      makeSection('ECE 302', [{ days: 'MWF', time: '10:00 a.m.-11:00 a.m.', room: 'EER 1.516' }], 'Alice Smith', 'Face-to-face'),
    ];
    const result = scoreScheduleFull(sections, {
      weights: DEFAULT_WEIGHTS,
      gradeDistributions: mockGrades,
    });
    expect(typeof result.composite).toBe('number');
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(1);
    expect(typeof result.factors.gpa).toBe('number');
    expect(typeof result.factors.professor).toBe('number');
  });

  it('timeOfDay factor lowers composite when section is outside preferred window', () => {
    const earlySection = makeSection(
      'ECE 302',
      [{ days: 'MWF', time: '8:00 a.m.-9:00 a.m.' }],
      'Alice Smith',
      'Face-to-face',
    );
    const lateSection = makeSection(
      'ECE 302',
      [{ days: 'MWF', time: '11:00 a.m.-12:00 p.m.' }],
      'Alice Smith',
      'Face-to-face',
    );
    // Preferred window: 10 AM – 3 PM (600–900)
    const windows = [{ start: 600, end: 900 }];
    const weightsTimeHeavy: ScoreWeights = { ...DEFAULT_WEIGHTS, gpa: 0, professor: 0, buildingBreak: 0, instructionMode: 0, daySpread: 0, timeOfDay: 1 };

    const earlyResult = scoreScheduleFull([earlySection], {
      weights: weightsTimeHeavy,
      gradeDistributions: mockGrades,
      preferredWindows: windows,
    });
    const lateResult = scoreScheduleFull([lateSection], {
      weights: weightsTimeHeavy,
      gradeDistributions: mockGrades,
      preferredWindows: windows,
    });

    // 8 AM is outside window → score 0; 11 AM is inside → score 1
    expect(earlyResult.factors.timeOfDay).toBe(0);
    expect(lateResult.factors.timeOfDay).toBe(1);
    expect(lateResult.composite).toBeGreaterThan(earlyResult.composite);
  });

  it('instructionMode factor reflects settings-derived preferredMode', () => {
    const inPersonSection = makeSection('ECE 302', [], 'Alice Smith', 'Face-to-face');
    const onlineSection = makeSection('ECE 306', [], 'Bob Jones', 'Online');
    const weightsModePure: ScoreWeights = { ...DEFAULT_WEIGHTS, gpa: 0, professor: 0, buildingBreak: 0, timeOfDay: 0, daySpread: 0, instructionMode: 1 };

    const inPersonResult = scoreScheduleFull([inPersonSection], {
      weights: weightsModePure,
      gradeDistributions: mockGrades,
      preferredMode: 'in-person',
    });
    const onlineResult = scoreScheduleFull([onlineSection], {
      weights: weightsModePure,
      gradeDistributions: mockGrades,
      preferredMode: 'in-person',
    });

    expect(inPersonResult.factors.instructionMode).toBe(1.0);
    expect(onlineResult.factors.instructionMode).toBe(0);
    expect(inPersonResult.composite).toBeGreaterThan(onlineResult.composite);
  });

  it('buildingBreak factor uses provided distance table', () => {
    const realDistances: Record<string, number> = { 'EER-GDC': 5 };
    const tightSections = [
      makeSection('ECE 302', [{ days: 'M', time: '9:00 a.m.-10:00 a.m.', room: 'EER 1.516' }]),
      makeSection('ECE 306', [{ days: 'M', time: '10:02 a.m.-11:00 a.m.', room: 'GDC 6.202' }]),
    ];
    const weightsDistPure: ScoreWeights = { ...DEFAULT_WEIGHTS, gpa: 0, professor: 0, timeOfDay: 0, instructionMode: 0, daySpread: 0, buildingBreak: 1 };

    const resultWithDist = scoreScheduleFull(tightSections, {
      weights: weightsDistPure,
      gradeDistributions: mockGrades,
      buildingDistances: realDistances,
    });
    const resultNoDist = scoreScheduleFull(tightSections, {
      weights: weightsDistPure,
      gradeDistributions: mockGrades,
      buildingDistances: {},
    });

    // With known distances (5 min walk), 2-min gap is insufficient → penalized
    // Without distances, unknown building defaults to 5 min walk → same penalty applies
    // But the key assertion: the factor is < 1 when gap is tight
    expect(resultWithDist.factors.buildingBreak).toBeLessThan(1.0);
    expect(resultNoDist.factors.buildingBreak).toBeLessThan(1.0);
  });

  it('no-preference settings produce factor scores of 1.0 for mode and timeOfDay', () => {
    const section = makeSection(
      'ECE 302',
      [{ days: 'MWF', time: '10:00 a.m.-11:00 a.m.' }],
      '',
      'Face-to-face',
    );
    const result = scoreScheduleFull([section], {
      weights: DEFAULT_WEIGHTS,
      gradeDistributions: mockGrades,
      preferredWindows: [],   // no_preference → []
      preferredMode: null,     // no_preference → null
      daySpreadPreference: null,
    });
    expect(result.factors.timeOfDay).toBe(1.0);
    expect(result.factors.instructionMode).toBe(1.0);
    expect(result.factors.daySpread).toBe(1.0);
  });
});
