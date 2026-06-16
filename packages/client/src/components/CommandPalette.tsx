/**
 * CommandPalette — Cmd/Ctrl+K modal to search the course catalog and add a
 * course to a user-selected semester without leaving the keyboard.
 *
 * Open:  Cmd+K | Ctrl+K | Ctrl+Space
 * Close: Esc | clicking backdrop
 * Nav:   ↑/↓ arrows move highlight, Enter adds the highlighted course
 *
 * Target semester resolution:
 *  1. If focusedSemesterId is set AND non-past → pre-select it.
 *  2. Otherwise → default to the earliest non-past FUTURE semester.
 *  3. If no future exists → fall back to the current semester.
 *  4. If only past semesters exist → show an inline hint and block the add.
 *
 * The target is shown as a small native <select> in the search bar so the
 * user can change it before adding. Arrow keys inside the <select> are
 * handled by the browser natively and do NOT propagate to the course list.
 *
 * After a successful add the course is dispatched (ADD_COURSE) and
 * focusedSemesterId is set to the target so the user sees the result in
 * FocusEditor.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { Search, PlusCircle } from 'lucide-react';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useUserProfile,
} from '@/context/DataContext';
import { usePlan, useSemesters, usePlanDispatch } from '@/context/PlanContext';
import { isPastSemester } from '@/lib/sanitize-course-list';
import { useUi } from '@/context/UiContext';
import { track } from '@/lib/analytics';
import { getCourseTitle, inferCategory, CATEGORY_TEXT, CATEGORY_BORDER_COLOR } from '@/lib/course-utils';
import { isCourseSatisfied } from '@/lib/palette-courses';
import type { CourseCategory } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseMatch {
  id: string;
  title: string;
  category: CourseCategory;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Category badge label */
const CATEGORY_LABEL: Record<CourseCategory, string> = {
  ece_core: 'ECE Core',
  tech_core: 'Tech Core',
  gen_ed: 'Gen Ed',
  elective: 'Elective',
  math: 'Math',
};

/**
 * Derives the default selected target from the available non-past semesters.
 * Priority: focused (if non-past) → earliest future → current → null.
 */
function deriveDefaultTarget(
  focusedSemesterId: string | null,
  semesters: { id: string; status: 'past' | 'current' | 'future' }[]
): string | null {
  const nonPast = semesters.filter((s) => s.status !== 'past');
  if (nonPast.length === 0) return null;

  if (focusedSemesterId && nonPast.some((s) => s.id === focusedSemesterId)) {
    return focusedSemesterId;
  }

  const firstFuture = nonPast.find((s) => s.status === 'future');
  if (firstFuture) return firstFuture.id;

  const current = nonPast.find((s) => s.status === 'current');
  return current?.id ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const MAX_RESULTS = 20;

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, focusedSemesterId, setFocusedSemesterId } =
    useUi();

  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Data hooks
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const userProfile = useUserProfile();
  const plan = usePlan();
  const semesters = useSemesters();
  const dispatch = usePlanDispatch();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** Element that had focus when the palette opened — restored on close. */
  const prevFocusRef = useRef<Element | null>(null);

  // ── Non-past semesters available as add targets ────────────────────────────
  const nonPastSemesters = useMemo(
    () => semesters.filter((s) => s.status !== 'past'),
    [semesters]
  );

  // ── Selected target semester (user-controlled) ────────────────────────────
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(
    () => deriveDefaultTarget(focusedSemesterId, semesters)
  );

  // Re-derive default whenever the palette opens or focusedSemesterId changes.
  useEffect(() => {
    if (commandPaletteOpen) {
      setSelectedTargetId(deriveDefaultTarget(focusedSemesterId, semesters));
    }
  // semesters is stable across palette open/close; focusedSemesterId is the
  // trigger that changes meaningfully between opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandPaletteOpen, focusedSemesterId]);

  const targetLabel = useMemo<string>(() => {
    if (!selectedTargetId) return '';
    const sem = semesters.find((s) => s.id === selectedTargetId);
    return sem?.label ?? selectedTargetId;
  }, [selectedTargetId, semesters]);

  // ── Excluded set: already satisfied or placed ──────────────────────────────
  const excludedSet = useMemo(() => {
    const placed = new Set<string>(Object.values(plan).flat());
    const completed = new Set<string>(
      (userProfile?.completed_courses ?? []).map((c) => c.course)
    );
    const inProgress = new Set<string>(
      (userProfile?.in_progress_courses ?? []).map((c) => c.course)
    );
    return new Set([...placed, ...completed, ...inProgress]);
  }, [plan, userProfile]);

  // ── Filtered result list ───────────────────────────────────────────────────
  const results = useMemo<CourseMatch[]>(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const prereqNodes = rawPrereqGraph?.nodes ?? {};

    const matches: CourseMatch[] = [];
    for (const [id, course] of Object.entries(catalog)) {
      // Skip courses already placed / completed / in-progress
      if (isCourseSatisfied(id, excludedSet)) continue;

      if (q) {
        const codeMatch = id.toLowerCase().includes(q);
        const titleMatch = course.title.toLowerCase().includes(q);
        if (!codeMatch && !titleMatch) continue;
      }

      matches.push({
        id,
        title: getCourseTitle(id, catalog, prereqNodes),
        category: inferCategory(id, prereqNodes),
      });

      if (matches.length >= MAX_RESULTS) break;
    }
    return matches;
  }, [catalog, rawPrereqGraph, query, excludedSet]);

  // ── Reset highlight when results change ───────────────────────────────────
  useEffect(() => {
    setHighlightedIdx(0);
  }, [results]);

  // ── Open/close side effects ───────────────────────────────────────────────
  useEffect(() => {
    if (commandPaletteOpen) {
      prevFocusRef.current = document.activeElement;
      setQuery('');
      setFeedbackMsg(null);
      // Defer focus so the modal is mounted first
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // Restore focus to previous element
      if (prevFocusRef.current && prevFocusRef.current instanceof HTMLElement) {
        prevFocusRef.current.focus();
      }
    }
  }, [commandPaletteOpen]);

  // ── Keep highlighted row in viewport ─────────────────────────────────────
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlightedIdx] as HTMLElement | undefined;
    // scrollIntoView is not available in jsdom; guard for test environments
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIdx]);

  // ── Add action ────────────────────────────────────────────────────────────
  const handleAdd = useCallback(
    (courseId: string) => {
      if (!selectedTargetId) {
        setFeedbackMsg('No current or focused semester to add to.');
        return;
      }
      // UI affordance: inform user when target is a past term.
      // The reducer enforces the invariant (isPastSemester guard) and will silently
      // reject the dispatch — this message just makes the rejection visible.
      if (isPastSemester(selectedTargetId, semesters)) {
        setFeedbackMsg(`Cannot add to ${targetLabel} — it's already past.`);
        return;
      }
      dispatch({ type: 'ADD_COURSE', semesterId: selectedTargetId, courseId });
      track('course_added', { via: 'palette' });
      setFocusedSemesterId(selectedTargetId);
      setCommandPaletteOpen(false);
    },
    [selectedTargetId, semesters, targetLabel, dispatch, setFocusedSemesterId, setCommandPaletteOpen]
  );

  // ── Keyboard handler inside the palette ───────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Let the native <select> handle its own arrow keys — don't intercept
      // events that originate from the semester selector.
      if ((e.target as HTMLElement).tagName === 'SELECT') return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIdx((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results.length > 0) {
            handleAdd(results[highlightedIdx]?.id ?? results[0].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setCommandPaletteOpen(false);
          break;
        default:
          break;
      }
    },
    [results, highlightedIdx, handleAdd, setCommandPaletteOpen]
  );

  // ── Backdrop click ────────────────────────────────────────────────────────
  const handleBackdropClick = useCallback(() => {
    setCommandPaletteOpen(false);
  }, [setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      {/* Modal — stop propagation so clicks inside don't dismiss */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add course to semester"
        className={[
          'relative w-full max-w-xl mx-4',
          'bg-background border border-border rounded-lg shadow-xl',
          'flex flex-col overflow-hidden',
          'max-h-[min(480px,80vh)]', // height-capped; fits 575px viewport
        ].join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search course code or title…"
            aria-label="Search courses"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-activedescendant={
              results.length > 0 ? `cpr-${results[highlightedIdx]?.id}` : undefined
            }
            className={[
              'flex-1 bg-transparent text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none',
            ].join(' ')}
          />

          {/* Target semester selector */}
          {nonPastSemesters.length > 0 && (
            <select
              aria-label="Target semester"
              value={selectedTargetId ?? ''}
              onChange={(e) => {
                setSelectedTargetId(e.target.value || null);
                setFeedbackMsg(null);
              }}
              className={[
                'text-[11px] text-muted-foreground bg-transparent',
                'border border-border rounded px-1 py-0.5',
                'focus:outline-none focus:ring-1 focus:ring-ring',
                'cursor-pointer shrink-0 hidden sm:block',
              ].join(' ')}
            >
              {nonPastSemesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}

          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5 shrink-0">
            esc
          </kbd>
        </div>

        {/* Results list */}
        <ul
          id="command-palette-results"
          ref={listRef}
          role="listbox"
          aria-label="Course results"
          className="flex-1 overflow-y-auto"
        >
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground" role="option" aria-selected={false}>
              {query.trim() ? 'No courses match your search.' : 'All courses are already in your plan.'}
            </li>
          )}

          {results.map((course, idx) => {
            const isHighlighted = idx === highlightedIdx;
            return (
              <li
                key={course.id}
                id={`cpr-${course.id}`}
                role="option"
                aria-selected={isHighlighted}
                className={[
                  'flex items-center gap-3 px-3 py-2 cursor-pointer select-none',
                  'border-l-4',
                  CATEGORY_BORDER_COLOR[course.category],
                  isHighlighted
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/50',
                ].join(' ')}
                onMouseEnter={() => setHighlightedIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur before add
                  handleAdd(course.id);
                }}
              >
                {/* Left border accent is part of the className above (border-l-4) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium tabular-nums shrink-0">
                      {course.id}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {course.title}
                    </span>
                  </div>
                </div>

                <span
                  className={[
                    'text-[10px] font-medium shrink-0',
                    CATEGORY_TEXT[course.category],
                  ].join(' ')}
                >
                  {CATEGORY_LABEL[course.category]}
                </span>

                {isHighlighted && (
                  <PlusCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
              </li>
            );
          })}
        </ul>

        {/* Footer: feedback message or shortcut hint */}
        <div className="px-3 py-1.5 border-t border-border shrink-0 flex items-center justify-between">
          {feedbackMsg ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{feedbackMsg}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              <kbd className="border border-border rounded px-1">↑↓</kbd> navigate
              {' · '}
              <kbd className="border border-border rounded px-1">↵</kbd> add to {targetLabel || 'semester'}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
