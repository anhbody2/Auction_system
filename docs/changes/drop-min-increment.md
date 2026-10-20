# Drop the per-auction minimum increment

Date: 2026-10-20. Asked for by the user. This is not a round 4 feature-list item.

## Behaviour

Sellers no longer set a minimum increment. Every auction steps bids by the standard ladder only
(be/src/lib/increments.ts: $0.50 from $1, $1 from $10, $2.50 from $50, $5 from $100, $10 from $500,
$25 from $1,000, $100 from $5,000). The next minimum bid is the starting price, then the current price
plus the ladder step for that price. If an API client still sends `minIncrement`, it is ignored, and the
auction JSON no longer includes it.

## Files changed

| File | Change |
|---|---|
| be/prisma/schema.prisma | removed `Auction.minIncrement` |
| be/prisma/migrations/20261020040000_drop_min_increment/migration.sql | drops `auctions.min_increment` (existing values are discarded) |
| be/src/lib/auctions.ts | `incrementFor` removed; `nextMinBid` uses `ladderIncrement` only; `minIncrement` removed from `auctionView` |
| be/src/routes/auctions.ts | `minIncrement` removed from the create schema and insert |
| fe/src/pages/CreateAuction.tsx | 'Minimum increment (optional)' field removed (the user's change); hint text no longer mentions it |
| fe/src/api.ts | `minIncrement` removed from the `Auction` type |
| be/tests/helpers.ts, e2e/helpers.ts | default auctions no longer send `minIncrement` |
| be/tests/bid.place.test.ts, e2e/bid-001-make-bid.spec.ts | the step at $100 is now the ladder's $5: next minimum $105 (was $110); $104.99 is rejected |
| be/tests/bid.increment.test.ts | the "min increment can raise the step" test is replaced by "a sent minIncrement is ignored and bids step by the ladder" |
| e2e/sell-001-create-auction.spec.ts | no longer fills the removed field |
| other be/tests and e2e specs | `minIncrement` argument removed from auction-creation calls; assertions unchanged |
| docs/ERD_edited.md | `min_increment` marked removed |

## Verification

`npm run verify` exit 0: vitest 29 files / 152 tests, fe build ok, Playwright 29/29.
