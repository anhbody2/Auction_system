/**
 * sec-004 (SRS System - Security Functional, REQ-1): knows when the signed-in user last touched any open tab.
 * Plain module (no React) so it runs under Node in vitest; fe/src/useIdleTimer.ts wraps it. See docs/idle-logout.md.
 */

/** Exactly the SRS list. Listened to in the capture phase, so a scroll inside an inner pane counts too. */
export const IDLE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
/** Shared by every tab of the app: activity in one tab keeps all of them signed in. */
export const LAST_ACTIVITY_KEY = 'auction:lastActivity';
/** At most one timer reset per second, so mousemove does not reset timers on every pixel. */
export const ACTIVITY_THROTTLE_MS = 1000;

export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60_000;
export const DEFAULT_IDLE_WARNING_MS = 60_000;
/** Dev builds only (e2e runs the Vite dev server): a spec may shorten the limits for its own page. */
export const IDLE_SETTINGS_OVERRIDE_KEY = 'auction:idleSettings';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface IdleTrackerOptions {
  timeoutMs: number;
  warningMs: number;
  /** Where the activity and 'storage' events arrive (window in the app). */
  target?: EventTarget;
  /** localStorage in the app; null (or one that throws) means per-tab tracking only. */
  storage?: StorageLike | null;
  now?: () => number;
  onWarning?: (remainingMs: number) => void;
  onIdle?: () => void;
  onActive?: () => void;
}

export interface IdleTracker {
  stop: () => void;
  /** The last activity seen by this tab or shared by another one. */
  lastActivity: () => number;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createIdleTracker(options: IdleTrackerOptions): IdleTracker {
  const { timeoutMs, onWarning, onIdle, onActive } = options;
  const warningMs = Math.min(Math.max(options.warningMs, 0), timeoutMs);
  const target = options.target ?? window;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? Date.now;

  let last = now();
  let lastReset = -Infinity;
  let warned = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const readShared = () => {
    try {
      const value = Number(storage?.getItem(LAST_ACTIVITY_KEY));
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };
  const writeShared = (value: number) => {
    try {
      storage?.setItem(LAST_ACTIVITY_KEY, String(value));
    } catch {
      // Private mode or quota: this tab keeps its own clock.
    }
  };

  const becameActive = () => {
    if (!warned) return;
    warned = false;
    onActive?.();
  };

  /** Runs when a deadline is due; re-reads the shared time first, in case another tab's event was missed. */
  const check = () => {
    if (stopped) return;
    last = Math.max(last, readShared());
    const idleFor = now() - last;
    if (idleFor >= timeoutMs) {
      stop();
      onIdle?.();
      return;
    }
    if (idleFor >= timeoutMs - warningMs) {
      if (!warned) {
        warned = true;
        onWarning?.(timeoutMs - idleFor);
      }
    } else {
      becameActive();
    }
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    const idleFor = now() - last;
    const warnAt = timeoutMs - warningMs;
    const due = !warned && warningMs > 0 && idleFor < warnAt ? warnAt : timeoutMs;
    timer = setTimeout(check, Math.max(due - idleFor, 0));
  };

  const onActivity = () => {
    if (stopped) return;
    const t = now();
    if (t - lastReset < ACTIVITY_THROTTLE_MS) return;
    lastReset = t;
    last = t;
    writeShared(t);
    becameActive();
    schedule();
  };

  const onStorage = (event: Event) => {
    const { key, newValue } = event as StorageEvent;
    if (stopped || key !== LAST_ACTIVITY_KEY) return;
    const value = Number(newValue);
    if (!Number.isFinite(value) || value <= last) return;
    last = value;
    becameActive();
    schedule();
  };

  const listenerOptions = { capture: true, passive: true };
  for (const name of IDLE_EVENTS) target.addEventListener(name, onActivity, listenerOptions);
  target.addEventListener('storage', onStorage);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const name of IDLE_EVENTS) target.removeEventListener(name, onActivity, listenerOptions);
    target.removeEventListener('storage', onStorage);
  }

  // Starting (signing in) counts as activity.
  onActivity();
  return { stop, lastActivity: () => last };
}

/**
 * The limits: VITE_IDLE_TIMEOUT_MS / VITE_IDLE_WARNING_MS (defaults 30 min / 60 s). In dev builds a JSON
 * { timeoutMs, warningMs } under IDLE_SETTINGS_OVERRIDE_KEY wins, so one e2e spec can use seconds without
 * shortening every other spec's session. Production builds ignore it.
 */
export function idleSettings(
  env: { VITE_IDLE_TIMEOUT_MS?: string; VITE_IDLE_WARNING_MS?: string; DEV?: boolean } = import.meta.env,
  storage: StorageLike | null = defaultStorage(),
) {
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return value != null && value !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  let timeoutMs = num(env.VITE_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS);
  let warningMs = num(env.VITE_IDLE_WARNING_MS, DEFAULT_IDLE_WARNING_MS);
  if (env.DEV) {
    try {
      const raw = storage?.getItem(IDLE_SETTINGS_OVERRIDE_KEY);
      if (raw) {
        const override = JSON.parse(raw) as { timeoutMs?: number; warningMs?: number };
        timeoutMs = num(override.timeoutMs, timeoutMs);
        warningMs = num(override.warningMs, warningMs);
      }
    } catch {
      // Bad JSON or no storage: keep the env values.
    }
  }
  return { timeoutMs, warningMs: Math.min(warningMs, timeoutMs) };
}
