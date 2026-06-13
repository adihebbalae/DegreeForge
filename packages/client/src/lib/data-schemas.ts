import { z } from 'zod';
import type {
  CourseCatalog,
  PrereqGraphData,
  DegreeRequirements,
  TechCores,
  OfferingSchedule,
  MathRequirements,
  FallSections,
  SectionsIndex,
} from '../types';
import type { RawGradeDistributionsFile } from './data-loaders';

/**
 * data-schemas.ts
 *
 * Lenient, structural Zod schemas for each static `/data/*.json` file. Their job
 * is to fail LOUDLY at load when a file is the wrong SHAPE (e.g. a scraper
 * regression emits an array instead of a keyed object, or drops a required
 * top-level field) — not to re-validate every leaf. A wrong-shape file would
 * otherwise surface much later as a confusing solver / progress bug.
 *
 * Posture: `.passthrough()` everywhere so unknown extra fields never reject a
 * file (the data evolves faster than these schemas). We assert just enough
 * structure that the downstream code's assumptions hold.
 */

const catalogCourseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    credits: z.number().nullable(),
    prerequisites: z.array(z.string()),
    corequisites: z.array(z.string()),
  })
  .passthrough();

export const courseCatalogSchema: z.ZodType<CourseCatalog> = z.record(
  z.string(),
  catalogCourseSchema
) as unknown as z.ZodType<CourseCatalog>;

export const prereqGraphSchema: z.ZodType<PrereqGraphData> = z
  .object({
    nodes: z.record(z.string(), z.object({}).passthrough()),
    edges: z.array(
      z
        .object({
          from: z.string(),
          to: z.string(),
          type: z.enum(['prerequisite', 'corequisite']),
        })
        .passthrough()
    ),
  })
  .passthrough() as unknown as z.ZodType<PrereqGraphData>;

export const gradeDistributionsSchema: z.ZodType<RawGradeDistributionsFile> = z
  .object({
    courses: z.record(z.string(), z.object({}).passthrough()),
  })
  .passthrough() as unknown as z.ZodType<RawGradeDistributionsFile>;

export const degreeRequirementsSchema: z.ZodType<DegreeRequirements> = z
  .object({
    ece_core: z.unknown(),
    core_curriculum: z.unknown(),
    tech_core: z.unknown(),
    total_credit_hours: z.number(),
  })
  .passthrough() as unknown as z.ZodType<DegreeRequirements>;

export const techCoresSchema: z.ZodType<TechCores> = z.record(
  z.string(),
  z
    .object({
      name: z.string(),
      required_courses: z.object({}).passthrough(),
      elective_pool: z.array(z.string()),
    })
    .passthrough()
) as unknown as z.ZodType<TechCores>;

export const offeringScheduleSchema: z.ZodType<OfferingSchedule> = z.record(
  z.string(),
  z
    .object({
      title: z.string(),
      offerings: z.record(z.string(), z.boolean()),
      offered_semesters: z.array(z.string()),
    })
    .passthrough()
) as unknown as z.ZodType<OfferingSchedule>;

export const mathRequirementsSchema: z.ZodType<MathRequirements> = z
  .object({
    math_ba: z.object({}).passthrough(),
  })
  .passthrough() as unknown as z.ZodType<MathRequirements>;

export const sectionsIndexSchema: z.ZodType<SectionsIndex> = z
  .object({
    default_term: z.string(),
    terms: z.array(
      z
        .object({
          slug: z.string(),
          label: z.string(),
          code: z.string(),
          file: z.string(),
        })
        .passthrough()
    ),
  })
  .passthrough() as unknown as z.ZodType<SectionsIndex>;

export const fallSectionsSchema: z.ZodType<FallSections> = z
  .object({
    semester: z.string(),
    semester_code: z.string(),
    source: z.string(),
    courses: z.record(z.string(), z.object({}).passthrough()),
  })
  .passthrough() as unknown as z.ZodType<FallSections>;
