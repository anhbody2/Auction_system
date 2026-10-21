# mail-001 account emails through Gmail (Nodemailer + OAuth 2.0)

SRS: Customer - Mail services 3.7.1; 3.7.3 REQ-1. Setup and rules: docs/mail.md.

| File | Change |
|---|---|
| be/src/lib/mailer.ts | `mailSettings` (Gmail OAuth2/XOAUTH2 > SMTP > outbox, read at send time), `sendMail` with HTML, `sendAccountMail` (502 on failure), `setMailTransport` for tests. |
| be/src/lib/mailTemplates.ts | New: activation, reset-password, change-password templates (HTML button + text link). |
| be/src/routes/auth.ts | Register and forgot password use the templates and `sendAccountMail`. |
| be/.env.example | `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `MAIL_FROM_NAME` (empty; no secret committed). |
| be/tests/mailer.gmail.test.ts | New. |
| docs/mail.md | New. |

Rule change (user, 2026-10-21): Gmail is used through Nodemailer with OAuth 2.0 (XOAUTH2: client ID, client secret,
refresh token) instead of an app password. The app-password mode from commit a5658b9 was removed; with only
`GMAIL_USER` + `GMAIL_APP_PASSWORD` set the API now uses the dev outbox. docs/mail.md has the Google Cloud setup.

Test isolation (2026-10-21, after real credentials were added to be/.env):

| File | Change |
|---|---|
| be/vitest.config.ts | Blank `GMAIL_*` and `SMTP_HOST` in the test env. `src/config.ts` loads be/.env through dotenv, which does not override keys that are already set, so tests stay on the in-memory outbox instead of sending real mail (it caused 20s timeouts). |
| playwright.config.ts | Same blanks for the e2e API server; specs read links from the dev outbox. |
