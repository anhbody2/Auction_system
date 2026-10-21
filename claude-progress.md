# Progress Log

## Current Verified State

- Repository root: E:\Auction_system (`/e/Auction_system` in Git Bash)
- Stack: be/ Node 20 + Express + TypeScript + Prisma 5 (PostgreSQL 16 in docker compose, host port 5436); fe/ React 18 + Vite + TS; e2e/ Playwright (Chromium)
- Schema source of truth: docs/ERD_edited.md (docs/ERD.md is the untouched original)
- Standard startup path: start Docker Desktop, then `./init.sh` (npm install + full verify). `npm run dev` runs API on :4000 and web on :5173 (Vite proxies /api)
- Standard verification path: `npm run verify` = `npm test` (vitest on DB auction_test + fe build) and `npm run e2e` (Playwright on DB auction_e2e, servers on :4100/:5180)
- Demo accounts: alice / bob / carol (customers), staff (staff), admin (admin); password `Password123!` for all (docs/accounts.md; `npm run db:seed -w be` reseeds the dev DB)
- Feature list: round 1 (14 features) archived to progress-feature-list/feature_list_1.json; round 2 (bid-003, sys-001, sys-002, sys-003, all passing) archived to progress-feature-list/feature_list_2.json. round 3 (SRS 3.19-3.21: sec-001/002, adm-001..005, stf-001..004, all passing) archived to progress-feature-list/feature_list_3.json. round 4 (crd-001/002, upl-001, gds-001/002, sell-003/004, bid-004, all passing) archived to progress-feature-list/feature_list_4.json. round 5 (sell-005, rt-001, crd-003, sell-006, cmt-001, all passing 2026-10-21) archived to progress-feature-list/feature_list_5.json. round 6 active in ./feature_list.json (11 features: gds-003, sys-004, sell-007, trx-001, stf-005..008, mail-001..003, all not_started). progress-feature-list/feature_list.json is the untouched bootstrap template
- Uploads: images stored in UPLOAD_DIR (default be/uploads/, gitignored); see docs/image-upload.md
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

### Session 005 (cont.) adm-004

- Completed: DELETE /api/admin/users/:id soft delete (status 'deleted'); blocked by open auctions as seller or leading ('active') bids on open auctions; login and forgot-password treat deleted as unknown; fe DeleteUser inline confirm in the user list
- Known: a deleted user's username/email stay reserved (unique columns), so they cannot re-register with them
- Verification: npm run verify exit 0 -> vitest 129, fe build, Playwright 24/24

### Session 005 (cont.) adm-005

- Completed: PUT /api/admin/users/:id/password (registration password rules, confirm must match, invalidates open reset links); fe AdminSetPassword panel on the user detail page
- Verification: npm run verify exit 0 -> vitest 133, fe build, Playwright 25/25

### Session 005 (cont.) stf-001

- Completed: be/src/lib/statistics.ts (shared filter schema from/to/status/tz, auctionStatistics rows + summary), GET /api/staff/auctions (report.view); fe StaffStatistics page (filter form, table, totals footer); test helper insertAuction (fixed-date rows with settlement); e2e helper createSoldAuction
- Decisions: range filters on start_time (feature-list assumption); days are the client's local days via tz = getTimezoneOffset() (defaults to UTC); final price/winner only for ended auctions with a winner; commission only for settled sales
- Verification: npm run verify exit 0 -> vitest 138, fe build, Playwright 26/26

### Session 005 (cont.) stf-002

- Completed: exceljs 4.4.0 (be), be/src/lib/report.ts workbook builder (local times via tz, money formats, totals row, filter note), GET /api/staff/auctions/export (report.export); 'Export to Excel' link on the statistics page shown only with report.export
- Dependency issue found and fixed: on Node 20.19+ tsx 4.19.2 mis-transforms the 'module-sync' entry of generator-function/async-function (pulled in deep under exceljs -> unzipper), so `tsx src/server.ts` crashed with 'SyntaxError: Unexpected string' (vitest was unaffected). Root package.json overrides pin is-generator-function 1.0.10 and is-async-function 2.0.0 (same API, no module-sync deps). If tsx is upgraded later these overrides can be retried without
- Verification: npm run verify exit 0 -> vitest 142, fe build, Playwright 27/27

### Session 005 (cont.) stf-003

- Completed: dailyBuckets + GET /api/staff/auctions/summary (report.view, max 366 days); fe ColumnChart (dependency-free SVG: stacked columns, hover/focus tooltip, legend, data-table view) and StaffCharts on the statistics page; empty state when nothing matches
- Decision: no chart library (recharts was only a suggestion) - avoids another dependency after the exceljs/tsx issue; status colours are the validated reference categorical slots 1-4
- Fixed on the way: filter forms (statistics and admin users) stacked vertically because the global `form { flex-direction: column }` beat `.row`; `.filters` now sets row direction
- Verification: npm run verify exit 0 -> vitest 147, fe build, Playwright 28/28

### Session 005 (cont.) stf-004 and round 3 wrap-up

- Completed: be/src/lib/insights.ts (revenueStatistics: commission/sales of settlements settled in range; customerStatistics: customer registrations, distinct bidders and sellers, top 5 sellers and bidders by settled value), GET /api/staff/revenue and /api/staff/customers (report.view), second Excel sheet 'Revenue and customers'; fe StaffInsights tiles and top-5 lists
- Fixed on the way: e2e helper createSoldAuction now tops up bob's credit first (later specs ran him out of credit in the full suite)
- Verification: ./init.sh exit 0 -> vitest 29 files / 152 tests, fe build ok, Playwright 29/29
- All 11 round 3 features passing; feature list archived to progress-feature-list/feature_list_3.json
- Still unconfirmed with product owner (recorded in feature notes): statistics range filters on start_time; soft delete keeps username/email reserved; admin-created accounts skip email verification; revenue counts by settlement date; admin does not hold report.* by default
- Next best step: write a round 4 feature_list.json at the root (CLAUDE.md startup expects one)

### Session 006 - round 4 planning

- Completed: wrote root feature_list.json for round 4 from SRS.txt (7 features, all not_started): crd-001 credit lock/release, crd-002 'Credit'/'Locked credit' UI, upl-001 image upload + resize over 5 MB, gds-001 add/list goods, gds-002 edit/delete goods with active/sold guard, sell-003 auction from existing goods, sell-004 start date + duration (1 h - 30 d)
- Found: outbid release and pay-from-held at close already exist (bids.ts, settlement.ts); crd-001 is mostly verification and docs
- Unconfirmed with product owner: reading of the 'System UI' credit wording (crd-002 notes)
- Open: fe/src/pages/CreateAuction.tsx has an uncommitted change removing the minimum increment field; not mine, left untouched (see sell-003 notes)
- Not run this session: ./init.sh (planning only, no code changed)
- Next best step: start crd-001

### Session 006 (cont.) drop min-increment (user request, outside the feature list)

- Baseline before the change: vitest 152/152, fe build ok, Playwright 28/29 - sell-001 failed because the user's uncommitted CreateAuction.tsx edit had removed the 'Minimum increment' field the spec fills
- Completed: migration 20261020040000_drop_min_increment, ladder-only nextMinBid, field removed from API/UI/types/helpers; tests expecting a $10 step at $100 moved to the ladder's $5; details in docs/changes/drop-min-increment.md
- Note: init.sh's npm install fails with EPERM on prisma generate while `npm run dev` is running (Windows locks the query engine DLL). Stop the dev server first
- Verification: npm run verify exit 0 -> vitest 29 files / 152 tests, fe build ok, Playwright 29/29

### Session 006 (cont.) crd-001

- Completed: be/tests/credit.lock.test.ts, be/tests/credit.close.test.ts, e2e/crd-001-credit-lock.spec.ts, docs/credit-model.md, docs/changes/crd-001.md
- Finding: the behaviour already existed (bids.ts outbid release, settlement.ts pay-from-held at close); no app code change. A temporary break of the outbid release made 3/4 lock tests fail, so the tests do catch it
- Verification: npm run verify exit 0 -> vitest 31 files / 159 tests, fe build ok, Playwright 30/30
- Next best step: crd-002 (UI labels); needs the product owner to confirm the label reading in its notes

### Session 007 - crd-002 (and bid-004 added)

- Date: 2026-10-20
- Startup: Docker Desktop was not running; started it. Baseline ./init.sh exit 0 (vitest 159, fe build, Playwright 30/30)
- Found: SRS.txt (uncommitted user edit, left uncommitted along with CLAUDE.md) has a new section 'DB - increment bidding rules' not in the feature list. Added bid-004 (not_started, priority 8) with the gaps ($0-1, $50-100) recorded as an assumption
- Completed crd-002: header pill, dashboard, /credit and bid panel show 'Credit' (balance) and 'Locked credit' (held, captioned 'Held in active bids'); no 'Available credit' label. Ledger balance_before/after now store the credit balance (be/src/lib/credit.ts), so hold/release rows leave it unchanged; rows written before keep the old 'available' meaning
- Verification: ./init.sh exit 0 -> vitest 32 files / 162 tests, fe build ok, Playwright 31/31
- Unverified: header with two pills was not checked at phone width (no layout test)
- Still unconfirmed with product owner: the crd-002 label reading; bid-004 gap steps
- Next best step: upl-001 (check that sharp installs on Windows + Node 20 first)

### Session 007 (cont.) upl-001

- User confirmed the crd-002 label reading and the bid-004 gap steps ($0.05 under $1, $2.50 for $50-100); recorded in the feature notes
- Completed: multer 2.0.2 + sharp 0.33.5 (sharp checked under node and tsx on Node 20.20 first: works); be/src/lib/images.ts (fitImage, storeImage, isStoredUpload), POST /api/uploads, /uploads static serving; auctions.imageUrl now only accepts this server's uploads; fe ImageUpload component on the create-auction form (replaces the Image URL field until sell-003)
- Storage: UPLOAD_DIR, default be/uploads/ (gitignored); e2e uses be/uploads/e2e; vitest uses a temp dir
- Verification: npm run verify exit 0 -> vitest 34 files / 174 tests, fe build ok, Playwright 33/33
- Note: ./init.sh failed at npm install (EPERM, Prisma DLL) because the user's `npm run dev` was running; not stopped. The running Vite dev server needs a restart to pick up the new /uploads proxy
- Known gaps: unused uploads are never cleaned up; image still optional on the auction form (required comes with gds-001)
- Next best step: gds-001 (My goods page; reuse ImageUpload with max > 1 and isStoredUpload)

### Session 007 (cont.) gds-001

- Completed: be/src/lib/goods.ts (derived status, schema, refs check), POST /api/goods, GET /api/me/goods; fe My goods page (/goods), Add goods (/goods/new) with shared GoodsForm and ImageUpload (1-8 images); e2e helpers createGoodsViaApi/uploadImageViaApi
- Verification: npm run verify exit 0 -> vitest 36 files / 181 tests, fe build ok, Playwright 34/34
- Known: uploads are not tied to a user (a seller could reuse another user's upload URL if they knew it)

### Session 007 (cont.) gds-002

- Completed: GET/PATCH/DELETE /api/goods/:id (owner only, 404 otherwise; 409 in auction or sold; soft delete); goods row locked FOR UPDATE during the check (lockOwnGoods/lockChangeableGoods) so sell-003 can take the same lock; fe Edit/Delete actions with inline confirm and disabled + reason, /goods/:id/edit
- Verification: npm run verify exit 0 -> vitest 38 files / 191 tests, fe build ok, Playwright 35/35

### Session 007 (cont.) sell-003

- Completed: POST /api/auctions takes goodsId (locks goods with lockOwnGoods; 404 not own, 409 in auction/sold), no goods creation, imageUrl ignored; fe goods picker with preview and prefilled name/description, Add goods link when nothing is available, "Auction it" on My goods
- Test helpers: be createAuction/createGoodsFor and e2e createAuctionViaApi add goods first; categoryId/condition overrides go to the goods (search tests unchanged)
- Verification: npm run verify exit 0 -> vitest 38 files / 194 tests, fe build ok, Playwright 37/37

### Session 007 (cont.) sell-004

- Completed: be/src/lib/duration.ts; POST /api/auctions takes startTime + duration {value, unit hours|days} (1 h - 30 d), rejects endTime, stores end_time = start + duration; fe Duration amount/unit boxes with live "Ends ..." and client check
- All test callers moved from endTime to duration
- Verification: npm run verify exit 0 -> vitest 39 files / 199 tests, fe build ok, Playwright 38/38

### Session 007 (cont.) bid-004 and round 4 wrap-up

- Completed: INCREMENT_LADDER = $0.05 <$1, $0.50 $1-10, $1 $10-50, $2.50 $50-100, $10 $100-1000, $100 >= $1000; data migration 20261020120000_bid_increment_rules_srs rewrites bid_increment_rules; ladder hint on the create form; tests moved from the $5 to the $10 step at $100
- Verification: npm run verify exit 0 -> vitest 39 files / 201 tests, fe build ok, Playwright 39/39
- ./init.sh stopped at npm install (EPERM on the Prisma query engine DLL) because the user's `npm run dev` was running all session; the install itself completed and verify ran directly. Re-run ./init.sh with the dev server stopped to confirm the full path
- All 8 round 4 features passing; feature list archived to progress-feature-list/feature_list_4.json
- The running dev server needs a restart: new migration (bid rules) is applied by `prisma migrate deploy` at dev start, and Vite needs the new /uploads proxy
- Known gaps: unused uploads are never deleted; uploads are not tied to a user; server error messages format money without thousands separators
- Next best step: write a round 5 feature_list.json when SRS.txt gets new requirements

### Session 008 - round 5 start, sell-005

- Date: 2026-10-21
- Startup: ./init.sh failed at npm install (EPERM on the Prisma query engine DLL; the user's `npm run dev` is running on :4000/:5173, not stopped). Baseline `npm run verify` exit 0: vitest 39 files / 201 tests, fe build ok, Playwright 39/39
- Completed sell-005: POST /api/auctions/:id/cancel lets the seller cancel only while start_time is in the future (checked on start_time, not just status); admin (role check, not a grantable permission) cancels upcoming or active; release logic unchanged. fe CancelAuction: seller button only while upcoming, admin sees 'Cancel auction (admin)'. Rules in docs/auction-cancel.md
- Tests updated, not weakened: sell-002 unit + e2e rewritten for the new rules; fixture cancels of started auctions in 5 vitest files and cust-007 e2e now done by the admin; cust-006 fixture created upcoming
- Verification: npm run verify exit 0 -> vitest 40 files / 206 tests, fe build ok, Playwright 40/40
- Not verified: ./init.sh end to end (blocked by the running dev server, same as session 007). The running Vite dev server picks up the fe change by HMR; the API needs no restart beyond tsx watch
- Uncommitted user edits left alone: CLAUDE.md, SRS.txt (fe/tsconfig.tsbuildinfo is a build artefact)
- Next best step: rt-001 (Redux Toolkit store + SSE real-time bids)

### Session 008 (cont.) rt-001

- Completed: SSE stream GET /api/auctions/:id/events (be/src/lib/events.ts in-process bus; bid event published after the bid transaction commits and also returned by the POST); fe Redux Toolkit store (fe/src/store/: auction slice, typed hooks, useAuctionEvents with reload on reconnect); AuctionDetail/BidPanel/BidHistory read the store; panel shows leading/outbid. Details in docs/realtime.md
- Deps: @reduxjs/toolkit 2.3.0, react-redux 9.1.2, fe dev vitest 2.1.5 (installed with --ignore-scripts because the dev server locks the Prisma DLL). Root `npm test` now also runs `npm test -w fe`
- Verification: npm run verify exit 0 -> be vitest 42 files / 211 tests, fe vitest 8 tests, fe build ok, Playwright 41/41. Mutation check: rt-001 e2e fails with the EventSource disabled
- Known limits: one API process only (EventEmitter bus); no Last-Event-ID replay (reload on reconnect instead); navbar credit still from the auth context (crd-003)
- The user's running Vite dev server may need a restart to pre-bundle the new Redux packages
- Next best step: crd-003 (credit slice + per-user event stream)

### Session 008 (cont.) crd-003

- Completed: per-user SSE GET /api/me/events ('outbid' with releasedAmount after a bid commits; 'auction-finished' after settlement and after cancel, once per involved user); bid POST returns `released`; fe credit slice (creditSlice, useCreditSync/useCredit, useUserEvents); header, dashboard, bid panel read it; BidPanel no longer calls refresh() after a bid; /credit deposits update the slice at once
- Verification: npm run verify exit 0 -> be vitest 43 files / 215 tests, fe vitest 15 tests, fe build ok, Playwright 42/42
- Decision: auction-finished also on cancel (credit unchanged, locked refetched); recorded in docs/credit-model.md
- Known: a user's second tab is not told about bids made in the first (its locked credit catches up on the next auction-finished or reload)
- Next best step: sell-006 (available goods only in the create-auction dropdown)

### Session 008 (cont.) sell-006

- Completed: GET /api/me/goods?status=available|in_auction|sold (derived status); create-auction page lists only available goods, 'That goods item is not available for a new auction' for ?goodsId= links to busy/sold/foreign goods
- Discrepancy recorded: verification text says the server rejects busy/sold goods with 400; the existing sell-003 contract is 409 and was kept
- Verification: npm run verify exit 0 -> be vitest 43 files / 216 tests, fe vitest 15, fe build ok, Playwright 43/43
- Next best step: cmt-001 (comments close with the auction)

### Session 008 (cont.) cmt-001 and round 5 wrap-up

- Completed: POST /api/auctions/:id/messages refuses ended (computed) or cancelled auctions with 400 'Comments are closed for this auction'; 'closed' event on the auction stream after settlement and cancel; Messages shows 'Comments are closed', hides the box, 'Log in to comment' for guests while open
- Verification: npm run verify exit 0 -> be vitest 43 files / 220 tests, fe vitest 2 files / 15 tests, fe build ok, Playwright 45/45
- All 5 round 5 features passing; feature list archived to progress-feature-list/feature_list_5.json
- Not verified this session: ./init.sh end to end (its npm install hits EPERM on prisma generate while the user's `npm run dev` holds the DLL). Stop the dev server and run ./init.sh to confirm. The running dev server also needs a restart for the new Redux packages and API routes (tsx watch reloads the API by itself)
- Open points for the product owner: busy/sold goods on create stay 409 (verification text said 400); auction-finished also sent on cancel; comments heading still 'Messages'
- Known limits: single-process SSE bus; no Last-Event-ID replay (reload on reconnect); a user's other tabs do not see their own bids' locked-credit change until a reload or auction-finished
- Next best step: write a round 6 feature_list.json when SRS.txt gets new requirements

### Session 009 round 6 feature list

- Date: 2026-10-21
- Goal: write the round 6 feature_list.json from the current SRS.txt (8 sections)
- Completed: feature_list.json with 11 not_started features, priority order gds-003 (goods buyer column, high priority), sys-004 (Axios), sell-007 ('New' tag), trx-001 (transaction search), stf-005 (staff goods + approval), stf-006 (staff auctions), stf-007 (credit approval), stf-008 (staff credit CRUD), mail-001 (Gmail transport), mail-002 (activation redirect), mail-003 (change/forgot password by link)
- No code changed; ./init.sh not run this session (no feature work)
- Assumptions recorded in feature notes, to confirm with the product owner: 'buyer-->seller' on resale; 'search in parallel' = combined filters; posted ledger rows are reversed, not deleted; pending accounts blocked from login? (open question, not included)
- Ripple risk: stf-005 (goods approval) and stf-007 (credit approval) change fixtures used by many existing tests; update helpers, do not weaken specs
- Next best step: start gds-003

### Session 010 - round 6, gds-003

- Date: 2026-10-21
- Startup: stopped the auction_db container and the user's `npm run dev` (with the user's OK). Baseline ./init.sh: vitest 220 + fe 15 + build ok, Playwright 44/45 - guest-003 read result cards before they re-rendered (summary updates first); fixed with expect.poll on the cards (same assertions)
- User confirmed: gds-003 'buyer --> seller' reading (reseller becomes goods.seller_id on resale)
- Completed gds-003: goods.buyer_id (migration with backfill), settlement hands goods over (seller = auction seller, buyer = winner) in the settlement transaction; owner = buyer ?? seller; viewer-based goods state (former seller sees sold); My goods lists sold and bought goods with a 'bought' badge; auction create on sold goods 403 (was 409)
- Verification: ./init.sh exit 0 -> be vitest 45 files / 226 tests, fe vitest 15, fe build ok, Playwright 46/46
- Known: after a resale the first seller no longer sees the goods in My goods (they are neither seller nor buyer); their auction stays in My auctions
- Next best step: sys-004 (Axios client)

### Session 010 (cont.) sys-004

- Completed: axios 1.7.7; fe/src/api.ts shared `http` instance (baseURL /api, withCredentials), interceptor -> ApiError (network error -> status 0 message), api() signature unchanged; 401 handler in AuthProvider (signed-in users only, not /auth/*, once) -> /login with 'Your session has ended'; image upload on axios with progress. creditSlice test's network stub moved from fetch to the axios adapter (same assertions)
- Verification: ./init.sh exit 0 -> be vitest 226, fe vitest 23, fe build ok, Playwright 47/47
- Next best step: sell-007 ('New' tag)

### Session 010 (cont.) sell-007

- Completed: create always stores 'upcoming'; auction JSON isNew (derived upcoming); NewTag on cards, My auctions, auction page (live 1 s clock); dev route POST /api/dev/auctions/:id/start-in for the e2e
- Two older tests asserted stored 'active' right after create; updated to the new stored 'upcoming' with the same intent
- Verification: ./init.sh exit 0 -> be vitest 230, fe vitest 26, fe build ok, Playwright 48/48
- Next best step: trx-001 (transaction search)

### Session 010 (cont.) trx-001

- Completed: GET /api/credit/transactions (be/src/lib/transactions.ts, reusable for stf-008); fe TransactionSearch + TransactionTable + Pager; /credit history is the paged search (last 30 days by default)
- Verification: ./init.sh exit 0 -> be vitest 235, fe vitest 32, fe build ok, Playwright 49/49
- Next best step: stf-005 (staff goods + approval; ripple: every goods fixture must approve)

### Session 010 (cont.) stf-005

- Completed: goods approval (pending/active/rejected/deleted, review columns, goods.manage permission); staff goods routes /api/staff/goods (list/search/page, view, add for seller, edit, soft delete, approve/reject with mail); staff UI /staff/goods; My goods shows pending/rejected; auction create 400 on unapproved goods
- Fixture ripple handled: be addGoods and e2e createGoodsViaApi approve (e2e through a real staff session); 6 older tests/specs updated to the approval flow
- Verification: ./init.sh exit 0 -> be vitest 246, fe vitest 32, fe build ok, Playwright 50/50
- Next best step: stf-006 (staff auctions; needs auctions.deleted_at)

### Session 010 (cont.) stf-006

- Completed: auctions.deleted_at + auction.manage; /api/staff/manage/auctions (list/search/page, seller-goods, view, add for seller, edit upcoming / description-only when started, soft delete); release logic shared in be/src/lib/auctionVoid.ts (cancel route uses it too); deleted auctions hidden from all customer pages; UI /staff/auctions
- Verification: ./init.sh exit 0 -> be vitest 258, fe vitest 32, fe build ok, Playwright 51/51
- Next best step: stf-007 (credit requests need staff approval; ripple: every top-up in tests)

### Session 010 (cont.) stf-007

- Completed: credit requests (credit_transactions.status pending/posted/rejected), staff approve/reject at /api/staff/credit/requests (row lock, re-check withdrawals at approval, SSE credit-request event + mail), /credit pending list with live update, /staff/credit page
- Ripple: be topUp helper and e2e topUpViaApi approve through the staff route; 3 be tests and 15 e2e specs switched
- Verification: ./init.sh exit 0 -> be vitest 264, fe vitest 32, fe build ok, Playwright 52/52
- Next best step: stf-008 (staff transaction list/CRUD on top of trx-001 + stf-007)

### Session 010 (cont.) stf-008

- Completed: staff transaction list/search (trx-001 + customer + status), view, manual adjustments (credit/debit, type 'adjustment'), edit (pending amount, any description), soft delete of pending/rejected, reverse of posted top-ups/withdrawals/adjustments; /staff/credit list + /staff/credit/:id
- Verification: ./init.sh exit 0 -> be vitest 273, fe vitest 32, fe build ok, Playwright 53/53
- Next best step: mail-001 (Gmail transport; the real-inbox check needs the user's Gmail app password)
