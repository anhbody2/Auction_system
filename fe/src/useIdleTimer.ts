import { useEffect, useRef } from 'react';
import { createIdleTracker, idleSettings } from './idle';

export interface UseIdleTimerOptions {
  enabled: boolean;
  timeoutMs?: number;
  warningMs?: number;
  onWarning?: (remainingMs: number) => void;
  onIdle?: () => void;
  onActive?: () => void;
}

/**
 * sec-004 (SRS REQ-1): the React custom hook that tracks mousedown, keydown, scroll, touchstart and mousemove.
 * Runs only while `enabled` (a user is signed in); stops on unmount or when disabled. The latest callbacks are
 * used without restarting the tracker, so passing inline functions is fine.
 */
export function useIdleTimer({ enabled, timeoutMs, warningMs, onWarning, onIdle, onActive }: UseIdleTimerOptions) {
  const callbacks = useRef({ onWarning, onIdle, onActive });
  callbacks.current = { onWarning, onIdle, onActive };

  useEffect(() => {
    if (!enabled) return;
    const defaults = idleSettings();
    const tracker = createIdleTracker({
      timeoutMs: timeoutMs ?? defaults.timeoutMs,
      warningMs: warningMs ?? defaults.warningMs,
      onWarning: (remaining) => callbacks.current.onWarning?.(remaining),
      onIdle: () => callbacks.current.onIdle?.(),
      onActive: () => callbacks.current.onActive?.(),
    });
    return tracker.stop;
  }, [enabled, timeoutMs, warningMs]);
}
