import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_THROTTLE_MS, IDLE_EVENTS, IDLE_SETTINGS_OVERRIDE_KEY, LAST_ACTIVITY_KEY, createIdleTracker, idleSettings, type IdleTrackerOptions } from './idle';

const TIMEOUT = 10_000;
const WARNING = 3_000;

/** In-memory localStorage; `fail` makes every call throw (private mode). */
function fakeStorage(fail = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => {
      if (fail) throw new Error('denied');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (fail) throw new Error('denied');
      data.set(k, v);
    },
  };
}

/** Node EventTarget standing in for window; counts listeners so stop() can be checked. */
class CountingTarget extends EventTarget {
  listeners = new Map<string, number>();
  addEventListener(type: string, cb: EventListenerOrEventListenerObject | null, opts?: AddEventListenerOptions | boolean) {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
    super.addEventListener(type, cb, opts);
  }
  removeEventListener(type: string, cb: EventListenerOrEventListenerObject | null, opts?: EventListenerOptions | boolean) {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) - 1);
    super.removeEventListener(type, cb, opts);
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
  /** What the browser delivers when another tab writes localStorage. */
  storageEvent(key: string, newValue: string | null) {
    this.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));
  }
}

let target: CountingTarget;
let storage: ReturnType<typeof fakeStorage>;

function track(extra: Partial<IdleTrackerOptions> = {}) {
  const calls = { warning: [] as number[], idle: 0, active: 0 };
  const tracker = createIdleTracker({
    timeoutMs: TIMEOUT,
    warningMs: WARNING,
    target,
    storage,
    onWarning: (ms) => calls.warning.push(ms),
    onIdle: () => calls.idle++,
    onActive: () => calls.active++,
    ...extra,
  });
  return { tracker, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  target = new CountingTarget();
  storage = fakeStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sec-004 createIdleTracker', () => {
  it('warns once at timeout - warning and goes idle once at the timeout', () => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - WARNING - 1);
    expect(calls.warning).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls.warning).toEqual([WARNING]);
    vi.advanceTimersByTime(WARNING - 1);
    expect(calls.idle).toBe(0);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual({ warning: [WARNING], idle: 1, active: 0 });
    vi.advanceTimersByTime(TIMEOUT * 3);
    expect(calls).toEqual({ warning: [WARNING], idle: 1, active: 0 });
  });

  it.each(IDLE_EVENTS)('%s resets the countdown and is shared through localStorage', (name) => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - WARNING - 100);
    target.fire(name);
    expect(storage.data.get(LAST_ACTIVITY_KEY)).toBe(String(Date.now()));
    vi.advanceTimersByTime(TIMEOUT - WARNING - 1);
    expect(calls.warning).toEqual([]);
    vi.advanceTimersByTime(TIMEOUT);
    expect(calls.idle).toBe(1);
  });

  it.each(['click', 'wheel', 'focus', 'keyup'])('%s does not count as activity', (name) => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - WARNING - 100);
    const before = storage.data.get(LAST_ACTIVITY_KEY);
    target.fire(name);
    expect(storage.data.get(LAST_ACTIVITY_KEY)).toBe(before);
    vi.advanceTimersByTime(100);
    expect(calls.warning).toEqual([WARNING]);
  });

  it('activity after the warning fires onActive and restarts the countdown', () => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - WARNING + 500);
    expect(calls.warning).toHaveLength(1);
    target.fire('mousemove');
    expect(calls.active).toBe(1);
    vi.advanceTimersByTime(TIMEOUT - WARNING - 1);
    expect(calls.warning).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(calls.warning).toHaveLength(2);
    vi.advanceTimersByTime(WARNING);
    expect(calls.idle).toBe(1);
  });

  it('throttles: at most one reset per second', () => {
    track();
    const start = Date.now();
    expect(storage.data.get(LAST_ACTIVITY_KEY)).toBe(String(start));
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS / 10 - 1);
      target.fire('mousemove');
    }
    expect(storage.data.get(LAST_ACTIVITY_KEY)).toBe(String(start));
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS);
    target.fire('mousemove');
    expect(storage.data.get(LAST_ACTIVITY_KEY)).toBe(String(Date.now()));
  });

  it('activity in another tab (storage event) postpones the warning and the idle limit', () => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - WARNING - 100);
    target.storageEvent(LAST_ACTIVITY_KEY, String(Date.now()));
    vi.advanceTimersByTime(TIMEOUT - WARNING - 1);
    expect(calls.warning).toEqual([]);

    // After a warning, another tab's activity also dismisses it.
    vi.advanceTimersByTime(500);
    expect(calls.warning).toHaveLength(1);
    target.storageEvent(LAST_ACTIVITY_KEY, String(Date.now()));
    expect(calls.active).toBe(1);
    // Older or unrelated values are ignored.
    target.storageEvent(LAST_ACTIVITY_KEY, '1');
    target.storageEvent('other', String(Date.now() + 10_000));
    vi.advanceTimersByTime(TIMEOUT);
    expect(calls.idle).toBe(1);
  });

  it('a shared time written while no storage event arrived is still read before going idle', () => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - 100);
    storage.data.set(LAST_ACTIVITY_KEY, String(Date.now()));
    vi.advanceTimersByTime(100);
    expect(calls.idle).toBe(0);
    expect(calls.active).toBe(1);
  });

  it('stop() removes every listener and timer', () => {
    const { tracker, calls } = track();
    for (const name of [...IDLE_EVENTS, 'storage']) expect(target.listeners.get(name)).toBe(1);
    tracker.stop();
    for (const name of [...IDLE_EVENTS, 'storage']) expect(target.listeners.get(name)).toBe(0);
    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS);
    const before = storage.data.get(LAST_ACTIVITY_KEY);
    target.fire('keydown');
    expect(storage.data.get(LAST_ACTIVITY_KEY)).toBe(before);
    vi.advanceTimersByTime(TIMEOUT * 2);
    expect(calls).toEqual({ warning: [], idle: 0, active: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('going idle stops the tracker too', () => {
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT);
    expect(calls.idle).toBe(1);
    expect(target.listeners.get('mousemove')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('storage that throws still tracks per tab', () => {
    storage = fakeStorage(true);
    const { calls } = track();
    vi.advanceTimersByTime(TIMEOUT - WARNING - 100);
    target.fire('keydown');
    vi.advanceTimersByTime(TIMEOUT - WARNING - 1);
    expect(calls.warning).toEqual([]);
    vi.advanceTimersByTime(TIMEOUT);
    expect(calls.idle).toBe(1);
  });

  it('works with no storage at all', () => {
    const { calls } = track({ storage: null });
    vi.advanceTimersByTime(TIMEOUT);
    expect(calls).toEqual({ warning: [WARNING], idle: 1, active: 0 });
  });
});

describe('sec-004 idleSettings', () => {
  it('defaults to 30 minutes and 60 seconds', () => {
    expect(idleSettings({}, null)).toEqual({ timeoutMs: 1_800_000, warningMs: 60_000 });
  });

  it('reads VITE_IDLE_TIMEOUT_MS / VITE_IDLE_WARNING_MS and ignores bad values', () => {
    expect(idleSettings({ VITE_IDLE_TIMEOUT_MS: '120000', VITE_IDLE_WARNING_MS: '30000' }, null)).toEqual({ timeoutMs: 120_000, warningMs: 30_000 });
    expect(idleSettings({ VITE_IDLE_TIMEOUT_MS: 'soon', VITE_IDLE_WARNING_MS: '-1' }, null)).toEqual({ timeoutMs: 1_800_000, warningMs: 60_000 });
    // The warning never starts before the session does.
    expect(idleSettings({ VITE_IDLE_TIMEOUT_MS: '5000' }, null)).toEqual({ timeoutMs: 5000, warningMs: 5000 });
  });

  it('the localStorage override applies only in dev builds', () => {
    storage.setItem(IDLE_SETTINGS_OVERRIDE_KEY, JSON.stringify({ timeoutMs: 6000, warningMs: 3000 }));
    expect(idleSettings({ DEV: true }, storage)).toEqual({ timeoutMs: 6000, warningMs: 3000 });
    expect(idleSettings({ DEV: false }, storage)).toEqual({ timeoutMs: 1_800_000, warningMs: 60_000 });
    storage.setItem(IDLE_SETTINGS_OVERRIDE_KEY, '{not json');
    expect(idleSettings({ DEV: true }, storage)).toEqual({ timeoutMs: 1_800_000, warningMs: 60_000 });
  });
});
