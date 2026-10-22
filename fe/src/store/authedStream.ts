import { refreshSession } from '../api';

export const REOPEN_DELAY_MS = 2000;

/**
 * sec-003: an EventSource for a signed-in stream that survives access-token expiry. EventSource retries a
 * dropped connection by itself, but gives up for good (readyState CLOSED) when the reconnect is answered 401.
 * Then the session is renewed and the stream opened again; `attach` is called for every new EventSource, so
 * its own onerror/onopen logic (reload after a drop) keeps working. Returns a close function.
 */
export function openAuthedStream(url: string, attach: (source: EventSource) => void, reopenDelayMs = REOPEN_DELAY_MS) {
  let closed = false;
  let source: EventSource;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    const current = new EventSource(url);
    source = current;
    attach(current);
    current.addEventListener('error', () => {
      if (closed || current.readyState !== EventSource.CLOSED) return;
      void refreshSession().then((ok) => {
        // Not renewable: the user is signed out; the next API call (or sec-005) takes them to the login page.
        if (!ok || closed) return;
        timer = setTimeout(() => {
          if (!closed) open();
        }, reopenDelayMs);
      });
    });
  };

  open();
  return () => {
    closed = true;
    clearTimeout(timer);
    source.close();
  };
}
