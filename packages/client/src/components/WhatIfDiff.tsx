import { useUserProfile, useTechCoresRecord } from '@/context/DataContext';
import { useTechCoreId, useMathBAToggle } from '@/context/PlanContext';

export default function WhatIfDiff() {
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();

  if (!profile || !techCores) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  const declaredNormalized = normalize(profile.tech_core.declared);
  const originalTrackId = Object.keys(techCores).find(
    (key) => normalize(techCores[key].name) === declaredNormalized
  ) || 'computer_architecture';

  const isChanged = techCoreId !== originalTrackId || mathBAToggle;

  if (!isChanged) return null;

  const newTrack = techCores[techCoreId];

  return (
    <div className="mx-2 mb-3 p-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-md">
      <p className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-tight mb-1">
        What-If Active
      </p>
      <div className="space-y-1">
        {techCoreId !== originalTrackId && (
          <p className="text-[11px] text-foreground leading-tight">
            • Using <span className="font-semibold">{newTrack?.name}</span> track
          </p>
        )}
        {mathBAToggle && (
          <p className="text-[11px] text-foreground leading-tight">
            • <span className="font-semibold">Math BA</span> requirements active
          </p>
        )}
      </div>
    </div>
  );
}
