/**
 * persist.ts — Theme A persistence seam
 *
 * The ONLY module that touches window.localStorage. It closes two latent
 * data-loss bugs that came from every provider hand-rolling its own read/write:
 *
 *   1. WHITE-SCREEN ON QUOTA. `localStorage.setItem` throws synchronously on
 *      QuotaExceededError / disabled storage. Because the writes lived in a
 *      commit-phase `useEffect`, that throw is uncatchable by render-only error
 *      boundaries and blanks the app. `safeSetItem` swallows it and raises a
 *      non-fatal "changes not saved" signal instead.
 *
 *   2. SILENT PLAN WIPE. Every loader collapsed "absent" (first run — fine) and
 *      "present-but-invalid" (Zod rejected the stored blob) into the same
 *      default-return, so one schema-incompatible field silently wiped the user's
 *      only saved copy, which the next persist made irreversible. `safeGetItem`
 *      distinguishes them: on `corrupt` it preserves the raw blob under
 *      `${key}:backup` and raises a "kept a backup" signal; only `absent` defaults.
 *
 * The server's cache.json has the same swallow-and-reset shape (audit P4) — noted
 * there, deferred to Brief 2.
 */

import { useSyncExternalStore } from 'react';

export type LoadResult<T> =
  | { status: 'ok'; value: T; raw: string }
  | { status: 'absent'; value: null; raw: null }
  | { status: 'corrupt'; value: null; raw: string };

// ─── Non-fatal health signal (surfaced by <PersistBanner/>) ───────────────────

export interface PersistHealth {
  /** A write failed (quota exceeded / storage disabled) — changes are not saved. */
  writeFailed: boolean;
  /** Storage keys whose stored value was corrupt and was preserved as a backup. */
  backedUpKeys: string[];
}

let health: PersistHealth = { writeFailed: false, backedUpKeys: [] };
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getHealth(): PersistHealth {
  return health;
}

function markWriteFailed(): void {
  if (health.writeFailed) return;
  health = { ...health, writeFailed: true };
  emit();
}

function markBackedUp(key: string): void {
  if (health.backedUpKeys.includes(key)) return;
  health = { ...health, backedUpKeys: [...health.backedUpKeys, key] };
  emit();
}

/**
 * Subscribe a component to persistence health. The returned object is stable
 * between events, so it is safe to use directly in render / effect deps.
 */
export function usePersistHealth(): PersistHealth {
  return useSyncExternalStore(subscribe, getHealth, getHealth);
}

/** Test-only: clear the module health latch between cases. */
export function _resetPersistHealth(): void {
  health = { writeFailed: false, backedUpKeys: [] };
  emit();
}

// ─── Guarded primitives ───────────────────────────────────────────────────────

/** Read a raw string. Returns null if the key is absent OR storage is unavailable. */
export function safeGetRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage disabled (Safari private mode, blocked cookies, etc.) — treat as absent.
    return null;
  }
}

/**
 * Write a string. Never throws. Returns true on success; on failure (quota /
 * disabled storage) raises the non-fatal "changes not saved" signal and returns false.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    markWriteFailed();
    console.warn(`[persist] write to "${key}" failed (changes not saved):`, e);
    return false;
  }
}

/** Remove a key. Never throws. */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

/**
 * Load + validate a persisted JSON slice via `parse`, distinguishing absent from
 * corrupt. `parse` receives the raw string and returns the validated value, or
 * null when the content is unusable. On `corrupt`, the raw blob is preserved
 * under `${key}:backup` (never clobbering an earlier backup) and a health signal
 * is raised so the UI can tell the user their data was kept.
 */
export function safeGetItem<T>(key: string, parse: (raw: string) => T | null): LoadResult<T> {
  const raw = safeGetRaw(key);
  if (raw === null) return { status: 'absent', value: null, raw: null };

  const value = parse(raw);
  if (value === null) {
    backupCorrupt(key, raw);
    return { status: 'corrupt', value: null, raw };
  }
  return { status: 'ok', value, raw };
}

function backupCorrupt(key: string, raw: string): void {
  const backupKey = `${key}:backup`;
  // Preserve the FIRST corruption — it is the most valuable. Don't clobber it.
  if (safeGetRaw(backupKey) === null) {
    safeSetItem(backupKey, raw);
  }
  markBackedUp(key);
}

/**
 * Adapt a value-validator (`unknown → T | null`, e.g. a Zod `parseX`) into the
 * raw-string parser `safeGetItem` expects, guarding `JSON.parse` so malformed
 * JSON reads as `corrupt` rather than throwing.
 */
export function fromJson<T>(validate: (parsed: unknown) => T | null): (raw: string) => T | null {
  return (raw: string): T | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return validate(parsed);
  };
}
