import type { SchedulerWeights, InstructionMode, TimeWindow as SettingsTimeWindow } from '@/context/SettingsContext';
import type { ScoreWeights } from '@/lib/scheduler';
import type { TimeWindow } from '@/lib/score';

export const FACTOR_LABELS: Record<keyof ScoreWeights, string> = {
  gpa: 'Course GPA',
  timeOfDay: 'Time of Day',
  buildingBreak: 'Building Distance',
  instructionMode: 'Instruction Mode',
  professor: 'Instructor GPA',
  daySpread: 'Day Spread',
};

/**
 * Maps SettingsContext SchedulerWeights keys → score.ts ScoreWeights keys.
 * The two use different naming conventions for historical reasons.
 */
export function settingsToScoreWeights(sw: SchedulerWeights): ScoreWeights {
  return {
    gpa: sw.gpa,
    timeOfDay: sw.timeFit,
    buildingBreak: sw.buildingPenalty,
    instructionMode: sw.instructionMode,
    professor: sw.professorPreference,
    daySpread: sw.daySpread,
  };
}

/** Reverse mapping: ScoreWeights key → SchedulerWeights key */
export const SCORE_TO_SETTINGS_KEY: Record<keyof ScoreWeights, keyof SchedulerWeights> = {
  gpa: 'gpa',
  timeOfDay: 'timeFit',
  buildingBreak: 'buildingPenalty',
  instructionMode: 'instructionMode',
  professor: 'professorPreference',
  daySpread: 'daySpread',
};

/**
 * Converts a SettingsContext TimeWindow string to score.ts TimeWindow array.
 * Returns an empty array for 'no_preference' (all times score 1.0).
 */
export function settingsTimeWindowToScoreWindows(tw: SettingsTimeWindow): TimeWindow[] {
  switch (tw) {
    case 'no_early':
      // Avoid before 10 AM: preferred window is 10 AM – 9 PM
      return [{ start: 600, end: 1260 }];
    case 'no_late':
      // Avoid after 5 PM: preferred window is 8 AM – 5 PM
      return [{ start: 480, end: 1020 }];
    case 'mornings_only':
      // 8 AM – 12 PM
      return [{ start: 480, end: 720 }];
    case 'afternoons_only':
      // 12 PM – 6 PM
      return [{ start: 720, end: 1080 }];
    case 'no_preference':
    default:
      return [];
  }
}

/**
 * Converts a SettingsContext InstructionMode to the score.ts preferredMode.
 * Returns null for 'no_preference'.
 */
export function settingsInstructionModeToPreferredMode(
  mode: InstructionMode
): 'in-person' | 'online' | 'hybrid' | null {
  switch (mode) {
    case 'in_person': return 'in-person';
    case 'online': return 'online';
    case 'hybrid': return 'hybrid';
    case 'no_preference':
    default:
      return null;
  }
}
