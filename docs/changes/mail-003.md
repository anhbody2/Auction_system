# mail-003 forgot and change password by emailed link

SRS: Customer - Mail services 3.7.3 REQ-1, REQ-2, REQ-3. Rules: docs/mail.md "Password links".

| File | Change |
|---|---|
| be/prisma/schema.prisma, migrations/20261021200000_password_link_purpose | `password_reset_tokens.purpose` (reset / change). |
| be/src/routes/me.ts | `POST /api/me/password/link`: change link mailed to the user's own address. |
| be/src/routes/auth.ts | Reset answers with `purpose` and kills every older unused link of the user. |
| fe/src/validate.ts | `PASSWORD_RULES` (label, message, test) shared by the rules and the checklist. |
| fe/src/components/PasswordRules.tsx | New live checklist. |
| fe/src/pages/ResetPassword.tsx | Checklist; redirect to /login (reset) or /profile (change) with the message. |
| fe/src/pages/ChangePassword.tsx | "Send me a change-password link" first; the current-password form kept below ("Or change it now") with the checklist. |
| be/tests/password.change-link.test.ts, fe/src/validate.test.ts, e2e/mail-003-password-links.spec.ts | New. |

cust-003 and cust-004 pass unchanged. The e2e uses two fresh accounts instead of seeded bob and carol, because
changing a seeded password would break the other specs that log in as them.
