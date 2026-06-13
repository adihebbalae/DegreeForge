/**
 * HomeRoute — TASK-073 / TASK-078
 *
 * Renders the home screen ("/") for whichever variant useHomeVariant() resolves.
 * Each variant key maps to its real design; `cleaned-planner` is the control and
 * stays the existing PlannerPage. The `minimalist-shell` variant supplies its own
 * chrome (thin top bar), so Layout suppresses the global Header for it on "/".
 */

import type { ComponentType } from 'react';
import PlannerPage from '../pages/PlannerPage';
import HomeMinimalist from './home/HomeMinimalist';
import HomeLandingDashboard from './home/HomeLandingDashboard';
import HomeWizardHub from './home/HomeWizardHub';
import { useHomeVariant, type HomeVariant } from '../hooks/useHomeVariant';

// variant → component map. `cleaned-planner` is the control (PlannerPage).
export const VARIANT_COMPONENTS: Record<HomeVariant, ComponentType> = {
  'landing-dashboard': HomeLandingDashboard,
  'cleaned-planner': PlannerPage,
  'minimalist-shell': HomeMinimalist,
  'wizard-hub': HomeWizardHub,
};

export default function HomeRoute() {
  const variant = useHomeVariant();
  const VariantComponent = VARIANT_COMPONENTS[variant];
  return <VariantComponent />;
}
