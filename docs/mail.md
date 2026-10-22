# Account email (mail-001, mail-002, mail-003)

## Transport

Mail is sent with **Nodemailer**. The transport is chosen from the environment each time a mail is sent
(be/src/lib/mailer.ts `mailSettings`):

| Settings in be/.env | Transport | From |
|---|---|---|
| `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (all four) | Gmail SMTP (`service: 'gmail'`, smtp.gmail.com:465, TLS) with **OAuth 2.0 / XOAUTH2**: `auth: { type: 'OAuth2', user, clientId, clientSecret, refreshToken }`. Nodemailer exchanges the refresh token for short-lived access tokens itself. | `MAIL_FROM_NAME <GMAIL_USER>` (default name "BidHouse") |
| `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) | Any SMTP server | `MAIL_FROM` |
| otherwise | Dev outbox: kept in memory, readable at `GET /api/dev/outbox?to=<email>` (not in production), logged to the console | - |

No Gmail password or app password is used (rule change 2026-10-21). Tests and local dev run without credentials,
so they use the outbox. **Never commit be/.env**: it is gitignored; be/.env.example lists the names only.

### Setting up Gmail OAuth 2.0

1. **Google Cloud project.** At https://console.cloud.google.com create (or pick) a project, then
   *APIs & Services → Library → Gmail API → Enable*.
2. **Consent screen.** *APIs & Services → OAuth consent screen*: user type *External*, app name "BidHouse",
   your email as support and developer contact. Add the scope `https://mail.google.com/`. Under *Test users*
   add the Gmail address that will send the mails. (While the app is in "Testing", Google expires refresh
   tokens after 7 days; publish the app, or redo step 4 when mails start failing.)
3. **OAuth client.** *APIs & Services → Credentials → Create credentials → OAuth client ID*, type
   *Web application*. Under *Authorized redirect URIs* add `https://developers.google.com/oauthplayground`.
   Copy the **Client ID** and **Client secret**.
4. **Refresh token.** Open https://developers.google.com/oauthplayground. Click the gear icon, tick
   *Use your own OAuth credentials*, paste the client ID and secret. In step 1 enter the scope
   `https://mail.google.com/`, click *Authorize APIs* and sign in with the sending Gmail account. In step 2 click
   *Exchange authorization code for tokens* and copy the **Refresh token**.
5. In be/.env set:
   ```
   GMAIL_USER=bidhouse.yourname@gmail.com
   GMAIL_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=GOCSPX-...
   GMAIL_REFRESH_TOKEN=1//0g...
   APP_URL=http://localhost:5173
   ```
   `GMAIL_USER` must be the account that authorised the token. `APP_URL` is the site address put into the links.
6. Restart the API. Register with a real address you can read: the activation mail arrives from the Gmail account.
   If the token is revoked or expired, sending fails, the API logs the Google error and the user sees
   "We could not send the email, please try again".

## Templates

be/src/lib/mailTemplates.ts: `activationMail`, `resetPasswordMail`, `changePasswordMail`. Each has an HTML body
with a button and a plain-text body with the same link (for clients that do not show HTML). User-supplied text
is HTML-escaped.

## Failures

Account mails go through `sendAccountMail`: if the transport fails, the error is logged and the request answers
**502 "We could not send the email, please try again"** instead of a silent success.

- Register: the account stays `pending` with its unused activation token, so a resend (mail-002) works.
- Forgot password: the link was created but not delivered; asking again creates a new one.

Notification mails (goods review, credit requests) are best effort: a failure is logged and the action still succeeds.

## Activation (mail-002)

1. Register creates a `pending` account and mails a 24-hour activation link (`/verify-email?token=...`).
2. Opening it calls `POST /api/auth/verify-email {token}`: the account becomes `active`, `email_verified_at` is set,
   the auth cookie is returned (the user is signed in) and the page goes to the main page `/` with
   "Your account is activated". Locked or disabled accounts are verified but not activated or signed in.
3. A used, expired or replaced link answers 400 "This activation link is invalid or has expired". The page then
   offers **Resend activation email**. Signed-in pending users see the same button in a banner on every page.
4. `POST /api/auth/resend-activation` finds the account by the signed-in user or by the old link's token, marks every
   unused link as used (older links stop working) and mails a new one. Already active -> 400 "Account is already
   activated". At most one mail a minute per account (429; `ACTIVATION_RESEND_INTERVAL_MS`, 0 in the e2e run).

Open question kept from the feature notes: pending accounts can still log in (only the banner differs). The SRS
does not ask to block them, so it was not changed.

## Password links (mail-003, mail-004)

Both flows mail a 1-hour link to the same new-password form (fe/src/pages/ResetPassword.tsx). The two mails are
one template, `passwordLinkMail('reset' | 'change', ...)` in be/src/lib/mailTemplates.ts: same layout, wording
pattern and footer, only the action words differ.

| Flow | Asked from | Link | Token purpose | After saving |
|---|---|---|---|---|
| Forgot password | /forgot-password (`POST /api/auth/forgot-password {email}`) | `/reset-password?token=...` ("Set a new password") | `reset` | /login, "Password has been reset. You can now log in." |
| Change password | Profile "Change password" button, or /change-password "Send me the change-password email" (`POST /api/me/password/link`, signed in; mailed to the user's own address) | `/change-password/new?token=...` ("Change your password") | `change` | Saved in the user's own signed-in browser: /profile, "Your password has been changed" (a fresh session is started there). Anywhere else: /login, "Your password has been changed, please log in". |

`POST /api/auth/reset-password` answers `{ message, purpose, next }`; the page navigates to `next`. Older
`/reset-password?token=` change links still work: the token's purpose, not the URL, decides the outcome.

Change password flow (mail-004, SRS "Flow of change password function"):

1. The user clicks "Change password". The mail goes at once and the app shows /change-password/check-email
   ("Check your email", masked address such as `b**@example.com`, link valid 1 hour, "Resend email", "Back to profile").
2. The screen never sends mail by itself (reloading it, or opening it directly, sends nothing). Resend is limited to
   once a minute per user: 429 "Please wait a minute before asking for another email" (`PASSWORD_LINK_INTERVAL_MS`,
   default 60000, 0 in e2e). Forgot-password requests do not count toward it.
3. The link opens the change-password page; saving revokes every session (sec-003) and every older link.

Tokens live in `password_reset_tokens` (column `purpose`). Asking for a new link, and saving a new password,
mark every unused link of that user as used, so only the newest link works and none survive a change.
The form lists the password conditions (at least 8 characters, a letter, a number) and ticks them as the user
types; the server checks them again with the same messages (`passwordField` in be/src/lib/validation.ts;
fe/src/validate.ts `PASSWORD_RULES`, checked against the server text by fe/src/validate.test.ts).

Decision (mail-004, confirmed by the user on 2026-10-22): the old "current password + new password" form is gone
from the UI; changing the password always goes through the emailed link. `PUT /api/me/password` stays in the API,
deprecated, still covered by be/tests/password.change.test.ts.
