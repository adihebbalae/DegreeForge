import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { parseSettingsState } from '../lib/plan-schema';
import { DEFAULT_ENABLED_TOOLS } from '../lib/agent-tools/registry';

// ─── Settings State Shape ─────────────────────────────────────────────────────

export type LoadTolerance = 'light' | 'normal' | 'above_average' | 'heavy';
export type InstructionMode = 'in_person' | 'online' | 'hybrid' | 'no_preference';
export type TimeWindow = 'no_early' | 'no_late' | 'mornings_only' | 'afternoons_only' | 'no_preference';

export interface SchedulerWeights {
  gpa: number;           // 0–1
  timeFit: number;       // 0–1
  buildingPenalty: number; // 0–1
  instructionMode: number; // 0–1
  professorPreference: number; // 0–1
  daySpread: number;     // 0–1
}

export interface ProfPreference {
  name: string;
  type: 'prefer' | 'avoid';
}

export type ChatProvider = 'ollama' | 'claude';

export interface SettingsState {
  loadTolerance: LoadTolerance;
  gradTarget: string;           // e.g. "Spring 2029"
  techCoreId: string;           // e.g. "computer_architecture"
  mathBAToggle: boolean;
  schedulerWeights: SchedulerWeights;
  timeWindow: TimeWindow;
  instructionMode: InstructionMode;
  profPreferences: ProfPreference[];
  paletteSortMode: 'recommended' | 'easiest';
  /** Tool names currently enabled for the chat agent. */
  enabledTools: string[];
  /** Which LLM backend the chat advisor uses. */
  chatProvider: ChatProvider;
  /** Invite-beta access code sent as x-access-code header to the server. Empty in local dev. */
  accessCode: string;
}

// ─── Default Settings ─────────────────────────────────────────────────────────

/** Lazily computed so registry import is not a circular dep risk. */
const DEFAULT_ENABLED_TOOL_NAMES = DEFAULT_ENABLED_TOOLS.map(t => t.name);

export const DEFAULT_SETTINGS: SettingsState = {
  loadTolerance: 'above_average',
  gradTarget: 'Spring 2029',
  techCoreId: 'computer_architecture',
  mathBAToggle: false,
  schedulerWeights: {
    gpa: 0.35,
    timeFit: 0.20,
    buildingPenalty: 0.10,
    instructionMode: 0.15,
    professorPreference: 0.15,
    daySpread: 0.05,
  },
  timeWindow: 'no_preference',
  instructionMode: 'no_preference',
  profPreferences: [],
  paletteSortMode: 'recommended',
  enabledTools: DEFAULT_ENABLED_TOOL_NAMES,
  chatProvider: 'claude',
  accessCode: '',
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type SettingsAction =
  | { type: 'SET_LOAD_TOLERANCE'; value: LoadTolerance }
  | { type: 'SET_GRAD_TARGET'; value: string }
  | { type: 'SET_TECH_CORE'; value: string }
  | { type: 'SET_MATH_BA'; value: boolean }
  | { type: 'SET_SCHEDULER_WEIGHTS'; weights: Partial<SchedulerWeights> }
  | { type: 'SET_TIME_WINDOWS'; value: TimeWindow }
  | { type: 'SET_INSTRUCTION_MODE'; value: InstructionMode }
  | { type: 'ADD_PROF_PREFERENCE'; pref: ProfPreference }
  | { type: 'REMOVE_PROF_PREFERENCE'; name: string }
  | { type: 'SET_PALETTE_SORT'; value: 'recommended' | 'easiest' }
  | { type: 'TOGGLE_TOOL'; toolName: string }
  | { type: 'SET_CHAT_PROVIDER'; value: ChatProvider }
  | { type: 'SET_ACCESS_CODE'; value: string }
  | { type: 'RESET_SETTINGS' }
  | { type: 'SET_FULL_SETTINGS'; settings: SettingsState };

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'SET_LOAD_TOLERANCE':
      return { ...state, loadTolerance: action.value };
    case 'SET_GRAD_TARGET':
      return { ...state, gradTarget: action.value };
    case 'SET_TECH_CORE':
      return { ...state, techCoreId: action.value };
    case 'SET_MATH_BA':
      return { ...state, mathBAToggle: action.value };
    case 'SET_SCHEDULER_WEIGHTS':
      return {
        ...state,
        schedulerWeights: { ...state.schedulerWeights, ...action.weights },
      };
    case 'SET_TIME_WINDOWS':
      return { ...state, timeWindow: action.value };
    case 'SET_INSTRUCTION_MODE':
      return { ...state, instructionMode: action.value };
    case 'ADD_PROF_PREFERENCE': {
      // Replace if same name exists, otherwise append
      const without = state.profPreferences.filter((p) => p.name !== action.pref.name);
      return { ...state, profPreferences: [...without, action.pref] };
    }
    case 'REMOVE_PROF_PREFERENCE':
      return {
        ...state,
        profPreferences: state.profPreferences.filter((p) => p.name !== action.name),
      };
    case 'SET_PALETTE_SORT':
      return { ...state, paletteSortMode: action.value };
    case 'TOGGLE_TOOL': {
      const already = state.enabledTools.includes(action.toolName);
      return {
        ...state,
        enabledTools: already
          ? state.enabledTools.filter(n => n !== action.toolName)
          : [...state.enabledTools, action.toolName],
      };
    }
    case 'SET_CHAT_PROVIDER':
      return { ...state, chatProvider: action.value };
    case 'SET_ACCESS_CODE':
      return { ...state, accessCode: action.value };
    case 'RESET_SETTINGS':
      return { ...DEFAULT_SETTINGS };
    case 'SET_FULL_SETTINGS':
      return { ...action.settings };
    default:
      return state;
  }
}

// ─── Context Shape ────────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SETTINGS_STORAGE_KEY = 'degreeforge:settings:v1';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, dispatch] = useReducer(settingsReducer, DEFAULT_SETTINGS, (initial) => {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = parseSettingsState(JSON.parse(stored));
        if (parsed) return parsed;
      } catch {
        // Corrupted storage — fall back to defaults silently
      }
    }
    return initial;
  });

  // Persist settings to localStorage on every change
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, dispatch }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be called inside <SettingsProvider>.');
  return ctx.settings;
}

export function useSettingsDispatch(): React.Dispatch<SettingsAction> {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsDispatch must be called inside <SettingsProvider>.');
  return ctx.dispatch;
}
