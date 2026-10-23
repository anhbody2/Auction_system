# ui-1a.1 browse: redesigned auction cards with the viewer's bid status

Source: Auction Mockups 1a (auction cards).

| File | Change |
|---|---|
| be/src/routes/auctions.ts | `GET /api/auctions` (and its search form) adds `myBid { amount, status: 'leading' \| 'outbid' } \| null` per auction. One extra query (`viewerBids`) for the whole list: the viewer's tickets on the listed auctions, latest amount, leading when they hold the active (or won) ticket. Null for guests, the seller and auctions without their bids. |
| fe/src/api.ts | `Auction.myBid`. |
| fe/src/components/auctionCardState.ts (+ test) | `priceLabel`, `isEndingSoon` (`ENDING_SOON_MS` = 60 min, the one place for the threshold), `stripState`. |
| fe/src/components/AuctionCard.tsx | 1a layout: square thumbnail (striped placeholder without images), time pill (dark red with a dot when ending soon, `data-testid="ending-soon"`), category pill, New tag, big price with label and bid count, your-bid strip (`my-bid-strip`, `data-state` leading/outbid/none), hover lift. The status badge is gone from cards (the section says it). Ended cards keep 'Won by' / 'No winner'. |
| fe/src/components/AuctionBits.tsx | `useNow` exported. |
| fe/src/pages/Home.tsx | `.lot-grid` (4 / 2 / 1 columns), live auction count under the heading (`live-count`). |
| fe/src/styles.css | Lot card styles; `.container` widened to 1240px for the 4-column grid. |
| be/tests/auctions.list-mybid.test.ts, e2e/ui-1a-1-browse-cards.spec.ts | New. |

Notes: cards still refresh with the 30 s poll. The strip shows only on live auctions; upcoming and ended cards keep their own information.
