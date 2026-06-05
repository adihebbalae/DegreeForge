import React, { createContext, useContext, useState } from 'react';

interface UiContextValue {
  chatOpen: boolean;
  setChatOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  whatIfOpen: boolean;
  setWhatIfOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  return (
    <UiContext.Provider value={{ chatOpen, setChatOpen, whatIfOpen, setWhatIfOpen }}>
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within a UiProvider');
  return ctx;
}
