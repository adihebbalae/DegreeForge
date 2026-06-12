// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  safeGetRaw,
  safeSetItem,
  safeRemoveItem,
  safeGetItem,
  fromJson,
  usePersistHealth,
  _resetPersistHealth,
} from './persist';

beforeEach(() => {
  localStorage.clear();
  _resetPersistHealth();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('safeGetRaw', () => {
  it('returns the stored string, or null when absent', () => {
    localStorage.setItem('k', 'hello');
    expect(safeGetRaw('k')).toBe('hello');
    expect(safeGetRaw('missing')).toBeNull();
  });

  it('returns null (treats as absent) when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(safeGetRaw('k')).toBeNull();
  });
});

describe('safeSetItem', () => {
  it('writes and returns true on success', () => {
    expect(safeSetItem('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('returns false and never throws on quota / disabled storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    let result: boolean | undefined;
    expect(() => {
      result = safeSetItem('k', 'v');
    }).not.toThrow();
    expect(result).toBe(false);
  });
});

describe('safeRemoveItem', () => {
  it('removes a key without throwing even when storage is unavailable', () => {
    localStorage.setItem('k', 'v');
    safeRemoveItem('k');
    expect(localStorage.getItem('k')).toBeNull();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(() => safeRemoveItem('k')).not.toThrow();
  });
});

describe('safeGetItem', () => {
  const parseObj = fromJson<{ n: number }>((raw) =>
    raw && typeof (raw as { n?: unknown }).n === 'number' ? (raw as { n: number }) : null
  );

  it('reports absent for a missing key and never writes a backup', () => {
    const result = safeGetItem('missing', parseObj);
    expect(result.status).toBe('absent');
    expect(result.value).toBeNull();
    expect(localStorage.getItem('missing:backup')).toBeNull();
  });

  it('reports ok and returns the parsed value for valid stored JSON', () => {
    localStorage.setItem('k', JSON.stringify({ n: 7 }));
    const result = safeGetItem('k', parseObj);
    expect(result.status).toBe('ok');
    expect(result.value).toEqual({ n: 7 });
  });

  it('reports corrupt for malformed JSON and preserves the raw blob as a backup', () => {
    localStorage.setItem('k', '{not json');
    const result = safeGetItem('k', parseObj);
    expect(result.status).toBe('corrupt');
    expect(result.value).toBeNull();
    expect(localStorage.getItem('k:backup')).toBe('{not json');
  });

  it('reports corrupt when the validator rejects the parsed value', () => {
    localStorage.setItem('k', JSON.stringify({ n: 'not-a-number' }));
    const result = safeGetItem('k', parseObj);
    expect(result.status).toBe('corrupt');
    expect(localStorage.getItem('k:backup')).toBe(JSON.stringify({ n: 'not-a-number' }));
  });

  it('does not clobber an earlier backup on a second corruption', () => {
    localStorage.setItem('k:backup', 'FIRST');
    localStorage.setItem('k', 'SECOND-corrupt');
    safeGetItem('k', parseObj);
    expect(localStorage.getItem('k:backup')).toBe('FIRST');
  });
});

describe('usePersistHealth', () => {
  it('flips writeFailed after a failed write', () => {
    const { result } = renderHook(() => usePersistHealth());
    expect(result.current.writeFailed).toBe(false);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    act(() => {
      safeSetItem('k', 'v');
    });
    expect(result.current.writeFailed).toBe(true);
  });

  it('records a backed-up key after a corrupt read', () => {
    localStorage.setItem('k', '{not json');
    const { result } = renderHook(() => usePersistHealth());
    expect(result.current.backedUpKeys).toEqual([]);

    act(() => {
      safeGetItem('k', fromJson(() => null));
    });
    expect(result.current.backedUpKeys).toContain('k');
  });
});
