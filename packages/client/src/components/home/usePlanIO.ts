/**
 * usePlanIO — export/import a DegreeForge plan bundle (v2: { version, plan, profile }).
 *
 * The minimalist shell can't reuse Header's inline export/import (Header is owned
 * elsewhere and not editable from this variant), so this hook re-implements the
 * same v2 bundle format and the same import validation/sanitization pipeline used
 * by Header. Keeping the format identical means a file exported from either
 * surface imports cleanly into the other.
 */

import { useCallback, useRef, useState } from 'react';
import { usePlanContext, usePlanDispatch } from '@/context/PlanContext';
import { useOwnedProfile, useProfileDispatch } from '@/context/ProfileContext';
import { parsePlanState } from '@/lib/plan-schema';
import { parseProfileState } from '@/lib/profile-schema';
import { sanitizePlan } from '@/lib/sanitize-course-list';
import { track } from '@/lib/analytics';
import type { UserProfile } from '@/types';

interface ExportBundleV2 {
  version: 2;
  plan: ReturnType<typeof JSON.parse>;
  profile: UserProfile;
}

export interface PlanIO {
  /** Ref to attach to a hidden <input type="file"> that triggers import. */
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Download the current plan + profile as a JSON file. */
  exportPlan: () => void;
  /** Open the file picker (the input's onChange should call handleImportFile). */
  openImport: () => void;
  /** onChange handler for the hidden file input. */
  handleImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 'invalid-format' | 'parse-failed' | null — surface to the user. */
  importError: 'invalid-format' | 'parse-failed' | null;
  clearImportError: () => void;
}

export function usePlanIO(): PlanIO {
  const { state } = usePlanContext();
  const dispatch = usePlanDispatch();
  const profile = useOwnedProfile();
  const profileDispatch = useProfileDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<'invalid-format' | 'parse-failed' | null>(null);

  const exportPlan = useCallback(() => {
    const bundle: ExportBundleV2 = { version: 2, plan: state, profile };
    const dataStr = JSON.stringify(bundle, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const fileName = `degreeforge-plan-${new Date().toISOString().split('T')[0]}.json`;
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', fileName);
    link.click();
    track('plan_exported');
  }, [state, profile]);

  const openImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setImportError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const raw = JSON.parse(content) as Record<string, unknown>;
          const isV2Bundle = raw.version === 2 && raw.plan !== undefined;
          const planRaw = isV2Bundle ? raw.plan : raw;
          const validated = parsePlanState(planRaw);
          if (!validated) {
            setImportError('invalid-format');
            return;
          }
          const { safePlan } = sanitizePlan(validated.plan as Record<string, unknown[]>);
          dispatch({ type: 'SET_FULL_STATE', state: { ...validated, plan: safePlan } });
          if (isV2Bundle && raw.profile !== undefined) {
            const validatedProfile = parseProfileState(raw.profile);
            if (validatedProfile) {
              profileDispatch({ type: 'SET_PROFILE', profile: validatedProfile });
            }
          }
        } catch {
          setImportError('parse-failed');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    },
    [dispatch, profileDispatch],
  );

  const clearImportError = useCallback(() => setImportError(null), []);

  return { fileInputRef, exportPlan, openImport, handleImportFile, importError, clearImportError };
}
