# ui-2a.3 dashboard: My auctions table with Bidding, Selling and Ended tabs

Source: Auction Mockups 2a (My auctions).

| File | Change |
|---|---|
| fe/src/myAuctionsTabs.ts (+ test) | Tab data from existing endpoints only: Bidding = `GET /api/me/bids` items with myStatus winning/outbid; Selling = `GET /api/me/auctions` active/upcoming, soonest ending first; Ended = the last 10 ended auctions from both sides, newest first (won/lost as bidder, sold/unsold as seller). |
| fe/src/components/MyAuctionsCard.tsx | Card with SegmentedTabs (counts in labels, `?tab=` kept in the URL), per-tab tables with empty states; Bidding rows: lot, highest, your bid, Countdown (reloads on elapse), 'Leading' pill or 'Outbid · Rebid' link to `/auctions/:id?bid=1`; Selling rows: lot, highest (or 'Starts $X'), bids, Countdown; Ended rows: lot, final, your bid ('Your lot' for the seller), date, result pill. Reloads when locked credit changes (own bid, outbid, settlement). |
| fe/src/pages/Dashboard.tsx | Card next to Goods owned. |
| fe/src/styles.css | Card table tweaks. |
| e2e/ui-2a-3-dashboard-auctions.spec.ts | New. |

No new endpoint was needed.
