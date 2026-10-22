import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '../api';
import { openAuthedStream } from './authedStream';

/** Minimal EventSource stand-in: tests drive readyState and 'error' by hand. */
class FakeEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static all: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(public url: string) {
    super();
    FakeEventSource.all.push(this);
  }
  fail(readyState: number) {
    this.readyState = readyState;
    this.dispatchEvent(new Event('error'));
    this.onerror?.();
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

let refreshStatus = 200;
let refreshCalls = 0;
const original = http.defaults.adapter;

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.all = [];
  refreshCalls = 0;
  refreshStatus = 200;
  vi.stubGlobal('EventSource', FakeEventSource);
  http.defaults.adapter = async (config) => {
    refreshCalls++;
    const response = { data: {}, status: refreshStatus, statusText: '', headers: {}, config, request: {} };
    if (refreshStatus >= 400) throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, {}, response);
    return response;
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  http.defaults.adapter = original;
});

describe('sec-003 openAuthedStream', () => {
  it('a drop the browser retries by itself (CONNECTING) does not refresh', async () => {
    const attach = vi.fn();
    openAuthedStream('/api/me/events', attach);
    FakeEventSource.all[0].fail(FakeEventSource.CONNECTING);
    await vi.runAllTimersAsync();
    expect(refreshCalls).toBe(0);
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it('a stream refused for good (401 on reconnect) renews the session and reopens with the same handlers', async () => {
    const attach = vi.fn();
    openAuthedStream('/api/me/events', attach, 100);
    FakeEventSource.all[0].fail(FakeEventSource.CLOSED);
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshCalls).toBe(1);
    expect(FakeEventSource.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeEventSource.all).toHaveLength(2);
    expect(FakeEventSource.all[1].url).toBe('/api/me/events');
    expect(attach).toHaveBeenCalledTimes(2);
    expect(attach.mock.calls[1][0]).toBe(FakeEventSource.all[1]);
  });

  it('does not reopen when the session cannot be renewed', async () => {
    refreshStatus = 401;
    openAuthedStream('/api/me/events', vi.fn(), 100);
    FakeEventSource.all[0].fail(FakeEventSource.CLOSED);
    await vi.runAllTimersAsync();
    expect(refreshCalls).toBe(1);
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it('closing stops a pending reopen and closes the current source', async () => {
    const close = openAuthedStream('/api/me/events', vi.fn(), 100);
    FakeEventSource.all[0].fail(FakeEventSource.CLOSED);
    await vi.advanceTimersByTimeAsync(0);
    close();
    await vi.runAllTimersAsync();
    expect(FakeEventSource.all).toHaveLength(1);
    expect(FakeEventSource.all[0].readyState).toBe(FakeEventSource.CLOSED);
  });
});
