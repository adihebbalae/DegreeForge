/**
 * HomeRoute — TASK-073
 *
 * Renders the home screen ("/") for whichever variant useHomeVariant() resolves.
 * The four distinct designs are a follow-up task; until then every variant maps
 * to the existing PlannerPage. Swapping in a real variant later is a one-line
 * change: point its key in VARIANT_COMPONENTS at the new component.
 */

import type { ComponentType } from 'react';
import PlannerPage from '../pages/PlannerPage';
import { useHomeVariant, type HomeVariant } from '../hooks/useHomeVariant';

// variant → component map. Every key currently renders the planner; replace the
// value for a key when its real design lands.
const VARIANT_COMPONENTS: Record<HomeVariant, ComponentType> = {
  'landing-dashboard': PlannerPage,
  'cleaned-planner': PlannerPage,
  'minimalist-shell': PlannerPage,
  'wizard-hub': PlannerPage,
};

export default function HomeRoute() {
  const variant = useHomeVariant();
  const VariantComponent = VARIANT_COMPONENTS[variant];
  return <VariantComponent />;
}
