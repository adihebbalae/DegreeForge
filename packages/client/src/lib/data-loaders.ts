import type {
  CourseCatalog,
  PrereqGraph,
  UserProfile,
  DegreeRequirements,
  TechCores,
  OfferingSchedule,
  MathRequirements,
  FallSections,
} from '../types';

/** Raw shape of grade-distributions.json before normalization */
export interface RawGradeDistributionsFile {
  courses: Record<string, import('../types').GradeDistribution>;
}

/**
 * Generic JSON fetcher with typed return and meaningful error messages.
 * Throws on non-2xx responses.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }
  return response.json() as Promise<T>;
}

// ─── Per-file loaders ────────────────────────────────────────────────────────

export function loadCourseCatalog(): Promise<CourseCatalog> {
  return fetchJson<CourseCatalog>('/data/course-catalog.json');
}

export function loadPrereqGraph(): Promise<PrereqGraph> {
  return fetchJson<PrereqGraph>('/data/prerequisite-graph.json');
}

export function loadRawGradeDistributions(): Promise<RawGradeDistributionsFile> {
  return fetchJson<RawGradeDistributionsFile>('/data/grade-distributions.json');
}

export function loadUserProfile(): Promise<UserProfile> {
  return fetchJson<UserProfile>('/data/user-profile.json');
}

export function loadDegreeRequirements(): Promise<DegreeRequirements> {
  return fetchJson<DegreeRequirements>('/data/degree-requirements.json');
}

export function loadTechCores(): Promise<TechCores> {
  return fetchJson<TechCores>('/data/tech-cores.json');
}

export function loadOfferingSchedule(): Promise<OfferingSchedule> {
  return fetchJson<OfferingSchedule>('/data/offering-schedule.json');
}

export function loadMathRequirements(): Promise<MathRequirements> {
  return fetchJson<MathRequirements>('/data/math-requirements.json');
}

export function loadFallSections(): Promise<FallSections> {
  return fetchJson<FallSections>('/data/fall-2026-sections.json');
}
