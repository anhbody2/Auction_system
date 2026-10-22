# Session tokens (sec-003)

Since sec-003 (SRS: System - Security Functional, "clear refreshToken"). Before it, a session was one 7-day JWT
cookie that could not be revoked.

## Two cookies

| Cookie | Content | Lifetime | Path |
|---|---|---|---|
| `auction_token` (access) | JWT `{ sub, username, role }`, signed with `JWT_SECRET` | `ACCESS_TOKEN_TTL_MS`, default 15 min (cookie Max-Age and JWT `exp`) | `/` |
| `auction_refresh` (refresh) | 32 random bytes, hex | `REFRESH_TOKEN_TTL_MS`, default 7 days, absolute | `/api/auth` (only sent to the auth routes) |

Both are `HttpOnly`, `SameSite=Lax`. Every API request still reads only the access cookie
(be/src/middleware/auth.ts), and still re-reads role and status from the DB, so a lock applies at once.

## Table `refresh_tokens`

One row per issued refresh token. Only `token_hash` (SHA-256) is stored. Rows are revoked
(`revoked_at`, `revoke_reason`), never deleted.

| revoke_reason | When |
|---|---|
| `rotated` | The token was exchanged by `POST /api/auth/refresh`; `replaced_by_id` points to the new row. |
| `reuse` | A token that had already been rotated was presented again (after the grace window): every open token of that user. |
| `logout` | `POST /api/auth/logout`. |
| `idle` | `POST /api/auth/logout { reason: 'idle' }` (sec-005), or a refresh refused because the token was unused for longer than `IDLE_TIMEOUT_MS`. |
| `password` | Password reset by link, password change while signed in, admin set-password: every open token of the user. |
| `locked` / `deleted` | Admin locks or soft-deletes the user: every open token of the user. |

## Routes

`POST /api/auth/login` and the activation sign-in (`POST /api/auth/verify-email`, mail-002) start a session:
an access cookie plus a new refresh token.

`POST /api/auth/refresh` (refresh cookie only):

1. Missing or unknown token, user not `active`/`pending` -> 401.
2. Revoked token: if it was `rotated` less than `REFRESH_REUSE_GRACE_MS` (default 10 s) ago, this is two tabs
   refreshing at once with the same cookie, and the late request gets its own new pair. Otherwise -> 401, and if it
   had been rotated, every open token of the user is revoked (`reuse`: someone else holds a copy).
3. Expired token (`expires_at`) -> 401.
4. Idle token: `last_used_at` older than `IDLE_TIMEOUT_MS` (default 30 min) -> revoked `idle`, 401. A token's
   `last_used_at` is when it was issued, since every use rotates it. The client renews while the user is active
   (sec-005), so only an inactive session hits this.
5. Otherwise: the token is revoked `rotated` in one conditional UPDATE (two requests cannot both win), a new
   token is issued with the same absolute `expires_at`, both cookies are set, 200 `{ user }`.

Every 401 clears both cookies; the message is "Session expired, please log in again".

`POST /api/auth/logout [{ reason: 'logout' | 'idle' }]` revokes the presented refresh token and clears both
cookies. It needs no valid access token. Other sessions of the user stay open.

`PUT /api/me/password` (change with the current password) revokes every session and then starts a new one for
the request's browser, so the user stays signed in there and is signed out everywhere else. mail-004: the UI uses
the emailed change link instead; `POST /api/auth/reset-password` with a `change` token does the same (new session)
when the request carries that user's own access cookie, and starts no session otherwise.

## Client (fe/src/api.ts)

- A 401 from any call except `/auth/login`, `/auth/refresh` and `/auth/logout` triggers one
  `POST /auth/refresh` and, if it succeeds, retries the call once. Concurrent 401s share one refresh
  (`refreshSession()`). Only when the refresh fails does the sys-004 sign-out run (it still ignores `/auth/*`).
- Page load: `AuthProvider` calls `/auth/me`; with an expired access cookie that call is refreshed and retried
  like any other, so a reload keeps the user signed in. A guest's probe costs one extra (401) refresh call.
- SSE (fe/src/store/authedStream.ts): `EventSource` retries a dropped stream by itself, but stops for good when
  the reconnect is answered 401. `openAuthedStream` then refreshes the session and opens the stream again after
  2 s. `/api/me/events` uses it; the public auction stream does not need it.

## Settings

| Variable | Default | Notes |
|---|---|---|
| `ACCESS_TOKEN_TTL_MS` | 900000 (15 min) | e2e keeps the default: Playwright API contexts (staff approvals, `page.request`) do not refresh, so a seconds-long TTL breaks unrelated specs. e2e/sec-003 drops the access cookie to simulate expiry. |
| `REFRESH_TOKEN_TTL_MS` | 604800000 (7 days) | Absolute; rotation keeps the first expiry. |
| `IDLE_TIMEOUT_MS` | 1800000 (30 min) | Server side of the 30-minute inactivity rule. |
| `REFRESH_REUSE_GRACE_MS` | 10000 | Concurrent-refresh window. |

## Limits and open points

- An access JWT issued before a password change stays valid until it expires (at most 15 min). Lock and delete
  apply at once anyway, because the middleware re-reads the status.
- After deploy, old 7-day `auction_token` cookies have no refresh token; users sign in once more.
- Lifetimes (15 min / 7 days) are assumptions to confirm with the product owner.
