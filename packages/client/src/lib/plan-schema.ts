import { z } from 'zod';
import type { PlanState } from '../types';
import type { SnapshotState } from '../context/PlanContext.constants';

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

export function parsePlanState(raw: unknown): PlanState | null {
  const result = planStateSchema.safeParse(raw);
  return result.success ? (result.data as PlanState) : null;
}

export function parseSnapshotState(raw: unknown): SnapshotState | null {
  const result = snapshotStateSchema.safeParse(raw);
  return result.success ? result.data : null;
}
