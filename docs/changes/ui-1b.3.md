# ui-1b.3 lot detail: price chart and live bid history list

Source: Auction Mockups 1b (price chart, 'Bid history · Live').

| File | Change |
|---|---|
| fe/src/priceChart.ts (+ test) | Points from the starting price through the bids (oldest first), evenly spaced, padded y-range (flat prices get a band), area polygon, aria summary. Inline SVG, no chart library. |
| fe/src/relativeTime.ts (+ test) | 'just now' / 'N min ago' / 'N h ago' / 'N days ago'. |
| fe/src/components/BidPanel.tsx | `PriceChart` under the highest bid (`price-chart`, `data-points`, hidden without bids). `BidHistory` rewritten as the live list card: initials avatar, bidder, amount, relative time (refreshed every 30 s, full date in `title`), status (leading/outbid); own bids cream with a 'You' pill (`you`). Rows keep table roles with a hidden header row, so `bid-history` row indexes mean the same as before; the list scrolls inside the card (max 300px). Both read the Redux auction slice fed by useAuctionEvents (rt-001), no polling. |
| fe/src/pages/AuctionDetail.tsx | History moved from the left column to under the bid panel in the aside. |
| fe/src/styles.css | Chart and history styles. |
| e2e/ui-1b-3-history-chart.spec.ts | New. |

Notes: bidder usernames are shown as the bids endpoint already exposes them (not masked today). Own rows keep the username next to the 'You' pill. '214 watching' is not built (no watch feature).
