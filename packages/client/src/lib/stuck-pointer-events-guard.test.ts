import { describe, it, expect } from 'vitest';
import {
  clearStuckPointerEvents,
  type PointerEventsGuardDocument,
} from './stuck-pointer-events-guard';

/** Build a minimal fake document with a body style + a querySelector stub. */
function makeDoc(
  pointerEvents: string,
  overlayMatch: unknown = null,
): PointerEventsGuardDocument & { body: { style: { pointerEvents: string } } } {
  return {
    body: { style: { pointerEvents } },
    querySelector: () => overlayMatch,
  };
}

describe('clearStuckPointerEvents', () => {
  it('clears the stuck inline value when body is none and NO overlay is open', () => {
    const doc = makeDoc('none', null);
    const cleared = clearStuckPointerEvents(doc);
    expect(cleared).toBe(true);
    expect(doc.body.style.pointerEvents).toBe('');
  });

  it('leaves body alone when none but an overlay IS open (legit lock)', () => {
    const fakeOverlay = {}; // any truthy element => overlay open
    const doc = makeDoc('none', fakeOverlay);
    const cleared = clearStuckPointerEvents(doc);
    expect(cleared).toBe(false);
    expect(doc.body.style.pointerEvents).toBe('none');
  });

  it('does nothing when body has no inline pointer-events lock', () => {
    const doc = makeDoc('', null);
    const cleared = clearStuckPointerEvents(doc);
    expect(cleared).toBe(false);
    expect(doc.body.style.pointerEvents).toBe('');
  });

  it('does not touch a non-none inline value (e.g. auto)', () => {
    const doc = makeDoc('auto', null);
    const cleared = clearStuckPointerEvents(doc);
    expect(cleared).toBe(false);
    expect(doc.body.style.pointerEvents).toBe('auto');
  });
});
