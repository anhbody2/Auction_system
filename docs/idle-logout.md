# Idle tracking and idle logout (sec-004, sec-005)

SRS: System - Security Functional: "Log-out and clear refreshToken for inactive user (30 mins inactive)".
REQ-1 (a React custom hook tracking mousedown, keydown, scroll, touchstart, mousemove) is sec-004 and is
described here. REQ-2 (notification first, then logout and refresh-token revocation) is sec-005; its section is
added when it is built. The server half of the 30-minute rule (a refresh token unused for `IDLE_TIMEOUT_MS` is
refused) is sec-003, docs/session-tokens.md.

## Pieces

| File | Role |
|---|---|
| fe/src/idle.ts | `createIdleTracker(...)`: plain module (no React), unit tested under Node. `idleSettings()`: the limits. |
| fe/src/useIdleTimer.ts | `useIdleTimer({ enabled, timeoutMs?, warningMs?, onWarning, onIdle, onActive })`: the React hook. |
| fe/src/auth.tsx | `AuthProvider` runs the hook while a user is signed in (every role: customer, staff, admin). |

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

## Tests

- fe/src/idle.test.ts: each of the five events resets; other events do not; warning then idle once each; activity
  after the warning; throttling; storage events and storage read before a deadline; stop() removes listeners and
  timers; idle stops the tracker; throwing or missing storage; settings and the dev-only override.
- e2e/sec-004-idle-hook.spec.ts: guests not tracked; sign-in writes `auction:lastActivity`; no input leaves it
  unchanged; mouse move, mouse down, key press, scroll and touch (hasTouch context) each advance it; after logout
  input no longer writes.
