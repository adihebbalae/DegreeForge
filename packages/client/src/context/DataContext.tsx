import React, { createContext, useContext, useEffect, useState } from 'react';
import type {
  CatalogCourse,
  CourseCatalog,
  PrereqGraph,
  GradeDistribution,
  GradeDistributions,
  UserProfile,
  DegreeRequirements,
  TechCores,
  TechCoreTrack,
  OfferingSchedule,
  MathRequirements,
  FallSections,
  CourseSections,
  SectionsIndex,
} from '../types';
import { normalizeGradeDistributions } from '../lib/normalize';
import {
  loadCourseCatalog,
  loadPrereqGraph,
  loadRawGradeDistributions,
  loadUserProfile,
  loadDegreeRequirements,
  loadTechCores,
  loadOfferingSchedule,
  loadMathRequirements,
  loadSectionsIndex,
  loadTermSections,
} from '../lib/data-loaders';

// ─── Context shape ───────────────────────────────────────────────────────────

interface DataContextValue {
  loading: boolean;
  error: string | null;
  catalog: CourseCatalog | null;
  prereqGraph: PrereqGraph | null;
  gradeDistributions: GradeDistributions | null;
  userProfile: UserProfile | null;
  degreeRequirements: DegreeRequirements | null;
  techCores: TechCores | null;
  offeringSchedule: OfferingSchedule | null;
  mathRequirements: MathRequirements | null;
  fallSections: FallSections | null;
  sectionsIndex: SectionsIndex | null;
}

const INITIAL_STATE: DataContextValue = {
  loading: true,
  error: null,
  catalog: null,
  prereqGraph: null,
  gradeDistributions: null,
  userProfile: null,
  degreeRequirements: null,
  techCores: null,
  offeringSchedule: null,
  mathRequirements: null,
  fallSections: null,
  sectionsIndex: null,
};

// ─── Context + Provider ──────────────────────────────────────────────────────

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataContextValue>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      try {
        // Sections live in per-term files discovered via sections-index.json.
        // We load the manifest first, then the default term's section file.
        // See scripts/sections/README.md for how this manifest is maintained.
        const sectionsIndex = await loadSectionsIndex();

        const [
          catalog,
          prereqGraph,
          rawGradeDist,
          userProfile,
          degreeRequirements,
          techCores,
          offeringSchedule,
          mathRequirements,
          fallSections,
        ] = await Promise.all([
          loadCourseCatalog(),
          loadPrereqGraph(),
          loadRawGradeDistributions(),
          loadUserProfile(),
          loadDegreeRequirements(),
          loadTechCores(),
          loadOfferingSchedule(),
          loadMathRequirements(),
          loadTermSections(sectionsIndex.default_term),
        ]);

        if (cancelled) return;

        // Apply E E → ECE normalization at load time.
        // All downstream code can assume "ECE" prefix only.
        const gradeDistributions = normalizeGradeDistributions(rawGradeDist);

        setState({
          loading: false,
          error: null,
          catalog,
          prereqGraph,
          gradeDistributions,
          userProfile,
          degreeRequirements,
          techCores,
          offeringSchedule,
          mathRequirements,
          fallSections,
          sectionsIndex,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'An unknown error occurred while loading data.',
        }));
      }
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

// ─── Internal hook ───────────────────────────────────────────────────────────

function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useDataContext must be called inside a <DataProvider>.');
  }
  return ctx;
}

// ─── Public data-domain hooks ─────────────────────────────────────────────────

/**
 * Returns all courses in the catalog as a flat array.
 * Empty array while loading.
 */
export function useCourseCatalog(): CatalogCourse[] {
  const { catalog } = useDataContext();
  return catalog ? Object.values(catalog) : [];
}

/**
 * Returns the raw catalog Record (course ID → CatalogCourse) for O(1) lookups.
 * Null while loading.
 */
export function useCatalogRecord(): CourseCatalog | null {
  return useDataContext().catalog;
}

/**
 * Returns the prerequisite graph with nodes and edges.
 * Falls back to empty graph while loading.
 */
export function usePrereqGraph(): PrereqGraph {
  const { prereqGraph } = useDataContext();
  return prereqGraph ?? { nodes: {}, edges: [] };
}

/**
 * Returns all tech-core tracks as a flat array.
 * Empty array while loading.
 */
export function useTechCores(): TechCoreTrack[] {
  const { techCores } = useDataContext();
  return techCores ? Object.values(techCores) : [];
}

/**
 * Returns the tech-cores Record (slug → TechCoreTrack) for named lookup.
 * Null while loading.
 */
export function useTechCoresRecord(): TechCores | null {
  return useDataContext().techCores;
}

/**
 * Returns the full degree requirements document.
 * Null while loading.
 */
export function useDegreeRequirements(): DegreeRequirements | null {
  return useDataContext().degreeRequirements;
}

/**
 * Returns the offering schedule Record (course ID → OfferingEntry).
 * Empty object while loading.
 */
export function useOfferingSchedule(): OfferingSchedule {
  const { offeringSchedule } = useDataContext();
  return offeringSchedule ?? {};
}

/**
 * Returns the math requirements document.
 * Null while loading.
 */
export function useMathRequirements(): MathRequirements | null {
  return useDataContext().mathRequirements;
}

/**
 * Returns the default-term sections as a flat array of course section groups.
 * The default term is whichever slug `sections-index.json#default_term` points
 * at (typically the most-recently-published term). Empty array while loading.
 *
 * Name retained for backwards compatibility — existing call sites
 * (SchedulerPage, CourseDetailDialog) continue to work unchanged.
 */
export function useFallSections(): CourseSections[] {
  const { fallSections } = useDataContext();
  return fallSections ? Object.values(fallSections.courses) : [];
}

/**
 * Returns the sections manifest describing which per-term section files are
 * available in `/data/`. Null while loading. Use this to drive a term-picker
 * UI when more than one term is available.
 */
export function useSectionsIndex(): SectionsIndex | null {
  return useDataContext().sectionsIndex;
}

/**
 * Returns the normalized grade distributions Record (course ID → GradeDistribution).
 * All keys use "ECE" prefix (never "E E").
 * Empty object while loading.
 */
export function useGradeDistributions(): Record<string, GradeDistribution> {
  const { gradeDistributions } = useDataContext();
  return gradeDistributions ?? {};
}

/**
 * Returns Adi's user profile (transcript, preferences, tech core declaration).
 * Null while loading.
 */
export function useUserProfile(): UserProfile | null {
  return useDataContext().userProfile;
}

/** True while any data file is still being fetched. */
export function useDataLoading(): boolean {
  return useDataContext().loading;
}

/** Non-null string if any data file failed to load. */
export function useDataError(): string | null {
  return useDataContext().error;
}
