# Progress Log

## Current Verified State

- Repository root: E:\Auction_system (`/e/Auction_system` in Git Bash)
- Stack: be/ Node 20 + Express + TypeScript + Prisma 5 (PostgreSQL 16 in docker compose, host port 5436); fe/ React 18 + Vite + TS; e2e/ Playwright (Chromium)
- Schema source of truth: docs/ERD_edited.md (docs/ERD.md is the untouched original)
- Standard startup path: start Docker Desktop, then `./init.sh` (npm install + full verify). `npm run dev` runs API on :4000 and web on :5173 (Vite proxies /api)
- Standard verification path: `npm run verify` = `npm test` (vitest on DB auction_test + fe build) and `npm run e2e` (Playwright on DB auction_e2e, servers on :4100/:5180)
- Demo accounts: alice / bob / carol (customers), staff (staff), admin (admin); password `Password123!` for all (docs/accounts.md; `npm run db:seed -w be` reseeds the dev DB)
- Feature list: round 1 (14 features) archived to progress-feature-list/feature_list_1.json; round 2 (bid-003, sys-001, sys-002, sys-003, all passing) archived to progress-feature-list/feature_list_2.json. Round 3 (SRS 3.19-3.21, 11 features) is the active feature_list.json at the root
- Current blocker: none

## Session Log

### Session 001

- Date: 2026-10-16
- Goal: Bootstrap the empty be/ and fe/ and implement the full feature list end to end
- Completed (in order, one feature at a time, each committed): cust-001 login, guest-001 register, cust-002 profile, cust-003 change password, cust-004 forgot password, cust-005 credit account, sell-001 create auction, bid-001 make a bid (sell-002 was blocked on it), sell-002 cancel auction, cust-006 my auctions, bid-002 messages, cust-007 my biddings + settlement, guest-002 homepage, guest-003 search
- Verification run: ./init.sh exit 0 -> vitest 14 files / 54 tests pass, fe build ok, Playwright 14/14 pass. `npm run dev` smoke: /api/health ok via Vite proxy, alice login ok, page served
- Evidence captured: per-feature `evidence` in progress-feature-list/feature_list_1.json
- Decisions made (recorded in feature notes):
  - Email (register confirmation, password reset): SMTP when SMTP_HOST is set, otherwise in-memory dev outbox at GET /api/dev/outbox (non-production only) + console log
  - Credit: bids hold credit (users.held_balance); outbid/cancel releases; ledger rows record available balance before/after; top-ups are simulated (no payment gateway)
  - Increment: auction min_increment, else BID_INCREMENT_RULES (seeded 1/5/25)
  - Cancel allowed while upcoming/active even with bids; all holds released
  - Messages: public per-auction thread; any signed-in customer can post
  - Settlement on auction end: winner pays from hold, seller gets amount minus commission, reserve not met -> hold released. (Round 2: tiered commission and hourly jobs, see Session 003)
  - Homepage "just completed" = ended in the last 7 days; cancelled auctions hidden publicly
- Known risk or unresolved issue:
  - `prisma generate` can hit EPERM on Windows while a node process holds the query-engine DLL; test resets use --skip-generate. Stop running servers before `npm install`.
  - No image upload: auctions take an optional image URL.
  - Pending (unverified-email) users can still log in; only the badge differs.
  - e2e specs share one DB per run; specs use fresh users/unique names, and balance checks are relative.
  - progress-feature-list/feature_list.json is an older template (chat features) that was already there; left untouched.
- Next best step: write a new feature_list.json for the next scope (e.g. image upload, real payments, admin/category management, realtime bid updates).

### Session 002

- Date: 2026-10-16
- Goal: Write the round 2 feature list from the new requirements (bid increment ladder; System start and close auction)
- Completed: feature_list.json with bid-003 (tiered increment, priority 1), sys-001 (hourly start job), sys-002 (hourly close job + settlement), sys-003 (tiered commission 10/5/2/1%)
- Verification run: feature_list.json parses; no code changed
- Open decisions (in feature notes): increment tiers above $50 are assumed; whether per-auction min_increment can go below the ladder; whether to keep per-request settlement alongside the hourly job; spec 'new'/'close' mapped to 'upcoming'/'ended'
- Next best step: start bid-003

### Session 003

- Date: 2026-10-16
- Goal: bid-003 price-tiered bid increment
- Completed: ladder in be/src/lib/increments.ts (single source of truth, used by nextMinBid); seed rewrites bid_increment_rules to the ladder; per-auction min_increment can only raise the step; create-auction hint text updated
- Verification run: ./init.sh baseline green before work; after: vitest 70/70, fe build ok, Playwright 15/15
- Decisions: tiers above $50 taken as written in feature_list (still an assumption to confirm with the product owner); min_increment raise-only applied
- Known: the dev DB keeps the old 1/5/25 rows until `npm run db:seed -w be` is run (the API no longer reads the table, so behavior is already correct)
- Next best step: sys-001 hourly start job

### Session 003 (cont.) sys-001

- Completed: be/src/lib/jobs.ts startDueAuctions (single UPDATE, idempotent); be/src/lib/scheduler.ts generic interval scheduler (default 1h, AUCTION_JOB_INTERVAL_MS, runs once at startup, no overlapping runs); wired in server.ts; dev route GET /api/dev/auctions/:id/raw exposes the stored status; e2e API server runs jobs every 1s
- Verification: vitest 76/76, be tsc ok, Playwright 16/16
- Note: effectiveStatus still derives 'active' at read time, so the UI is correct between hourly runs; the job keeps the stored status in step
- Decision from user (2026-10-17): keep going through sys-002, sys-003. sys-002 open decision not answered explicitly; applying the recommended option (hourly job + keep per-request settlement safety net)
- Next best step: sys-002

### Session 003 (cont.) sys-002

- Completed: close-auctions job in the scheduler (closeDueAuctions now drains all due auctions in batches, returns count settled); removed the 5s closer from server.ts; per-request settlement kept behind config.settleOnRequest (SETTLE_ON_REQUEST=0 turns it off)
- Bug found and fixed: GET /api/auctions "just completed" filtered on stored status 'ended'; now end_time in [now-7d, now] and not cancelled
- Verification: vitest 83/83, Playwright 17/17
- Finding: with SETTLE_ON_REQUEST=0 the UI shows 'no winner'/'lost' until the next job tick (cust-007 and guest-002 e2e fail that way). This is why the safety net stays on; e2e runs the production config
- Next best step: sys-003 tiered commission

### Session 003 (cont.) sys-003 and wrap-up

- Completed: be/src/lib/commission.ts tiered 10/5/2/1% (half-up to cents) used by settleAuction; payout ledger text shows amount and rate
- Fixed a pre-existing race in e2e/guest-003-search.spec.ts (read results before the new search rendered)
- Verification: ./init.sh exit 0 -> vitest 18 files / 93 tests, fe build ok, Playwright 18/18
- All round 2 features passing; feature list archived to progress-feature-list/feature_list_2.json
- Still unconfirmed with product owner: increment tiers above $50; $10,000 exactly treated as 1%
- Next best step: write a round 3 feature_list.json at the root (CLAUDE.md startup expects one)

### Session 004

- Date: 2026-10-18
- Goal: Write the round 3 feature list from SRS.txt (3.19 Staff statistics and report, 3.20 Admin user management, 3.21 Admin security)
- Completed: feature_list.json with 11 features, scoped to the Staff and Admin roles: sec-001 one login page with role-based landing, sec-002 role permissions, adm-001..005 user list/view, add, edit, delete, password, stf-001..004 statistics filter, Excel export, chart, revenue/customer stats (optional)
- Verification run: feature_list.json parses; no code changed
- Open decisions (in feature notes): which date the statistics range filters on (assumed start_time); soft delete for users; admin-created accounts skip email verification
- Next best step: start sec-001

### Session 005

- Date: 2026-10-18
- Goal: start round 3; sec-001 one login page with role-based landing
- Startup: baseline ./init.sh first failed with Prisma EPERM because `npm run dev` was running and held the query-engine DLL; stopped those node processes, rerun green (93 vitest, fe build, 18 Playwright). Committed the round 3 feature list and the DB port change 5433 -> 5436 as a baseline commit
- Completed sec-001: role carried in the JWT and req.user (tokens without a role read as customer); seed adds staff and admin accounts (docs/accounts.md); fe homeFor(role) landing after login; RequireAuth takes optional roles and shows a 'Not allowed' page; nav shows customer links only to customers, Statistics to staff, Users to admin; placeholder pages /staff/statistics and /admin/users (filled by stf-* and adm-*)
- Verification: ./init.sh exit 0 -> vitest 19 files / 98 tests, fe build ok, Playwright 19/19
- Note: e2e cust-002 renames carol, so later specs must not assert on carol's full name
- Not yet done: API-level role enforcement is sec-002 (role currently only in token/UI; staff/admin can still call customer APIs)

### Session 005 (cont.) sec-002

- Completed: permissions/role_permissions tables (migration with default grants), be/src/lib/permissions.ts, requirePermission(code) middleware (re-reads role and status from DB each request; locked/disabled/deleted -> 401), /api/admin/permissions matrix + PUT /api/admin/roles/:role/permissions/:code (admin keeps user.manage and permission.manage), user payload includes permissions; fe guards and nav by permission (can()), /admin/permissions matrix page
- Decision: admin does not hold report.* by default (keeps sec-001 nav: admin sees Users and Permissions, not Statistics); admin can grant them
- Verification: npm run verify exit 0 -> vitest 106, fe build, Playwright 20/20
- Noise, not a failure: e2e server logs 'job ... failed: table does not exist' during globalSetup's migrate reset (1s job ticks while tables are dropped); next tick succeeds

### Session 005 (cont.) adm-001

- Completed: be/src/routes/adminUsers.ts mounted at /api/admin/users (requirePermission user.manage): list with q/role/status/page/pageSize (deleted hidden unless status=deleted), detail with counts; fe pages AdminUsers (filters in URL, pager) and AdminUserDetail
- Verification: npm run verify exit 0 -> vitest 113, fe build, Playwright 21/21

### Session 005 (cont.) adm-002

- Completed: POST /api/admin/users (status active, email verified immediately - assumption from feature notes still to confirm); fe /admin/users/new form with client + server validation
- Verification: npm run verify exit 0 -> vitest 119, fe build, Playwright 22/22

### Session 005 (cont.) adm-003

- Completed: PATCH /api/admin/users/:id (email, fullName, phone, address, role, status active|locked; strict schema; self role/status change 400); login rejects locked accounts; requireAuth/optionalAuth re-read role+status from DB on every request so lock and role changes apply immediately (one extra indexed query per authed request); fe AdminUserEdit form on the detail page
- Verification: npm run verify exit 0 -> vitest 124, fe build, Playwright 23/23
- Next best step: adm-004 delete a user (soft delete)
