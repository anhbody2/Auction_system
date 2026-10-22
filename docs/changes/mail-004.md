# mail-004 change password = emailed link + check-mail screen

SRS: System - Flow of change password function (Req-1 check-mail screen; Req-2 mail with a link to the change
password page, same template as forgot password). Design: docs/mail.md "Password links".

| File | Change |
|---|---|
| be/src/lib/mailTemplates.ts | One `passwordLinkMail('reset' \| 'change')` builder; `resetPasswordMail` / `changePasswordMail` call it. |
| be/src/config.ts | `passwordLinkIntervalMs` (`PASSWORD_LINK_INTERVAL_MS`, default 60 s). |
| be/src/routes/me.ts | `POST /me/password/link`: once a minute (429), link is `/change-password/new?token=`. `PUT /me/password` marked deprecated. |
| be/src/routes/auth.ts | `POST /auth/reset-password` takes the optional session: a change saved in the owner's signed-in browser starts a new session and answers `next: '/profile'`; elsewhere `next: '/login'` ("..., please log in"). Reset answers `next: '/login'`. |
| fe/src/maskEmail.ts (+ test) | Masked address for the check-mail screen. |
| fe/src/pages/ChangePassword.tsx | `useSendChangeLink`, `ChangePasswordButton`, `CheckEmailPage` (/change-password/check-email); /change-password is a single "Send me the change-password email" action; current-password form removed. |
| fe/src/pages/Profile.tsx | "Change password" is a button that sends the mail and opens the check-mail screen. |
| fe/src/pages/ResetPassword.tsx | `mode` 'change' (title "Change your password", button "Change password"); navigates to the server's `next`. |
| fe/src/App.tsx | Routes /change-password/check-email (signed in) and /change-password/new (public). |
| fe/src/styles.css | `.check-mail-actions` replaces the unused `.link-box`. |
| playwright.config.ts | `PASSWORD_LINK_INTERVAL_MS=0` for e2e. |
| e2e/helpers.ts | `outboxCount`, `latestPasswordLink` (both link forms). |
| be/tests/password.change-flow.test.ts | New: link URL + shared template, 429 limit, older link dies, session outcome per browser, one-template check. |
| be/tests/password.change-link.test.ts | Link regex accepts /change-password/new; signed-out save now answers "please log in" / `next: '/login'`. |
| e2e/mail-004-change-password-flow.spec.ts | New. |
| e2e/cust-003-change-password.spec.ts, e2e/mail-003-password-links.spec.ts | Updated to the emailed-link flow (old password fails / new works kept; wrong current password stays covered by be/tests/password.change.test.ts). |
| docs/mail.md, docs/session-tokens.md | Flow, routes, decision. |
