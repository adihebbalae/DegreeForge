import { useState } from 'react';
import { Notice } from '@/components/ui/notice';
import { usePersistHealth } from '@/lib/persist';

/**
 * Non-blocking banner surfacing the two persistence failure modes the seam
 * (lib/persist.ts) detects:
 *   - writeFailed: a localStorage write was rejected (quota full / storage
 *     disabled), so the user's recent edits are not being saved.
 *   - backedUpKeys: a stored slice was corrupt; the seam kept the raw blob as a
 *     backup and loaded defaults, rather than silently wiping it.
 *
 * Render-only and dismissible — it never blocks interaction.
 */
export function PersistBanner() {
  const health = usePersistHealth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!health.writeFailed && health.backedUpKeys.length === 0) return null;

  // writeFailed is the more urgent (ongoing data loss) so it wins the slot.
  const isWriteFailure = health.writeFailed;
  const message = isWriteFailure
    ? 'Browser storage is full or unavailable, so recent changes are not being saved.'
    : 'A saved item could not be read; it was kept as a backup and defaults were loaded.';

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,42rem)] -translate-x-1/2">
      <Notice
        variant={isWriteFailure ? 'error' : 'warn'}
        message={message}
        onDismiss={() => setDismissed(true)}
      />
    </div>
  );
}
