# Session Handoff

State: round 1 (14 features) and round 2 (bid-003, sys-001, sys-002, sys-003) are passing and archived to
`progress-feature-list/feature_list_1.json` and `feature_list_2.json`.
Round 3 (SRS 3.19-3.21: staff statistics, admin users, security) is the active `feature_list.json`; sec-001, sec-002, adm-001 passing.
`./init.sh` exits 0 (98 vitest + fe build + 19 Playwright). Stop any running `npm run dev` first (Prisma DLL lock on Windows).

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
| Dev helpers | be/src/routes/dev.ts (outbox, expire auction) | n/a | used by e2e |

To start new work, create a fresh `feature_list.json` at the root (CLAUDE.md startup expects it) and record progress with `node scripts/feature.js <id> <status> "evidence..."`.
