/**
 * score.ts — 6-factor schedule scoring for TASK-021
 *
 * Each factor function returns a value in [0, 1].
 * Higher = better.
 *
 * Factors:
 *   1. scoreGpa          — average per-instructor (or course) GPA
 *   2. scoreTimeOfDay    — alignment with preferred time windows
 *   3. scoreBuildingBreak — penalty for back-to-back in distant buildings
 *   4. scoreInstructionMode — preference for in-person vs online
 *   5. scoreProfessor    — per-instructor GPA signal from TASK-028 byInstructor
 *   6. scoreDaySpread    — preference for condensed vs spread schedule
 */

import type { GradeDistributions } from '../types';
import type { ScheduledSection } from './scheduler';
import type { ProfPreference } from '../context/SettingsContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeWindow {
  /** Start time in minutes from midnight (e.g. 9*60 = 540 for 9:00 AM) */
  start: number;
  /** End time in minutes from midnight */
  end: number;
}

export interface ScoreWeights {
  gpa: number;
  timeOfDay: number;
  buildingBreak: number;
  instructionMode: number;
  professor: number;
  daySpread: number;
}

export interface FactorScores {
  gpa: number;
  timeOfDay: number;
  buildingBreak: number;
  instructionMode: number;
  professor: number;
  daySpread: number;
}

export interface ScoredFactors {
  weights: ScoreWeights;
  factors: FactorScores;
  composite: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  gpa: 0.35,
  timeOfDay: 0.20,
  buildingBreak: 0.15,
  instructionMode: 0.10,
  professor: 0.15,
  daySpread: 0.05,
};

// ─── Time Parsing ─────────────────────────────────────────────────────────────

/** Parses "9:00 a.m." → minutes from midnight (540). Returns -1 on failure. */
export function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.toLowerCase().match(/(\d+):(\d+)\s*([ap]\.m\.)/);
  if (!match) return -1;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3];
  if (ampm.startsWith('p') && h < 12) h += 12;
  if (ampm.startsWith('a') && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Parses "9:00 a.m.-10:30 a.m." → [startMin, endMin].
 * Returns null if unparseable.
 */
export function parseInterval(intervalStr: string): [number, number] | null {
  const dashIdx = intervalStr.lastIndexOf('-');
  if (dashIdx === -1) return null;
  const startStr = intervalStr.slice(0, dashIdx).trim();
  const endStr = intervalStr.slice(dashIdx + 1).trim();
  const start = parseTimeToMinutes(startStr);
  const end = parseTimeToMinutes(endStr);
  if (start === -1 || end === -1) return null;
  return [start, end];
}

// ─── Building Distance ────────────────────────────────────────────────────────

/**
 * Extracts building code from a room string like "EER 1.516" → "EER".
 * Returns null if format unrecognized.
 */
export function extractBuilding(room: string): string | null {
  const match = room.trim().match(/^([A-Z]+)/);
  return match ? match[1] : null;
}

/**
 * Looks up walking minutes between two buildings.
 * Tries both orderings (A-B and B-A).
 * Returns null if no data available (defaults to 0-penalty in scoring).
 */
export function getBuildingDistance(
  buildingA: string,
  buildingB: string,
  distanceTable: Record<string, number>
): number | null {
  const key1 = `${buildingA}-${buildingB}`;
  const key2 = `${buildingB}-${buildingA}`;
  if (key1 in distanceTable) return distanceTable[key1];
  if (key2 in distanceTable) return distanceTable[key2];
  return null;
}

// ─── Factor 1: GPA ────────────────────────────────────────────────────────────

/**
 * Scores a schedule by average course-level GPA.
 * GPA range [0, 4.0]. Normalizes to [0, 1] assuming [2.0, 4.0] practical range.
 * Falls back to 3.0 if course not in distributions.
 */
export function scoreGpa(
  sections: ScheduledSection[],
  gradeDistributions: GradeDistributions
): number {
  if (sections.length === 0) return 0;
  let total = 0;
  for (const s of sections) {
    const dist = gradeDistributions[s.courseId];
    total += dist ? dist.avg_gpa : 3.0;
  }
  const avg = total / sections.length;
  // Normalize: 2.0 → 0, 4.0 → 1
  return Math.max(0, Math.min(1, (avg - 2.0) / 2.0));
}

// ─── Factor 2: Time of Day ────────────────────────────────────────────────────

/**
 * Scores a schedule based on alignment with preferred time windows.
 * preferredWindows: e.g. [{ start: 600, end: 900 }] = 10 AM–3 PM preferred.
 * A section that starts within a preferred window scores 1.0; outside scores 0.
 * Schedule score = fraction of sections within preferred windows.
 * If preferredWindows is empty, all times score 1.0 (no preference).
 */
export function scoreTimeOfDay(
  sections: ScheduledSection[],
  preferredWindows: TimeWindow[]
): number {
  if (sections.length === 0) return 0;
  if (preferredWindows.length === 0) return 1.0;

  let inWindowCount = 0;
  let totalMeetings = 0;

  for (const s of sections) {
    for (const m of s.meetings) {
      if (!m.time) continue;
      totalMeetings++;
      const interval = parseInterval(m.time);
      if (!interval) continue;
      const [startMin] = interval;
      const inWindow = preferredWindows.some(
        w => startMin >= w.start && startMin < w.end
      );
      if (inWindow) inWindowCount++;
    }
  }

  if (totalMeetings === 0) return 1.0;
  return inWindowCount / totalMeetings;
}

// ─── Factor 3: Building Break ─────────────────────────────────────────────────

/**
 * Penalizes back-to-back classes in buildings that require more than
 * `minPassingMinutes` of walking time (default: 15 minutes passing time assumed).
 *
 * For each pair of consecutive meetings on the same day (sorted by start time),
 * checks if the break between them is sufficient given the building distance.
 * Insufficient breaks reduce the score.
 *
 * Returns [0, 1]. 1 = no problematic transitions. 0 = all transitions are rushed.
 */
export function scoreBuildingBreak(
  sections: ScheduledSection[],
  distanceTable: Record<string, number>,
  minPassingMinutes = 15
): number {
  // Collect all meetings with parsed times
  interface ParsedMeeting {
    day: string;
    start: number;
    end: number;
    building: string | null;
  }

  const meetings: ParsedMeeting[] = [];
  for (const s of sections) {
    for (const m of s.meetings) {
      if (!m.days || !m.time) continue;
      const interval = parseInterval(m.time);
      if (!interval) continue;
      const building = m.room ? extractBuilding(m.room) : null;
      for (const day of m.days.split('')) {
        meetings.push({ day, start: interval[0], end: interval[1], building });
      }
    }
  }

  if (meetings.length < 2) return 1.0;

  // Group by day and sort by start time
  const byDay: Record<string, ParsedMeeting[]> = {};
  for (const m of meetings) {
    if (!byDay[m.day]) byDay[m.day] = [];
    byDay[m.day].push(m);
  }

  let total = 0;
  let ok = 0;

  for (const day of Object.keys(byDay)) {
    const sorted = byDay[day].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      const gap = next.start - curr.end;
      if (gap < 0) continue; // Overlapping (shouldn't happen after conflict check)

      total++;
      if (curr.building && next.building && curr.building !== next.building) {
        const dist = getBuildingDistance(curr.building, next.building, distanceTable);
        const walkTime = dist ?? 5; // Unknown buildings: assume 5 min walk
        const needed = walkTime + 2; // 2 min buffer
        if (gap >= needed) ok++;
        // Partial credit: if close to needed time
        else if (gap >= walkTime) ok += 0.5;
      } else {
        // Same building or unknown — gap >= minPassingMinutes is comfortable
        if (gap >= minPassingMinutes) ok++;
        else if (gap >= 5) ok += 0.5;
      }
    }
  }

  if (total === 0) return 1.0;
  return ok / total;
}

// ─── Factor 4: Instruction Mode ──────────────────────────────────────────────

/**
 * Scores a schedule based on preferred instruction mode.
 * preferredMode: 'in-person' | 'online' | 'hybrid' | null (no preference)
 * Matching sections score 1.0, mismatches score 0.
 * Schedule score = fraction of sections matching preference.
 * If preferredMode is null, all modes score 1.0.
 */
export function scoreInstructionMode(
  sections: ScheduledSection[],
  preferredMode: 'in-person' | 'online' | 'hybrid' | null
): number {
  if (sections.length === 0) return 0;
  if (!preferredMode) return 1.0;

  const modeMap: Record<string, string[]> = {
    'in-person': ['Face-to-face', 'In Person', 'face-to-face', 'in-person'],
    'online': ['Online', 'Fully Online', 'online', 'Distance Learning'],
    'hybrid': ['Hybrid', 'hybrid', 'Blended'],
  };

  const preferredValues = modeMap[preferredMode] ?? [];
  let matches = 0;
  for (const s of sections) {
    if (preferredValues.some(v => s.instruction_mode?.includes(v))) {
      matches++;
    }
  }
  return matches / sections.length;
}

// ─── Factor 5: Professor ──────────────────────────────────────────────────────

/**
 * Returns true if `instructorName` matches any entry in `prefs` where `type === targetType`.
 *
 * Matching strategy: case-insensitive substring check in both directions —
 * i.e. the stored preference name appears inside the section instructor string, or
 * vice versa. This handles "Smith" matching "Alice Smith" and "Alice Smith"
 * matching "Smith, Alice" reasonably well without a full name-normalizer.
 *
 * Limitation: very short last-name preferences (e.g. "Lee") may produce false
 * positives if another instructor's full name contains that substring.
 */
function matchesProfPref(
  instructorName: string,
  prefs: ProfPreference[],
  targetType: 'prefer' | 'avoid'
): boolean {
  const nameLower = instructorName.toLowerCase();
  return prefs.some(p => {
    if (p.type !== targetType) return false;
    const prefLower = p.name.toLowerCase();
    return nameLower.includes(prefLower) || prefLower.includes(nameLower);
  });
}

/**
 * Scores a schedule by per-instructor GPA from TASK-028 `byInstructor` data.
 * Falls back to course-level avg_gpa if instructor-specific data is unavailable.
 * GPA normalized to [0, 1] using [2.0, 4.0] range.
 *
 * If `profPreferences` is provided, the per-section GPA-based factor is clamped:
 *   - Avoided instructor → factor clamped to min(base, 0.1)  (forced low)
 *   - Preferred instructor (and not avoided) → factor clamped to max(base, 0.9) (forced high)
 *   - No match → base GPA factor unchanged
 *
 * The final score is the mean of all per-section factors, normalized to [0, 1].
 */
export function scoreProfessor(
  sections: ScheduledSection[],
  gradeDistributions: GradeDistributions,
  profPreferences: ProfPreference[] = []
): number {
  if (sections.length === 0) return 0;
  let total = 0;
  for (const s of sections) {
    const dist = gradeDistributions[s.courseId];
    const rawGpa = (() => {
      if (!dist) return 3.0;
      const instructorName = s.instructor?.trim();
      const instructorStats =
        instructorName && dist.byInstructor?.[instructorName];
      if (instructorStats && instructorStats.avg_gpa > 0) {
        return instructorStats.avg_gpa;
      }
      return dist.avg_gpa;
    })();

    // Normalize GPA to [0, 1]: 2.0 → 0, 4.0 → 1
    let factor = Math.max(0, Math.min(1, (rawGpa - 2.0) / 2.0));

    // Apply prefer/avoid adjustment when preferences are present
    if (profPreferences.length > 0) {
      const instructorName = s.instructor?.trim() ?? '';
      if (instructorName) {
        const isAvoided = matchesProfPref(instructorName, profPreferences, 'avoid');
        const isPreferred = matchesProfPref(instructorName, profPreferences, 'prefer');
        if (isAvoided) {
          factor = Math.min(factor, 0.1);
        } else if (isPreferred) {
          factor = Math.max(factor, 0.9);
        }
      }
    }

    total += factor;
  }
  return total / sections.length;
}

// ─── Factor 6: Day Spread ─────────────────────────────────────────────────────

/**
 * Scores a schedule based on day-spread preference.
 * condensed = fewer distinct days with classes (e.g. MWF or TR pattern)
 * spread = more distinct days
 *
 * preference: 'condensed' | 'spread' | null (no preference = 1.0)
 *
 * Condensed: 2 days = 1.0, 3 days = 0.7, 4 days = 0.4, 5 days = 0.1
 * Spread: 5 days = 1.0, 4 days = 0.8, 3 days = 0.5, 2 days = 0.2, 1 day = 0.0
 */
export function scoreDaySpread(
  sections: ScheduledSection[],
  preference: 'condensed' | 'spread' | null
): number {
  if (sections.length === 0) return 0;
  if (!preference) return 1.0;

  const activeDays = new Set<string>();
  for (const s of sections) {
    for (const m of s.meetings) {
      if (m.days) {
        for (const d of m.days.split('')) {
          activeDays.add(d);
        }
      }
    }
  }

  const numDays = activeDays.size;

  if (preference === 'condensed') {
    // Fewer days = higher score
    if (numDays <= 1) return 1.0;
    if (numDays === 2) return 1.0;
    if (numDays === 3) return 0.7;
    if (numDays === 4) return 0.4;
    return 0.1; // 5 days
  } else {
    // More days = higher score
    if (numDays <= 1) return 0.0;
    if (numDays === 2) return 0.2;
    if (numDays === 3) return 0.5;
    if (numDays === 4) return 0.8;
    return 1.0; // 5 days
  }
}

// ─── Composite Score ──────────────────────────────────────────────────────────

/**
 * Computes a normalized weighted composite from factor scores and weights.
 * Weights are normalized so they always sum to 1 (handles 0-weight factors).
 * Returns a value in [0, 1].
 */
export function compositeScore(
  weights: ScoreWeights,
  factors: FactorScores
): number {
  const keys = Object.keys(weights) as Array<keyof ScoreWeights>;
  const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
  if (totalWeight === 0) return 0;

  let sum = 0;
  for (const k of keys) {
    sum += factors[k] * weights[k];
  }
  return sum / totalWeight;
}

// ─── Full Schedule Scoring ────────────────────────────────────────────────────

export interface ScheduleScoringOptions {
  weights: ScoreWeights;
  gradeDistributions: GradeDistributions;
  preferredWindows?: TimeWindow[];
  buildingDistances?: Record<string, number>;
  preferredMode?: 'in-person' | 'online' | 'hybrid' | null;
  daySpreadPreference?: 'condensed' | 'spread' | null;
  profPreferences?: ProfPreference[];
}

/**
 * Scores a full set of scheduled sections using all 6 factors.
 * Returns both the factor scores (for breakdown display) and composite.
 */
export function scoreScheduleFull(
  sections: ScheduledSection[],
  options: ScheduleScoringOptions
): ScoredFactors {
  const {
    weights,
    gradeDistributions,
    preferredWindows = [],
    buildingDistances = {},
    preferredMode = null,
    daySpreadPreference = null,
    profPreferences = [],
  } = options;

  const factors: FactorScores = {
    gpa: scoreGpa(sections, gradeDistributions),
    timeOfDay: scoreTimeOfDay(sections, preferredWindows),
    buildingBreak: scoreBuildingBreak(sections, buildingDistances),
    instructionMode: scoreInstructionMode(sections, preferredMode),
    professor: scoreProfessor(sections, gradeDistributions, profPreferences),
    daySpread: scoreDaySpread(sections, daySpreadPreference),
  };

  return {
    weights,
    factors,
    composite: compositeScore(weights, factors),
  };
}
