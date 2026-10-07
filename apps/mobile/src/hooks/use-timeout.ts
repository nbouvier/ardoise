import { useCallback, useEffect, useRef } from 'react';

export interface Timeout {
  /** Run `callback` after `delayMs`, replacing whatever was still pending. */
  schedule: (callback: () => void, delayMs: number) => void;
  /** Drop the pending callback, if any. */
  clear: () => void;
}

/**
 * One pending `setTimeout` owned by a component: scheduling again replaces it,
 * and it is cleared on unmount so it never fires into a screen that is gone.
 */
export function useTimeout(): Timeout {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
  }, []);

  const schedule = useCallback(
    (callback: () => void, delayMs: number) => {
      clear();
      pending.current = setTimeout(() => {
        pending.current = null;
        callback();
      }, delayMs);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  return { schedule, clear };
}
