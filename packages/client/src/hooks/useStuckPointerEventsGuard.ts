import { useEffect } from 'react';
import { clearStuckPointerEvents } from '@/lib/stuck-pointer-events-guard';

/**
 * useStuckPointerEventsGuard — mounts once high in the tree (Layout) to recover
 * from the Radix "orphaned `pointer-events: none` on <body>" freeze (TASK-080).
 *
 * Watches <body>'s `style` attribute. Whenever it changes, it checks (on the next
 * frame, so Radix's own close/cleanup has settled) whether body is stuck with
 * `pointer-events: none` while NO overlay is open, and clears it if so. The
 * next-frame defer is what prevents us from racing a legitimate open transition.
 */
export function useStuckPointerEventsGuard(): void {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }

    let rafId = 0;
    const check = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => clearStuckPointerEvents(document));
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    // Run once on mount in case we hydrate into an already-stuck state.
    check();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);
}
