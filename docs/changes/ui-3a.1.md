# ui-3a.1 bid history: totals, win rate and redesigned table with credit state

Source: Auction Mockups 3a (header totals and table).

| File | Change |
|---|---|
| be/src/routes/bids.ts | `GET /api/me/bids` items add `bidCount` (my tickets on that auction) and `creditState` from my tickets: `locked` while I hold the active ticket, `charged` when I won, `released` otherwise (outbid, lost, cancelled), `none` without tickets. The response adds `totals { bidsPlaced, won, lost }` (bidsPlaced = all my bid tickets on listed auctions). Status values unchanged (winning/outbid/won/lost/cancelled). |
| fe/src/bidHistory.ts, fe/src/winRate.test.ts | Types, `winRate` (won / (won + lost), whole %, '-' with none finished), result pill map (UI 'Leading' for winning), credit labels. |
| fe/src/pages/MyBiddings.tsx | 'Bid history' heading + subtitle, totals (`bids-placed`, `win-rate`), table: lot with thumbnail, 'Lot #id', seller and bid count; your bid (`my-latest`), final / highest (`highest`), placed (`placed`, my latest bid time), credit (`credit-state`), result pill (`my-status`). Old status filter tabs kept until ui-3a.2. |
| fe/src/styles.css | Page head, totals, lot cell. |
| be/tests/bids.me-history.test.ts, e2e/ui-3a-1-bid-history.spec.ts | New. |
| e2e/cust-007-my-biddings.spec.ts | Result labels are now words (Leading, Outbid, Won, Lost, Cancelled). |

The time-left column was dropped (not in the mockup; live lots show it on the dashboard's My auctions).
