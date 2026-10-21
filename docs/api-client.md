# Frontend API client (sys-004)

All HTTP calls from fe/ go through one Axios instance, `http` in fe/src/api.ts.

## Instance

- `baseURL: '/api'`, `withCredentials: true` (the auth cookie goes with every call; Vite proxies /api in dev).
- `api<T>(path, { method?, body?, config? })` keeps the old fetch-era signature, so pages did not change:
  method defaults to POST when there is a body, otherwise GET; the body is sent as JSON; it resolves to the
  response body. `config` passes extra Axios options (rarely needed).
- A GET without a body sends no Content-Type.
- Image upload (`uploadImage` in fe/src/components/ImageUpload.tsx) posts FormData through `http` and reports
  progress via `onUploadProgress`; the field shows "Uploading... N%" and a progress bar.

## Errors

A response interceptor turns every failure into the existing `ApiError(status, message, fields)`:

| Failure | ApiError |
|---|---|
| HTTP error with `{ error, fields }` | same status, `error` as message, `fields` (or `{}`) |
| HTTP error without a JSON body | status, "Request failed" |
| No response (network down, CORS, aborted) | status 0, "Could not reach the server. Check your connection and try again." |

`toApiError(err)` is exported for code that calls `http` directly.

## 401 handling

`AuthProvider` registers a handler with `setUnauthorizedHandler`. On a 401 from any call **except `/auth/*`**
(wrong password and the guest `/auth/me` probe answer 401 as part of their normal flow) the handler:
- does nothing if no user is signed in (guests on public pages are never redirected);
- otherwise clears the user once (concurrent 401s redirect once) and navigates to `/login` with
  `state.from` (logging in returns there) and `state.expired`, which shows "Your session has ended. Please log in again."

The request still rejects with its ApiError, so the calling page can stop its spinner.

## Why SSE stays on EventSource

The live streams (`/api/auctions/:id/events`, `/api/me/events`, see docs/realtime.md) are Server-Sent Events.
Axios in the browser uses XHR and has no streaming/EventSource support; EventSource also reconnects by itself.
So fe/src/store/useAuctionEvents.ts and useUserEvents.ts keep `new EventSource(...)`; their reconnect reloads use `api()`.

## Tests

- fe/src/api.test.ts: stub adapter on `http`; checks base URL, cookies, Content-Type, error mapping, network error,
  401 handler (once; not for /auth/*; not after unregister).
- e2e/sys-004-axios-client.spec.ts: register field error, login, image upload, bid, every /api call (not SSE) is an
  XHR, and a cleared cookie sends the user to /login and back after logging in.
