/**
 * wizard-options — TASK-077 (Guided Wizard Hub)
 *
 * Static choice sets for the `/`-resident HomeWizardHub stepper. Kept in one
 * module so the hub and its colocated test agree on the same option lists.
 *
 * These mirror the analogous fields in OnboardingWizard (graduation targets,
 * load tolerance) so the lighter hub seeds the same profile/settings shape —
 * the hub deliberately reuses those data paths rather than inventing new ones.
 */

import type { LoadTolerance } from '@/context/SettingsContext';

/** Step ① — academic standing. Maps to a UT classification + a load default. */
export interface StandingOption {
  id: string;
  /** Display label shown on the card. */
  label: string;
  /** Short helper line under the label. */
  hint: string;
  /** UserProfile.classification value persisted on finish. */
  classification: string;
  /** Sensible default semester load for a student at this standing. */
  loadTolerance: LoadTolerance;
}

export const STANDING_OPTIONS: StandingOption[] = [
  { id: 'freshman', label: 'Freshman', hint: 'First year — just getting started', classification: 'Freshman', loadTolerance: 'normal' },
  { id: 'sophomore', label: 'Sophomore', hint: 'A year in, building momentum', classification: 'Sophomore', loadTolerance: 'above_average' },
  { id: 'junior', label: 'Junior', hint: 'Into the major core', classification: 'Junior', loadTolerance: 'above_average' },
  { id: 'senior', label: 'Senior', hint: 'Closing out the degree', classification: 'Senior', loadTolerance: 'heavy' },
];

/** Step ② — graduation goal. The same option set OnboardingWizard offers. */
export const GRAD_TARGET_OPTIONS: string[] = [
  'Spring 2027',
  'Fall 2027',
  'Spring 2028',
  'Fall 2028',
  'Spring 2029',
  'Fall 2029',
];

/**
 * Step ② also picks the optimization objective the seed plan is built for.
 * 'fastest' fills the fewest semesters; 'easiest' spreads work for a gentler GPA
 * curve. This is the wedge the product is built around, so it gets a dedicated
 * decision rather than burying it in Settings.
 */
export interface GoalModeOption {
  id: 'fastest' | 'easiest';
  label: string;
  hint: string;
}

export const GOAL_MODE_OPTIONS: GoalModeOption[] = [
  { id: 'fastest', label: 'Graduate fastest', hint: 'Pack semesters to finish sooner' },
  { id: 'easiest', label: 'Easiest path (GPA)', hint: 'Spread the load for a gentler term' },
];
