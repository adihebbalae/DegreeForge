import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { UserProfile } from '../types';
import { parseProfileState } from '../lib/profile-schema';
import { loadDemoProfile } from '../lib/data-loaders';

// ─── Storage Key ───────────────────────────────────────────────────────────────

export const PROFILE_STORAGE_KEY = 'degreeforge:profile:v1';

// ─── Empty Profile (blank student) ────────────────────────────────────────────

export const EMPTY_PROFILE: UserProfile = {
  name: '',
  eid: '',
  university: 'The University of Texas at Austin',
  catalog_year: '2024',
  major: 'ece-bse',
  classification: '',
  first_semester: '',
  graduation_target: '',
  tech_core: {
    declared: '',
    status: '',
    required_math: '',
    required_ece: [],
    tech_electives_needed: 0,
  },
  secondary_aspirations: {
    math_ba: { status: '', notes: '' },
    advanced_math_cert: { status: '', notes: '' },
    jefferson_scholars_cert: { status: '', notes: '' },
  },
  preferences: {
    course_load: '',
    course_load_tolerance: 'above_average',
    time_preference: 'no_preference',
    summer_courses: false,
    summer_notes: '',
  },
  gpa: {
    cumulative: 0,
    lower_division: 0,
    upper_division: 0,
    gpa_hours: 0,
    grade_points: 0,
  },
  credit_summary: {
    total_hours_transferred: 0,
    total_hours_taken: 0,
    total_hours: 0,
  },
  completed_courses: [],
  in_progress_courses: [],
  career_interests: [],
  notes: '',
};

// ─── Actions ───────────────────────────────────────────────────────────────────

export type ProfileAction =
  | { type: 'SET_PROFILE'; profile: UserProfile }
  | { type: 'UPDATE_PROFILE_FIELD'; field: keyof UserProfile; value: UserProfile[keyof UserProfile] }
  | { type: 'ADD_COMPLETED_COURSE'; course: UserProfile['completed_courses'][number] }
  | { type: 'UPDATE_COMPLETED_COURSE'; index: number; course: UserProfile['completed_courses'][number] }
  | { type: 'REMOVE_COMPLETED_COURSE'; index: number }
  | { type: 'ADD_INPROGRESS_COURSE'; course: UserProfile['in_progress_courses'][number] }
  | { type: 'UPDATE_INPROGRESS_COURSE'; index: number; course: UserProfile['in_progress_courses'][number] }
  | { type: 'REMOVE_INPROGRESS_COURSE'; index: number }
  | { type: 'LOAD_DEMO'; profile: UserProfile }
  | { type: 'CLEAR_PROFILE' };

// ─── Reducer ───────────────────────────────────────────────────────────────────

export function profileReducer(state: UserProfile, action: ProfileAction): UserProfile {
  switch (action.type) {
    case 'SET_PROFILE':
      return action.profile;

    case 'UPDATE_PROFILE_FIELD':
      return { ...state, [action.field]: action.value };

    case 'ADD_COMPLETED_COURSE':
      return { ...state, completed_courses: [...state.completed_courses, action.course] };

    case 'UPDATE_COMPLETED_COURSE': {
      const updated = [...state.completed_courses];
      updated[action.index] = action.course;
      return { ...state, completed_courses: updated };
    }

    case 'REMOVE_COMPLETED_COURSE':
      return {
        ...state,
        completed_courses: state.completed_courses.filter((_, i) => i !== action.index),
      };

    case 'ADD_INPROGRESS_COURSE':
      return { ...state, in_progress_courses: [...state.in_progress_courses, action.course] };

    case 'UPDATE_INPROGRESS_COURSE': {
      const updated = [...state.in_progress_courses];
      updated[action.index] = action.course;
      return { ...state, in_progress_courses: updated };
    }

    case 'REMOVE_INPROGRESS_COURSE':
      return {
        ...state,
        in_progress_courses: state.in_progress_courses.filter((_, i) => i !== action.index),
      };

    case 'LOAD_DEMO':
      return action.profile;

    case 'CLEAR_PROFILE':
      return EMPTY_PROFILE;

    default:
      return state;
  }
}

// ─── Context Shape ─────────────────────────────────────────────────────────────

interface ProfileContextValue {
  profile: UserProfile;
  dispatch: React.Dispatch<ProfileAction>;
  /** True until the demo profile has finished loading (only during LOAD_DEMO async fetch) */
  demoLoading: boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, dispatch] = useReducer(profileReducer, EMPTY_PROFILE, () => {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = parseProfileState(JSON.parse(stored));
        if (parsed) return parsed;
      } catch (e) {
        console.error('Failed to parse stored profile state:', e);
      }
    }
    return EMPTY_PROFILE;
  });

  const [demoLoading, setDemoLoading] = React.useState(false);

  // Auto-persist on every profile change
  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  return (
    <ProfileContext.Provider value={{ profile, dispatch, demoLoading }}>
      {children}
    </ProfileContext.Provider>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useProfileContext(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfileContext must be called inside a <ProfileProvider>.');
  }
  return ctx;
}

/**
 * Returns the tester-owned profile from localStorage.
 * Null while any async initialization is in progress (in practice never null
 * because localStorage is synchronous, but kept for API compatibility).
 */
export function useOwnedProfile(): UserProfile {
  return useProfileContext().profile;
}

export function useProfileDispatch(): React.Dispatch<ProfileAction> {
  return useProfileContext().dispatch;
}

/**
 * Async helper: load the demo profile from /data/user-profile.json, dispatch
 * LOAD_DEMO to ProfileContext, and also dispatch SET_PLAN to PlanContext with the
 * derived timeline. Call sites (Settings demo button) use this instead of
 * dispatching LOAD_DEMO manually.
 *
 * Returns the loaded demo profile so callers can also derive the timeline.
 */
export async function fetchAndLoadDemo(
  profileDispatch: React.Dispatch<ProfileAction>
): Promise<UserProfile> {
  const demo = await loadDemoProfile();
  profileDispatch({ type: 'LOAD_DEMO', profile: demo });
  return demo;
}

// ─── Re-export useUserProfile pointing at owned profile ───────────────────────
// All 21 consumers that call useUserProfile() continue to work unchanged.
// Previously: returned DataContext-fetched static JSON.
// Now: returns the tester-owned profile (initialized from localStorage or EMPTY_PROFILE).

/**
 * Returns the tester-owned user profile. Matches the previous null-while-loading
 * contract: returns null only if ProfileProvider is absent. In practice always
 * returns a non-null value (EMPTY_PROFILE or a stored profile) on first render
 * since localStorage is synchronous.
 */
export function useUserProfile(): UserProfile | null {
  const ctx = useContext(ProfileContext);
  if (!ctx) return null;
  return ctx.profile;
}
