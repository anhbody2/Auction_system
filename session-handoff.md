# Session Handoff

State: all 14 features in scope are passing and archived to `progress-feature-list/feature_list_1.json`.
`./init.sh` exits 0 (54 vitest + fe build + 14 Playwright).

## Restart path

1. Start Docker Desktop. `docker compose up -d --wait db` (also done by npm scripts)
2. `./init.sh`, or `npm install && npm run verify`
3. `npm run dev`, then open http://localhost:5173 (alice / bob / carol, `Password123!`)

## Map

| Area | Backend | Frontend | Tests |
|---|---|---|---|
| Auth, register, reset | be/src/routes/auth.ts | pages/Login, Register, VerifyEmail, ForgotPassword, ResetPassword | auth.*, password.* |
| Profile, password | be/src/routes/me.ts | pages/Profile, ChangePassword | profile, password.change |
| Credit ledger | be/src/lib/credit.ts, routes/credit.ts | pages/Credit | credit |
| Auctions | be/src/lib/auctions.ts, routes/auctions.ts | pages/CreateAuction, AuctionDetail, MyAuctions, Home | auction.*, my-auctions, homepage, search |
| Bids, cancel, my bids | be/src/routes/bids.ts | components/BidPanel, CancelAuction; pages/MyBiddings | bid.place, auction.cancel, my-bids |
| Settlement | be/src/lib/settlement.ts | n/a | my-bids |
| Messages | be/src/routes/messages.ts | components/Messages | messages |
| Dev helpers | be/src/routes/dev.ts (outbox, expire auction) | n/a | used by e2e |

To start new work, create a fresh `feature_list.json` at the root (CLAUDE.md startup expects it) and record progress with `node scripts/feature.js <id> <status> "evidence..."`.
