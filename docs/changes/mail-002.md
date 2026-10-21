# mail-002 activation link activates, signs in and redirects

SRS: Customer - Mail services 3.7.3 REQ-1, REQ-2. Rules: docs/mail.md "Activation".

| File | Change |
|---|---|
| be/src/routes/auth.ts | `verify-email` signs the user in and returns "Your account is activated"; new `resend-activation` (by session or old token, invalidates older links, 400 when active, once a minute). |
| be/src/config.ts, playwright.config.ts | `ACTIVATION_RESEND_INTERVAL_MS` (default 60 s; 0 for e2e). |
| fe/src/pages/VerifyEmail.tsx | Success -> refresh session, go to `/` with the notice; failure -> error + resend. |
| fe/src/components/ResendActivation.tsx | New resend button. |
| fe/src/components/Layout.tsx, fe/src/styles.css | Pending-account banner with resend; one-off page notice from navigation state. |
| be/tests/auth.activation.test.ts, e2e/mail-002-activation.spec.ts | New. |
| e2e/guest-001-register.spec.ts | After the link, erin is signed in on `/` with "Your account is activated" (was "Email confirmed" + manual log in); the log-in check stays. |

E2E note: the verification text says "open the same link again and see the error and resend button; resend and use
the new link". Once a link has activated the account a resend is (by the unit rule) "already activated", so the
spec checks the resend-and-use path with a replaced link before activation, and the reopen-after-activation path ends
with "Account is already activated".
