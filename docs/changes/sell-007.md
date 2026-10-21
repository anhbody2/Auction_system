# sell-007 'New' tag on newly created auctions

SRS: Seller - Create new auction, Req-1..3. Spec 'new' = schema status 'upcoming'.

## Behaviour

- `POST /api/auctions` always stores `status = 'upcoming'`, whatever the body says (unknown fields are stripped) and
  even when the start is "now". Before, an auction starting now was stored 'active' straight away.
- The start job (sys-001, be/src/lib/jobs.ts) moves it to 'active' at its start time ("the system checks and starts it").
  Between the start time and the next job run the API already reports the derived status 'active' (effectiveStatus).
- Auction JSON has `isNew` = derived status is 'upcoming' (not cancelled, start time in the future). It turns false
  at the start time even if the stored status is still 'upcoming'.
- The UI shows a 'New' badge (`NewTag` in fe/src/components/AuctionBits.tsx, `newTagLabel` helper) next to the
  status on home/search cards, My auctions and the auction page. It is computed from status + start time with a
  1 s clock, so an open page drops it live when the countdown reaches zero.
- Auctions created by a buyer re-auctioning (gds-003) use the same route, so they get the tag too. Staff-created
  auctions (stf-006) must use the same rule.

## Files

| File | Change |
|---|---|
| be/src/routes/auctions.ts | Store 'upcoming' on create. |
| be/src/lib/auctions.ts | `isNew` in auctionView. |
| be/src/routes/dev.ts | Dev-only `POST /api/dev/auctions/:id/start-in {seconds}` (start soon, end follows the duration) for the e2e. |
| fe/src/components/AuctionBits.tsx | `newTagLabel`, `NewTag`. |
| fe/src/components/AuctionCard.tsx, fe/src/pages/AuctionDetail.tsx, fe/src/pages/MyAuctions.tsx | Show the tag. |
| fe/src/api.ts, fe/src/styles.css | `isNew` type; `.badge-new`, `.tags`. |
| be/tests/auction.new-tag.test.ts, fe/src/components/AuctionBits.test.ts, e2e/sell-007-new-tag.spec.ts | New. |
| be/tests/auction.duration.test.ts | A start a moment ago: stored 'upcoming', API status 'active' (was stored 'active'). |
| be/tests/job.close.test.ts | Before the close job the stored status is 'upcoming' (was 'active'); still asserts it is not closed yet. |
| fe/src/store/auctionSlice.test.ts | Fixture gets `isNew`. |
