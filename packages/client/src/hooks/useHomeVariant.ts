/**
 * useHomeVariant — TASK-073
 *
 * Resolves which home-screen variant to render for the 4-way A/B test. The four
 * designs are a follow-up task; for now every variant renders the existing
 * planner page (see HomeRoute). This hook only decides the *name*.
 *
 * Resolution order (first match wins):
 *   1. `?variant=<name>` query param — explicit override for manual testing / QA.
 *   2. localStorage dev-override key (`degreeforge:home-variant`) — sticky dev pin.
 *   3. PostHog `getFeatureFlag('home-variant')` — the live experiment assignment.
 *      Safe no-op when PostHog isn't initialized (returns undefined → fall through).
 *   4. Default — `cleaned-planner` on desktop, `minimalist-shell` under 768px.
 *      Mobile is the priority variant, so narrow viewports default to it.
 *
 * Never throws if PostHog is absent or storage is disabled.
 */

import { useMediaQuery } from './useMediaQuery';
import { getFeatureFlag } from '@/lib/analytics';
import { safeGetRaw } from '@/lib/persist';

export const HOME_VARIANTS = [
  'landing-dashboard',
  'cleaned-planner',
  'minimalist-shell',
  'wizard-hub',
] as const;

export type HomeVariant = (typeof HOME_VARIANTS)[number];

/** localStorage key for a sticky dev override of the home variant. */
export const HOME_VARIANT_OVERRIDE_KEY = 'degreeforge:home-variant';

const MOBILE_QUERY = '(max-width: 767px)';

function isHomeVariant(value: unknown): value is HomeVariant {
  return typeof value === 'string' && (HOME_VARIANTS as readonly string[]).includes(value);
}

/** Read the `?variant=` query param without depending on the router. */
function variantFromQuery(): HomeVariant | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('variant');
  return isHomeVariant(raw) ? raw : null;
}

function variantFromOverride(): HomeVariant | null {
  const raw = safeGetRaw(HOME_VARIANT_OVERRIDE_KEY);
  return isHomeVariant(raw) ? raw : null;
}

function variantFromFlag(): HomeVariant | null {
  const flag = getFeatureFlag('home-variant');
  return isHomeVariant(flag) ? flag : null;
}

export function useHomeVariant(): HomeVariant {
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const override = variantFromQuery() ?? variantFromOverride() ?? variantFromFlag();
  if (override) return override;

  // Default: mobile is the priority variant; desktop gets the cleaned planner.
  return isMobile ? 'minimalist-shell' : 'cleaned-planner';
}
