/**
 * stuck-pointer-events-guard — belt-and-suspenders fix for the Radix
 * "orphaned `pointer-events: none` on <body>" race (TASK-080, BUG 1).
 *
 * Radix modal layers (DropdownMenu, Dialog) set `document.body.style.pointerEvents
 * = 'none'` while open and clear it on close. When a menu item opens a dialog as
 * the menu is unmounting, the menu's cleanup can race the dialog's scroll-lock and
 * leave the inline style stuck with NO overlay open — every click is then swallowed
 * by the body and the page appears frozen.
 *
 * `clearStuckPointerEvents` is the pure core: if body has an inline
 * `pointer-events: none` AND there is no open Radix overlay in the DOM, it clears
 * the stuck inline value. It MUST NEVER clear while a legit overlay is open.
 */

/**
 * Selectors that indicate a legitimately-open Radix overlay. If any of these match,
 * the `pointer-events: none` on <body> is intentional and must be left alone.
 */
const OPEN_OVERLAY_SELECTORS = [
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-radix-menu-content][data-state="open"]',
].join(',');

/** Minimal surface of `document` this guard needs — keeps the core unit-testable. */
export interface PointerEventsGuardDocument {
  body: { style: { pointerEvents: string } };
  querySelector(selectors: string): unknown;
}

/**
 * If <body> has a stuck inline `pointer-events: none` and no Radix overlay is open,
 * clear the inline value so the page is interactive again.
 *
 * @returns true if a stuck value was cleared, false otherwise.
 */
export function clearStuckPointerEvents(doc: PointerEventsGuardDocument): boolean {
  // Only act on the exact stuck signature Radix leaves behind.
  if (doc.body.style.pointerEvents !== 'none') return false;

  // A real overlay is open → the lock is legitimate, leave it.
  if (doc.querySelector(OPEN_OVERLAY_SELECTORS) !== null) return false;

  doc.body.style.pointerEvents = '';
  return true;
}
