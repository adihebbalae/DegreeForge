import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useDegreeRequirements,
  useTechCoresRecord,
  useMathRequirements,
  usePrereqGraph as useRawPrereqGraph,
  useOfferingSchedule,
} from '@/context/DataContext';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import { usePlanDispatch, useTechCoreId, useMathBAToggle, useSemesters, usePlan } from '@/context/PlanContext';
import { generateAutoPlan } from '@/lib/auto-planner';
import { sanitizePlan } from '@/lib/sanitize-course-list';
import type { NoticeProps } from '@/components/ui/notice';
import type { ConfirmDialogProps } from '@/components/ui/confirm-dialog';

export interface RecommendPlanResult {
  handleRecommendPlan: () => void
  noticeProps: NoticeProps | null
  confirmProps: Omit<ConfirmDialogProps, 'open' | 'onOpenChange'> & { open: boolean; onOpenChange: (v: boolean) => void } | null
}

export function useRecommendPlan(): RecommendPlanResult {
  const userProfile = useEffectiveProfile();
  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();
  const semesters = useSemesters();
  const plan = usePlan();
  const rawPrereqGraph = useRawPrereqGraph();
  const prereqGraphInstance = usePrereqGraph();
  const offeringSchedule = useOfferingSchedule();
  const dispatch = usePlanDispatch();
  const navigate = useNavigate();

  const [noticeProps, setNoticeProps] = useState<NoticeProps | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);

  // Compute live future-course count for confirm copy
  const { futureCourseCount, futureSemCount } = useMemo(() => {
    const futureSems = semesters.filter(s => s.status === 'future');
    const courses = futureSems.reduce((sum, s) => sum + (plan[s.id]?.length ?? 0), 0);
    return { futureCourseCount: courses, futureSemCount: futureSems.length };
  }, [semesters, plan]);

  const runPlan = () => {
    const techCore = techCores?.[techCoreId];
    if (!techCore) {
      setNoticeProps({
        variant: 'info',
        message: `Tech core "${techCoreId}" is not recognised. Select a valid tech core in Settings.`,
        action: { label: 'Go to Settings', onClick: () => { navigate('/settings'); setNoticeProps(null); } },
      });
      return;
    }

    const result = generateAutoPlan({
      prereqGraph: prereqGraphInstance,
      prereqNodes: rawPrereqGraph?.nodes ?? {},
      offeringSchedule,
      userProfile: userProfile!,
      degreeReqs: degreeReqs!,
      techCore,
      mathReqs: mathReqs!,
      mathBAToggle,
      semesters,
      currentPlan: plan,
    });

    // Layer A: sanitize solver output before dispatching so invalid tokens
    // are surfaced to the user here and never enter plan state silently.
    const { safePlan, dropped } = sanitizePlan(result.plan as Record<string, unknown[]>);
    dispatch({ type: 'SET_PLAN', plan: safePlan });

    const msgs: string[] = [];
    const allUnplaced = [...result.unplacedCourses, ...dropped.filter((t) => t !== null && t !== undefined)];
    if (allUnplaced.length > 0) {
      msgs.push(`${allUnplaced.length} course${allUnplaced.length === 1 ? '' : 's'} could not be placed: ${allUnplaced.join(', ')}`);
    }
    if (result.warnings.length > 0) {
      msgs.push(result.warnings.join(' — '));
    }
    if (msgs.length > 0) {
      setNoticeProps({
        variant: 'info',
        message: msgs.join(' | '),
        action: { label: 'Dismiss', onClick: () => setNoticeProps(null) },
      });
    }
  };

  const handleRecommendPlan = () => {
    if (!userProfile || !degreeReqs || !techCores || !mathReqs) {
      setNoticeProps({
        variant: 'info',
        message: 'Course data is still loading. Wait a moment and try again.',
        action: { label: 'Dismiss', onClick: () => setNoticeProps(null) },
      });
      return;
    }

    const futureHasContent = semesters.some(
      s => s.status === 'future' && (plan[s.id] ?? []).length > 0
    );

    if (futureHasContent) {
      setPendingRun(true);
      setConfirmOpen(true);
      return;
    }

    runPlan();
  };

  const confirmProps = pendingRun
    ? {
        open: confirmOpen,
        onOpenChange: (v: boolean) => {
          setConfirmOpen(v);
          if (!v) setPendingRun(false);
        },
        title: 'Replace future semesters with recommended plan',
        consequence: futureCourseCount > 0
          ? `Replaces ${futureCourseCount} unpinned course${futureCourseCount === 1 ? '' : 's'} across ${futureSemCount} future semester${futureSemCount === 1 ? '' : 's'}.`
          : `Fills ${futureSemCount} future semester${futureSemCount === 1 ? '' : 's'} with recommended courses.`,
        confirmLabel: 'Generate Plan',
        onConfirm: () => {
          setPendingRun(false);
          runPlan();
        },
        destructive: false,
      }
    : null;

  return { handleRecommendPlan, noticeProps, confirmProps };
}
