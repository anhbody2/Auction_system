# ui-1b.2 lot detail: bid panel with live countdown, quick increments and inline feedback

Source: Auction Mockups 1b (bid panel).

| File | Change |
|---|---|
| fe/src/components/BidPanel.tsx | Panel header in every state: time pill ('Ends in 2h 14m 37s', dark red under an hour), bid count, 'Highest bid' / 'Starting price' in large type, change since start (`price-change`, whole %). Form while live: 'Your bid' with '$' prefix, 'Min. $X' (`next-min-bid`), thousands separators while typing, quick buttons `quick-bid-1/2/5` = highest + 1/2/5 increments (starting price + 0/1/4 without bids), 'Place bid $X' (`place-bid`), Enter submits, empty input bids the minimum. Client pre-checks with the server's wording (`bid-error`, cream box, role=alert); the server's 400 message is shown as-is. Standing: `bid-ok` "You're the highest bidder." / `outbid-notice` "You've been outbid." inside `my-standing`, kept current by rt-001 events. Guests: 'Log in to bid'. |
| fe/src/bidMath.ts (+ test) | Ladder copy (same vectors as be/tests/bid.increment.test.ts), quick amounts, % change, input cleaning/formatting, pre-check. A leader raising their own bid counts their current hold as available, as the server releases it first. |
| fe/src/components/AuctionBits.tsx (+ test) | `formatDuration(ms, withSeconds)`, `Countdown format="ends-in"`. |
| fe/src/pages/AuctionDetail.tsx | The aside is now BidPanel + CancelAuction (price facts moved into the panel header). |
| fe/src/styles.css | Panel styles. |
| e2e/ui-1b-2-bid-panel.spec.ts | New. |
| e2e/rt-001-realtime-bids.spec.ts | Standing texts updated to the new wording (same checks). |

Notes: the mockup's fixed +$100/+$250/+$500 buttons are increment multiples (ladder, bid-003/004). No buyer's premium line (commission is charged to the seller, sys-003). The prefilled minimum stays in the input (bid-001/rt-001 rely on it); the placeholder shows it too when the input is cleared.
