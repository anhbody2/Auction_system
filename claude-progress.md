# Progress Log

## Current Verified State

- Repository root: E:\Auction_system (`/e/Auction_system` in Git Bash)
- Stack: be/ Node 20 + Express + TypeScript + Prisma 5 (PostgreSQL 16 in docker compose, host port 5433); fe/ React 18 + Vite + TS; e2e/ Playwright
- Schema source of truth: docs/ERD_edited.md (docs/ERD.md kept untouched as the original)
- Standard startup path: Docker Desktop running, then `./init.sh` (install + verify); `npm run dev` for be :4000 + fe :5173
- Standard verification path: `npm run verify` = `npm test` (be vitest on auction_test DB + fe build) and `npm run e2e` (Playwright on auction_e2e DB, servers on :4100/:5180)
- Demo accounts: alice / bob / carol, password `Password123!`
- Current highest-priority unfinished feature: see feature_list.json (first not passing by priority)
- Current blocker: none

## Session Log

### Session 001

- Date: 2026-10-16
- Goal: Bootstrap the empty be/ and fe/ and complete cust-001 Login
- Completed: user picked stack (Express+TS, React+Vite, Postgres/Docker); docs/ERD_edited.md (adds username, credit/held balance, auction start/end/min_increment/current_price/winner, AUCTION_MESSAGES, PASSWORD_RESET_TOKENS, EMAIL_VERIFICATION_TOKENS); Prisma schema + init migration + seed; auth API (login/logout/me); FE shell, login page, dashboard; Playwright harness
- Verification run: ./init.sh -> exit 0 (vitest 6/6, fe build ok, playwright 1/1)
- Evidence captured: feature_list.json cust-001.evidence
- Files or artifacts updated: be/, fe/, e2e/, docker-compose.yml, db/init, package.json, playwright.config.ts, init.sh, docs/ERD_edited.md
- Known risk or unresolved issue: `prisma generate` can hit EPERM on Windows when a node process holds the query engine DLL; resets use --skip-generate. progress-feature-list/feature_list.json is an older template (chat features) left untouched.
