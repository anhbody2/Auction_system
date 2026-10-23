/**
 * sec-005 (SRS System - Security Functional, REQ-2): the parts of the idle logout that are not React, so they run
 * under Node in vitest. AuthProvider (fe/src/auth.tsx) puts them together; see docs/idle-logout.md.
 */

/** While the user is active the session is renewed at most this often, so the server idle limit never ends it. */
export const HEARTBEAT_MS = 5 * 60_000;
/** Written by the tab that logs out for inactivity; other tabs follow without a second logout call. */
export const LOGOUT_SIGNAL_KEY = 'auction:logout';
/** A signal older than this is not about the current moment (e.g. left over from yesterday). */
export const LOGOUT_SIGNAL_FRESH_MS = 10_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const warningText = (remainingMs: number) =>
  `You will be signed out in ${Math.max(Math.ceil(remainingMs / 1000), 0)} s because of inactivity`;

/** '30 minutes', '1 minute', '6 seconds': for the login page message. */
export function formatIdleDuration(ms: number) {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (ms >= 60_000 && ms % 60_000 === 0) return plural(ms / 60_000, 'minute');
  return plural(Math.round(ms / 1000), 'second');
}

export const idleSignedOutText = (timeoutMs: number) => `You were signed out after ${formatIdleDuration(timeoutMs)} of inactivity`;

/**
 * Calls `beat` when the user is active and the last beat (or the start) is at least `intervalMs` old.
 * Feed it every activity time; it decides.
 */
export function createHeartbeat(beat: () => void, intervalMs = HEARTBEAT_MS, start = Date.now()) {
  let last = start;
  return (at: number) => {
    if (at - last < intervalMs) return false;
    last = at;
    beat();
    return true;
  };
}

export function writeLogoutSignal(storage: StorageLike | null, at = Date.now()) {
  try {
    storage?.setItem(LOGOUT_SIGNAL_KEY, JSON.stringify({ reason: 'idle', at }));
  } catch {
    // No storage: other tabs find out through their own tracker or the next 401.
  }
}

/** The idle-logout signal in a storage value, if it is one and it is fresh. */
export function parseLogoutSignal(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  try {
    const signal = JSON.parse(value) as { reason?: unknown; at?: unknown };
    if (signal.reason !== 'idle' || typeof signal.at !== 'number') return null;
    return now - signal.at <= LOGOUT_SIGNAL_FRESH_MS ? { reason: 'idle' as const, at: signal.at } : null;
  } catch {
    return null;
  }
}

/** True when another tab has just logged out for inactivity, so this one must not call logout again. */
export function recentLogoutSignal(storage: StorageLike | null, now = Date.now()) {
  try {
    return parseLogoutSignal(storage?.getItem(LOGOUT_SIGNAL_KEY), now) !== null;
  } catch {
    return false;
  }
}

export const IDLE_LOGOUT_LOCK = 'auction:idle-logout';
type LockManagerLike = Pick<LockManager, 'request'>;

/**
 * Tabs reach the idle limit within milliseconds of each other, faster than localStorage reaches the other tabs.
 * Exactly one of them gets this cross-tab Web Lock (held `holdMs`, longer than the race) and calls logout; the
 * others resolve false and only follow. Without Web Locks every tab may call (the storage signal still helps).
 */
export function claimIdleLogout(
  locks: LockManagerLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks,
  holdMs = 3000,
): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    locks
      .request(IDLE_LOGOUT_LOCK, { ifAvailable: true }, async (lock) => {
        resolve(lock !== null);
        if (lock) await new Promise((done) => setTimeout(done, holdMs));
      })
      .catch(() => resolve(true));
  });
}
