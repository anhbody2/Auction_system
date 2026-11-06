# chat-1.1: floating Messenger chat box

Facebook retired the embeddable Customer Chat plugin in 2024 and `be/chat.py` only talks to Messenger, so the box hands off to `https://m.me/<page>`. Messages are not typed on the site; that would need a new web endpoint.

Setup: set `VITE_FACEBOOK_PAGE` in `fe/.env` to the page username or numeric ID and restart Vite. Unset hides the box.

Changed files:

- `fe/src/components/MessengerChat.tsx` (new)
- `fe/src/components/Layout.tsx`: renders it after the footer
- `fe/src/styles.css`: `.chat*` styles; `.toasts` moved up to 5rem so toasts clear the button
- `fe/src/vite-env.d.ts`, `fe/.env.example` (new): `VITE_FACEBOOK_PAGE`

No e2e spec, at the user's request (2026-11-06).
