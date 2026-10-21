# mail-001 account emails through Gmail

SRS: Customer - Mail services 3.7.1; 3.7.3 REQ-1. Setup and rules: docs/mail.md.

| File | Change |
|---|---|
| be/src/lib/mailer.ts | `mailSettings` (Gmail > SMTP > outbox, read at send time), `sendMail` with HTML, `sendAccountMail` (502 on failure), `setMailTransport` for tests. |
| be/src/lib/mailTemplates.ts | New: activation, reset-password, change-password templates (HTML button + text link). |
| be/src/routes/auth.ts | Register and forgot password use the templates and `sendAccountMail`. |
| be/.env.example | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME` (empty; no secret committed). |
| be/tests/mailer.gmail.test.ts | New. |
| docs/mail.md | New. |
