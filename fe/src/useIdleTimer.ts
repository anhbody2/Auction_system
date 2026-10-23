import { useCallback, useEffect, useRef } from 'react';
import { createIdleTracker, idleSettings, type IdleTracker } from './idle';

export interface UseIdleTimerOptions {
  enabled: boolean;
  timeoutMs?: number;
  warningMs?: number;
  onWarning?: (remainingMs: number) => void;
  onIdle?: () => void;
  onActive?: () => void;
  onActivity?: (at: number) => void;
}

/**
 * sec-004 (SRS REQ-1): the React custom hook that tracks mousedown, keydown, scroll, touchstart and mousemove.
 * Runs only while `enabled` (a user is signed in); stops on unmount or when disabled. The latest callbacks are
 * used without restarting the tracker, so passing inline functions is fine. Returns a stable markActive().
 */
export function useIdleTimer({ enabled, timeoutMs, warningMs, onWarning, onIdle, onActive, onActivity }: UseIdleTimerOptions) {
  const callbacks = useRef({ onWarning, onIdle, onActive, onActivity });
  callbacks.current = { onWarning, onIdle, onActive, onActivity };
  const tracker = useRef<IdleTracker | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const defaults = idleSettings();
    const current = createIdleTracker({
      timeoutMs: timeoutMs ?? defaults.timeoutMs,
      warningMs: warningMs ?? defaults.warningMs,
      onWarning: (remaining) => callbacks.current.onWarning?.(remaining),
      onIdle: () => callbacks.current.onIdle?.(),
      onActive: () => callbacks.current.onActive?.(),
      onActivity: (at) => callbacks.current.onActivity?.(at),
    });
    tracker.current = current;
    return () => {
      current.stop();
      if (tracker.current === current) tracker.current = null;
    };
  }, [enabled, timeoutMs, warningMs]);

  return useCallback(() => tracker.current?.markActive(), []);
}
