import { describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_MS,
  LOGOUT_SIGNAL_FRESH_MS,
  LOGOUT_SIGNAL_KEY,
  claimIdleLogout,
  createHeartbeat,
  formatIdleDuration,
  idleSignedOutText,
  parseLogoutSignal,
  recentLogoutSignal,
  warningText,
  writeLogoutSignal,
} from './idleSession';

const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };

describe('sec-005 countdown and messages', () => {
  it('counts whole seconds down, never below zero', () => {
    expect(warningText(60_000)).toBe('You will be signed out in 60 s because of inactivity');
    expect(warningText(59_001)).toBe('You will be signed out in 60 s because of inactivity');
    expect(warningText(59_000)).toBe('You will be signed out in 59 s because of inactivity');
    expect(warningText(1)).toBe('You will be signed out in 1 s because of inactivity');
    expect(warningText(-500)).toBe('You will be signed out in 0 s because of inactivity');
  });

  it('names the idle limit on the login page', () => {
    expect(idleSignedOutText(30 * 60_000)).toBe('You were signed out after 30 minutes of inactivity');
    expect(formatIdleDuration(60_000)).toBe('1 minute');
    expect(formatIdleDuration(6000)).toBe('6 seconds');
    expect(formatIdleDuration(90_000)).toBe('90 seconds');
    expect(formatIdleDuration(1000)).toBe('1 second');
  });
});

describe('sec-005 heartbeat', () => {
  it('beats at most once per interval of activity, counted from the start', () => {
    const beat = vi.fn();
    const onActivity = createHeartbeat(beat, HEARTBEAT_MS, 0);
    expect(onActivity(1000)).toBe(false);
    expect(onActivity(HEARTBEAT_MS - 1)).toBe(false);
    expect(onActivity(HEARTBEAT_MS)).toBe(true);
    expect(onActivity(HEARTBEAT_MS + 60_000)).toBe(false);
    expect(onActivity(2 * HEARTBEAT_MS + 1)).toBe(true);
    expect(beat).toHaveBeenCalledTimes(2);
  });

  it('no activity means no beat, however long it is', () => {
    const beat = vi.fn();
    createHeartbeat(beat, HEARTBEAT_MS, 0);
    expect(beat).not.toHaveBeenCalled();
  });
});

describe('sec-005 cross-tab logout signal', () => {
  it('a written signal is read back while fresh', () => {
    const storage = memory();
    writeLogoutSignal(storage, 1000);
    expect(JSON.parse(storage.data.get(LOGOUT_SIGNAL_KEY)!)).toEqual({ reason: 'idle', at: 1000 });
    expect(recentLogoutSignal(storage, 1000 + LOGOUT_SIGNAL_FRESH_MS)).toBe(true);
    expect(recentLogoutSignal(storage, 1001 + LOGOUT_SIGNAL_FRESH_MS)).toBe(false);
  });

  it('other values are not a signal', () => {
    expect(parseLogoutSignal(null)).toBeNull();
    expect(parseLogoutSignal('')).toBeNull();
    expect(parseLogoutSignal('not json')).toBeNull();
    expect(parseLogoutSignal(JSON.stringify({ reason: 'logout', at: 5 }), 5)).toBeNull();
    expect(parseLogoutSignal(JSON.stringify({ reason: 'idle' }), 5)).toBeNull();
    expect(parseLogoutSignal(JSON.stringify({ reason: 'idle', at: 5 }), 5)).toEqual({ reason: 'idle', at: 5 });
  });

  it('storage that throws or is missing is ignored', () => {
    expect(() => writeLogoutSignal(broken)).not.toThrow();
    expect(recentLogoutSignal(broken)).toBe(false);
    expect(() => writeLogoutSignal(null)).not.toThrow();
    expect(recentLogoutSignal(null)).toBe(false);
  });
});

describe('sec-005 one logout call across tabs', () => {
  /** In-memory stand-in for navigator.locks with ifAvailable semantics. */
  function fakeLocks() {
    const held = new Set<string>();
    return {
      request: (async (name: string, _opts: unknown, cb: (lock: unknown) => Promise<void>) => {
        if (held.has(name)) return cb(null);
        held.add(name);
        try {
          return await cb({ name });
        } finally {
          held.delete(name);
        }
      }) as unknown as LockManager['request'],
    };
  }

  it('of two tabs claiming at once, exactly one wins; after the hold another claim wins again', async () => {
    vi.useFakeTimers();
    const locks = fakeLocks();
    const results = await Promise.all([claimIdleLogout(locks, 3000), claimIdleLogout(locks, 3000)]);
    expect(results.sort()).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await claimIdleLogout(locks, 3000)).toBe(true);
    vi.useRealTimers();
  });

  it('without Web Locks, or when the request fails, the tab calls logout itself', async () => {
    expect(await claimIdleLogout(undefined)).toBe(true);
    const failing = { request: (() => Promise.reject(new Error('no'))) as unknown as LockManager['request'] };
    expect(await claimIdleLogout(failing)).toBe(true);
  });
});
