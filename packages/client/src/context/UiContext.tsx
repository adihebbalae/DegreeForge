import React, { createContext, useContext, useState, useEffect } from 'react';
import type { OptimizeMode } from '@/lib/solver';
import { safeGetRaw, safeSetItem } from '@/lib/persist';

export type FocusLayout = 'insights' | 'add' | 'tabbed';

const FOCUS_LAYOUT_KEY = 'df:focusLayout';
const VALID_FOCUS_LAYOUTS: FocusLayout[] = ['insights', 'add', 'tabbed'];

function loadFocusLayout(): FocusLayout {
  const raw = safeGetRaw(FOCUS_LAYOUT_KEY);
  if (raw && (VALID_FOCUS_LAYOUTS as string[]).includes(raw)) {
    return raw as FocusLayout;
  }
  return 'insights';
}

interface UiContextValue {
  chatOpen: boolean;
  setChatOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  whatIfOpen: boolean;
  setWhatIfOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  focusedSemesterId: string | null;
  setFocusedSemesterId: (id: string | null) => void;
  /** Planner optimization objective for "Recommend Plan" ('fastest' default). */
  optimizeMode: OptimizeMode;
  setOptimizeMode: (v: OptimizeMode | ((prev: OptimizeMode) => OptimizeMode)) => void;
  /** Which panel layout to show in the FocusEditor right panel. Persisted. */
  focusLayout: FocusLayout;
  setFocusLayout: (v: FocusLayout) => void;
  /** True while a CourseDetailDialog is open — disables dnd-kit sensors to prevent
   *  background dragging while the user reads / selects text in the dialog. Ephemeral. */
  detailDialogOpen: boolean;
  setDetailDialogOpen: (v: boolean) => void;
  /** Transient highlight — set to a courseId to flash that chip/card for ~1.8 s, then auto-clears. */
  highlightedCourseId: string | null;
  setHighlightedCourseId: (id: string | null) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [focusedSemesterId, setFocusedSemesterId] = useState<string | null>(null);
  const [optimizeMode, setOptimizeMode] = useState<OptimizeMode>('fastest');
  const [focusLayout, setFocusLayoutRaw] = useState<FocusLayout>(loadFocusLayout);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [highlightedCourseId, setHighlightedCourseId] = useState<string | null>(null);

  // Auto-clear the highlight after ~1.8 s so it doesn't linger.
  useEffect(() => {
    if (!highlightedCourseId) return;
    const t = setTimeout(() => setHighlightedCourseId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightedCourseId]);

  const setFocusLayout = (v: FocusLayout) => {
    setFocusLayoutRaw(v);
    safeSetItem(FOCUS_LAYOUT_KEY, v);
  };

  return (
    <UiContext.Provider value={{
      chatOpen, setChatOpen,
      whatIfOpen, setWhatIfOpen,
      paletteOpen, setPaletteOpen,
      commandPaletteOpen, setCommandPaletteOpen,
      focusedSemesterId, setFocusedSemesterId,
      optimizeMode, setOptimizeMode,
      focusLayout, setFocusLayout,
      detailDialogOpen, setDetailDialogOpen,
      highlightedCourseId, setHighlightedCourseId,
    }}>
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within a UiProvider');
  return ctx;
}
