# Idle tracking and idle logout (sec-004, sec-005)

SRS: System - Security Functional: "Log-out and clear refreshToken for inactive user (30 mins inactive)".
REQ-1 (a React custom hook tracking mousedown, keydown, scroll, touchstart, mousemove) is sec-004. REQ-2
(notification first, then logout and refresh-token revocation) is sec-005, section "Idle logout" below.
The server half of the 30-minute rule (a refresh token unused for `IDLE_TIMEOUT_MS` is refused) is sec-003,
docs/session-tokens.md.

## Pieces

| File | Role |
|---|---|
| fe/src/idle.ts | `createIdleTracker(...)`: plain module (no React), unit tested under Node. `idleSettings()`: the limits. |
| fe/src/useIdleTimer.ts | `useIdleTimer({ enabled, timeoutMs?, warningMs?, onWarning, onIdle, onActive, onActivity })`: the React hook; returns `markActive()`. |
| fe/src/auth.tsx | `AuthProvider` runs the hook while a user is signed in (every role: customer, staff, admin): warning, heartbeat, idle logout, cross-tab follow. |
| fe/src/idleSession.ts | sec-005 pure helpers: countdown text, login message, heartbeat throttle, cross-tab logout signal, Web Lock claim. |
| fe/src/components/IdleWarning.tsx | sec-005 warning dialog. |
| fe/src/store/session.ts | `sessionEnded`: the auction and credit slices reset on it. |

## What counts as activity

Exactly the five SRS events: `mousedown`, `keydown`, `scroll`, `touchstart`, `mousemove`. They are listened to on
`window` in the capture phase (`{ capture: true, passive: true }`), so a scroll inside an inner pane (which does
not bubble) counts too, and the listeners never delay scrolling. Clicks, wheel events without a scroll, focus and
key-up do not count on their own.

Activity is throttled: at most one reset per second (`ACTIVITY_THROTTLE_MS`). A mouse moving across the page
does not reset timers or write storage on every pixel.

## Timeline

With `timeoutMs` (default 30 min) and `warningMs` (default 60 s), counted from the last activity in any tab:

1. `timeoutMs - warningMs` without activity: `onWarning(remainingMs)` fires once.
2. Activity (or another tab's activity) after the warning: `onActive()`, and the countdown starts again.
3. `timeoutMs` without activity: `onIdle()` fires once, and the tracker stops (listeners and timer removed).

Signing in (the tracker starting) counts as activity. Before each deadline the tracker re-reads the shared time,
so a missed storage event cannot sign a tab out while another tab is in use.

## Cross-tab rule

The last activity time is shared through localStorage key `auction:lastActivity` (epoch ms). Every tab writes it
on its own activity and listens to the `storage` event, so using any tab keeps every tab signed in. A newer value
from another tab moves this tab's clock forward and dismisses a warning; older values are ignored. If storage is
unavailable or throws (private mode, quota), each tab tracks on its own.

## Settings

| Setting | Default | Notes |
|---|---|---|
| `VITE_IDLE_TIMEOUT_MS` | 1800000 (30 min) | Build-time (Vite env). Invalid values fall back to the default. |
| `VITE_IDLE_WARNING_MS` | 60000 (60 s) | Never longer than the timeout. |
| localStorage `auction:idleSettings` | none | Dev builds only (`import.meta.env.DEV`; e2e runs the Vite dev server): JSON `{ timeoutMs, warningMs }` that wins over the env values. Production builds ignore it. |

Why the override instead of a short `VITE_IDLE_TIMEOUT_MS` on the e2e web server (as the feature list first said):
once sec-005 logs idle users out, a seconds-long limit for the whole e2e run would sign users out in the middle
of unrelated specs (they wait on API polls without input). A spec that needs short limits sets the override for
its own pages with `page.addInitScript`. Same reason as the access-token TTL in sec-003.

## Idle logout (sec-005)

With the defaults (30 min, 60 s):

| Time without activity | What happens |
|---|---|
| 0 - 29 min | Nothing visible. While the user is active the client renews the session (`POST /api/auth/refresh`) at most every 5 minutes (`HEARTBEAT_MS`), so the server's 30-minute refresh-token idle limit (sec-003) never ends the session of a user who is active but makes no API calls. |
| 29 min | Warning dialog (`role="alertdialog"`, `data-testid="idle-warning"`): "Are you still there?", "You will be signed out in 60 s because of inactivity", counting down every second. Focus moves to "Stay signed in". |
| any activity, or "Stay signed in" | The dialog closes and the countdown starts again (the button calls the tracker's `markActive()`, so it does not depend on its own click being counted). |
| 30 min | `POST /api/auth/logout { reason: 'idle' }`: the server revokes the refresh token (`revoke_reason = 'idle'`) and clears both cookies. The client drops the user, dispatches `sessionEnded` (auction and credit slices reset; the user's SSE stream closes with the user) and goes to /login with `{ idle: true, from }`. The login page shows `data-testid="idle-signed-out"`: "You were signed out after 30 minutes of inactivity". Logging in again returns to `from`. |

Guests are never tracked, so they never see the warning. Staff and admins are covered like customers.

If the logout call fails (offline), the client still signs out; the refresh token is refused later anyway because
the server idle limit has passed.

### Every tab follows, with one logout call

The tabs share the activity clock, so they all reach the limit within milliseconds of each other. That is faster
than localStorage reaches the other tabs, so a storage check alone let two tabs both call logout (seen in e2e).
The tab that goes idle therefore first claims the cross-tab Web Lock `auction:idle-logout` (`navigator.locks`,
`ifAvailable`, held 3 s): only the winner writes `auction:logout` (`{ reason: 'idle', at }`) and calls the server.
Every other tab, through its own tracker or the `storage` event for `auction:logout` (fresh for 10 s), drops its
user and shows the same login message without a second call. Without Web Locks each tab may call logout; that is
harmless (logout without a valid cookie is a 200 no-op).

## Tests

- fe/src/idle.test.ts: each of the five events resets; other events do not; warning then idle once each; activity
  after the warning; throttling; storage events and storage read before a deadline; stop() removes listeners and
  timers; idle stops the tracker; throwing or missing storage; settings and the dev-only override.
- fe/src/idleSession.test.ts (sec-005): countdown text, login message wording, heartbeat throttle, logout signal
  write/parse/freshness, broken storage, one winner of the Web Lock.
- e2e/sec-005-idle-logout.spec.ts (override 6 s / 3 s): warning with focus on the button and a counting text;
  mouse move and "Stay signed in" (keyboard) dismiss it; a second tab of the same browser; idle -> both tabs on
  /login with the message, exactly one logout call with `{ reason: 'idle' }`, refresh cookie gone and the old token
  replayed -> 401; login returns to the page; staff signed out the same way; a guest never sees the warning.
- Manual check (2026-10-23, real Chromium, Vite env `VITE_IDLE_TIMEOUT_MS=120000`, `VITE_IDLE_WARNING_MS=60000`):
  warning after 61 s showing "60 s", Stay signed in, second warning 60.5 s later, logout at 120 s with
  "You were signed out after 2 minutes of inactivity".
- e2e/sec-004-idle-hook.spec.ts: guests not tracked; sign-in writes `auction:lastActivity`; no input leaves it
  unchanged; mouse move, mouse down, key press, scroll and touch (hasTouch context) each advance it; after logout
  input no longer writes.
