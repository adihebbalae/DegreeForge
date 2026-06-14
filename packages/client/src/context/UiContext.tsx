import React, { createContext, useContext, useState } from 'react';
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
