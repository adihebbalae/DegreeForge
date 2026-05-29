import { z } from 'zod';
import type { PlanState } from '../types';
import type { SnapshotState } from '../context/PlanContext.constants';
import type { SettingsState } from '../context/SettingsContext';

const semesterSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['past', 'current', 'future']),
  year: z.number(),
  season: z.enum(['Fall', 'Spring', 'Summer']),
});

const whatIfSchema = z.object({
  techCoreId: z.string(),
  mathBAToggle: z.boolean(),
  isActive: z.boolean(),
});

const planStateSchema = z.object({
  semesters: z.array(semesterSchema),
  plan: z.record(z.string(), z.array(z.string())),
  pinnedCourses: z.array(z.string()).default([]),
  hoveredCourse: z.string().nullable().default(null),
  whatIf: whatIfSchema.default({ techCoreId: '', mathBAToggle: false, isActive: false }),
  gradeEntries: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  ghostCourses: z.record(z.string(), z.array(z.string())).default({}),
  rejectedGhosts: z.array(z.string()).default([]),
  focusedGhostId: z.string().nullable().default(null),
  major: z.string().default('ece-bse'),
  catalogYear: z.string().default('2024'),
});

export const planSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.record(z.string(), z.array(z.string())),
  createdAt: z.number(),
});

export const snapshotStateSchema = z.object({
  snapshots: z.array(planSnapshotSchema),
  comparisonMode: z.enum(['off', 'sidebar-diff', 'split-view']).default('off'),
});

export { semesterSchema, whatIfSchema, planStateSchema };

const settingsStateSchema = z.object({
  loadTolerance: z.enum(['light', 'normal', 'above_average', 'heavy']).default('above_average'),
  gradTarget: z.string().default('Spring 2029'),
  techCoreId: z.string().default('computer_architecture'),
  mathBAToggle: z.boolean().default(false),
  schedulerWeights: z.object({
    gpa: z.number().default(0.35),
    timeFit: z.number().default(0.20),
    buildingPenalty: z.number().default(0.10),
    instructionMode: z.number().default(0.15),
    professorPreference: z.number().default(0.15),
    daySpread: z.number().default(0.05),
  }).default({ gpa: 0.35, timeFit: 0.20, buildingPenalty: 0.10, instructionMode: 0.15, professorPreference: 0.15, daySpread: 0.05 }),
  timeWindow: z.enum(['no_early', 'no_late', 'mornings_only', 'afternoons_only', 'no_preference']).default('no_preference'),
  instructionMode: z.enum(['in_person', 'online', 'hybrid', 'no_preference']).default('no_preference'),
  profPreferences: z.array(z.object({ name: z.string(), type: z.enum(['prefer', 'avoid']) })).default([]),
  paletteSortMode: z.enum(['recommended', 'easiest']).default('recommended'),
});

export function parseSettingsState(raw: unknown): SettingsState | null {
  const result = settingsStateSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parsePlanState(raw: unknown): PlanState | null {
  const result = planStateSchema.safeParse(raw);
  return result.success ? (result.data as PlanState) : null;
}

export function parseSnapshotState(raw: unknown): SnapshotState | null {
  const result = snapshotStateSchema.safeParse(raw);
  return result.success ? result.data : null;
}
