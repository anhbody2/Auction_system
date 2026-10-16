# Progress Log

## Current Verified State

- Repository root: E:\Auction_system (`/e/Auction_system` in Git Bash)
- Stack: be/ Node 20 + Express + TypeScript + Prisma 5 (PostgreSQL 16 in docker compose, host port 5433); fe/ React 18 + Vite + TS; e2e/ Playwright (Chromium)
- Schema source of truth: docs/ERD_edited.md (docs/ERD.md is the untouched original)
- Standard startup path: start Docker Desktop, then `./init.sh` (npm install + full verify). `npm run dev` runs API on :4000 and web on :5173 (Vite proxies /api)
- Standard verification path: `npm run verify` = `npm test` (vitest on DB auction_test + fe build) and `npm run e2e` (Playwright on DB auction_e2e, servers on :4100/:5180)
- Demo accounts: alice / bob / carol, password `Password123!` (`npm run db:seed -w be` reseeds the dev DB)
- Feature list: round 1 (14 features) archived to progress-feature-list/feature_list_1.json. Round 2 feature_list.json: bid-003, sys-001, sys-002, sys-003 (all not_started)
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
  - Settlement on auction end: winner pays from hold, seller gets amount minus 5% commission (COMMISSION_RATE), reserve not met -> hold released; runs before every /api request and every 5s
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
