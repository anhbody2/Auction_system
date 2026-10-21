# Account email (mail-001, mail-002, mail-003)

## Transport

The transport is chosen from the environment each time a mail is sent (be/src/lib/mailer.ts `mailSettings`):

| Settings in be/.env | Transport | From |
|---|---|---|
| `GMAIL_USER` and `GMAIL_APP_PASSWORD` | Gmail SMTP (`service: 'gmail'`, smtp.gmail.com:465, TLS) | `MAIL_FROM_NAME <GMAIL_USER>` (default name "BidHouse") |
| `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) | Any SMTP server | `MAIL_FROM` |
| neither | Dev outbox: kept in memory, readable at `GET /api/dev/outbox?to=<email>` (not in production), logged to the console | - |

Tests and local dev run without credentials, so they use the outbox. **Never commit be/.env**: it is gitignored,
and be/.env.example lists the variable names only.

### Setting up Gmail

1. Use a Gmail account for the app (for example a dedicated `bidhouse.yourname@gmail.com`).
2. Turn on 2-Step Verification for that account (Google Account → Security).
3. Create an app password: Google Account → Security → 2-Step Verification → App passwords. Pick any name
   ("BidHouse"). Google shows a 16-character password once.
4. In be/.env set:
   ```
   GMAIL_USER=bidhouse.yourname@gmail.com
   GMAIL_APP_PASSWORD=abcdabcdabcdabcd
   APP_URL=http://localhost:5173
   ```
   `APP_URL` is the site address put into the links.
5. Restart the API. Register with a real address you can read: the activation mail arrives from the Gmail account.

Gmail limits sending (about 500 mails a day for a normal account). OAuth2 is not used; an app password is
enough for this project.

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

## Password links (mail-003)

Both flows mail a 1-hour link to the same new-password form (`/reset-password?token=...`):

| Flow | Asked from | Token purpose | After saving |
|---|---|---|---|
| Forgot password | /forgot-password (`POST /api/auth/forgot-password {email}`) | `reset` | Log in page, "Password has been reset. You can now log in." |
| Change password | /change-password, "Send me a change-password link" (`POST /api/me/password/link`, signed in; mailed to the user's own address) | `change` | Profile page, "Your password has been changed" |

Tokens live in `password_reset_tokens` (new column `purpose`). Asking for a new link, and saving a new password,
mark every unused link of that user as used, so only the newest link works and none survive a change.
The form lists the password conditions (at least 8 characters, a letter, a number) and ticks them as the user
types; the server checks them again with the same messages (`passwordField` in be/src/lib/validation.ts;
fe/src/validate.ts `PASSWORD_RULES`, checked against the server text by fe/src/validate.test.ts).

Decision: the old "current password + new password" form stays on /change-password under the link button
("Or change it now"). The SRS only requires the link; keeping the form costs nothing and cust-003 still covers it.
