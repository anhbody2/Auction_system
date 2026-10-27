# Session Handoff

State: round 1 (14 features) and round 2 (bid-003, sys-001, sys-002, sys-003) are passing and archived to
`progress-feature-list/feature_list_1.json` and `feature_list_2.json`.
Round 3 (SRS 3.19-3.21: staff statistics, admin users, security; 11 features) is passing and archived to `progress-feature-list/feature_list_3.json`.
Rounds 4-6 are passing and archived to `progress-feature-list/feature_list_4.json` .. `feature_list_6.json` (round 6: buyer column, transaction search, new tag, staff auctions/goods/credit, Axios, Gmail OAuth2 mail).
Round 7 is passing and archived to `progress-feature-list/feature_list_7.json`: rotating refresh tokens (sec-003,
docs/session-tokens.md), idle tracking hook and 30-minute idle logout with a warning (sec-004/005,
docs/idle-logout.md), real-time approval queues for staff and requesters (stf-009/010, docs/realtime.md), change
password by emailed link + check-mail screen (mail-004, docs/mail.md).
Round 8 is passing and archived to `progress-feature-list/feature_list_8.json`: the customer UI redesign from the
'Auction Mockups' design (14 features ui-0.1 .. ui-3b.2): tokens / Mulish / new top bar, browse cards + chips/sort +
quick bid, lot page layout + bid panel + chart/live history, dashboard credit cards + goods owned + My auctions, bid
history totals + tabs/search, credit request form + transactions panel. Design system: docs/design-system.md;
per-feature notes: docs/changes/ui-*.md. Defaults applied without user confirmation are listed in each feature's
evidence (brand stays BidHouse, quick bid keeps a confirm, 'Pending payout' card shows pending requests).
Round 9 is passing and archived to `progress-feature-list/feature_list_9.json`: homepage from SRS 'system - Ui
change' + mockup 1a: 'Trending lots' (live lots only, most bids first; no upcoming section) and 'Just completed'
(the 8 newest closed lots, API `justCompletedLimit: 8`, no day window). Notes: docs/changes/home-*.md,
docs/design-system.md 'Homepage'. Defaults applied without explicit confirmation are in feature_list_9.json
readings_to_confirm.
Mail: real Gmail settings live only in be/.env (docs/mail.md); vitest and Playwright blank them so tests use the dev outbox.
Note: root package.json `overrides` pin is-generator-function/is-async-function so tsx can load exceljs on Node 20.19+ (see claude-progress Session 005 stf-002).
`./init.sh` exits 0 (be 362 + fe 162 vitest, fe build, 102 Playwright; 2026-10-27). Stop any running `npm run dev` first (Prisma DLL lock on Windows).

## Restart path

1. Start Docker Desktop. `docker compose up -d --wait db` (also done by npm scripts)
2. `./init.sh`, or `npm install && npm run verify`
3. `npm run dev`, then open http://localhost:5173 (alice / bob / carol / staff / admin, `Password123!`; see docs/accounts.md)

## Map

| Area | Backend | Frontend | Tests |
|---|---|---|---|
| Auth, register, reset | be/src/routes/auth.ts | pages/Login, Register, VerifyEmail, ForgotPassword, ResetPassword | auth.*, password.* |
| Profile, password | be/src/routes/me.ts | pages/Profile, ChangePassword | profile, password.change |
| Credit ledger | be/src/lib/credit.ts, routes/credit.ts | pages/Credit | credit |
| Auctions | be/src/lib/auctions.ts, routes/auctions.ts | pages/CreateAuction, AuctionDetail, MyAuctions, Home | auction.*, my-auctions, homepage, search |
| Bids, cancel, my bids | be/src/routes/bids.ts | components/BidPanel, CancelAuction; pages/MyBiddings | bid.place, auction.cancel, my-bids |
| Bid increment ladder | be/src/lib/increments.ts | pages/CreateAuction (hint) | bid.increment |
| Scheduler (start/close jobs, hourly; AUCTION_JOB_INTERVAL_MS) | be/src/lib/scheduler.ts, lib/jobs.ts | n/a | job.start, job.close |
| Settlement (+ per-request safety net, SETTLE_ON_REQUEST=0 disables) | be/src/lib/settlement.ts, lib/commission.ts | n/a | my-bids, job.close, commission |
| Messages | be/src/routes/messages.ts | components/Messages | messages |
| Roles, role landing (sec-001) | be/src/middleware/auth.ts (role in JWT) | auth.tsx homeFor, RequireAuth roles; pages/StaffStatistics, AdminUsers | sec.login-roles, e2e sec-001 |
| Permissions (sec-002) | be/src/lib/permissions.ts, middleware/auth.ts requirePermission, routes/admin.ts | auth.tsx can(); pages/AdminPermissions | sec.permissions, e2e sec-002 |
| Admin users (adm-*) | be/src/routes/adminUsers.ts | pages/AdminUsers, AdminUserDetail | admin.users.*, e2e adm-* |
| Staff statistics (stf-*) | be/src/lib/statistics.ts, routes/staff.ts | pages/StaffStatistics | staff.*, e2e stf-* |
| Sessions, refresh tokens (sec-003) | be/src/lib/session.ts, routes/auth.ts | api.ts refreshSession, store/authedStream.ts | auth.refresh/logout/revoke, e2e sec-003 |
| Idle logout (sec-004/005) | (logout reason 'idle') | idle.ts, useIdleTimer.ts, idleSession.ts, components/IdleWarning.tsx, auth.tsx | idle.test, idleSession.test, e2e sec-004/005 |
| Approval realtime (stf-009/010) | lib/approvalEvents.ts, routes/staffApprovals.ts | store/approvalsSlice.ts, useStaffEvents.ts, useUserEvents.ts, requestToasts.ts | staff.events, staff.pending-counts, goods.review-events, e2e stf-009/010 |
| Dev helpers | be/src/routes/dev.ts (outbox, expire auction) | n/a | used by e2e |

To start new work, create a fresh `feature_list.json` at the root (CLAUDE.md startup expects it) and record progress with `node scripts/feature.js <id> <status> "evidence..."`.
