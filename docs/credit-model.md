# Credit model

How a customer's money moves between deposit, bidding and auction close. Code: be/src/lib/credit.ts
(`applyCredit`), be/src/routes/bids.ts (bid, outbid, cancel), be/src/lib/settlement.ts (close).

## The three figures

| Figure | Stored as | Meaning |
|---|---|---|
| Credit (balance) | `users.credit_balance` | Money the customer owns in the system. Shown as **Credit**. |
| Locked (held) | `users.held_balance` | Part of the balance reserved for bids the customer is **currently leading**. Shown as **Locked credit**, captioned "Held in active bids". |
| Available | `credit_balance - held_balance` (computed) | What the customer can still bid or withdraw. Enforced by the server, not shown as a headline figure (crd-002). |

Invariant: `held_balance` always equals the sum of the user's bid tickets with status `active`.
Only the leading bid on an auction is `active`, so a customer has at most one lock per auction.

## When each figure changes

| Event | Credit | Locked | Ledger row (`credit_transactions.transaction_type`) |
|---|---|---|---|
| Top up | + amount | - | `topup` |
| Withdraw (needs available >= amount) | - amount | - | `withdraw` |
| Place a bid (needs available >= amount) | - | + bid | `hold` "Bid on <auction>" |
| Outbid by someone else | - | - previous bid, **at once** | `release` "Outbid on <auction>" |
| Leader raises own bid | - | - old bid, + new bid | `release` "Released: raised own bid", then `hold` |
| Auction closes with a winner (close job) | winner: - price; seller: + price - commission | winner: - price | `payment` "Won: ...", seller `payout` "Sold: ... (commission $x, y%)" |
| Auction closes, reserve not met | - | leader: - bid | `release` "Reserve not met: ..." |
| Seller cancels | - | every leader lock released | `release` "Auction cancelled: ..." |

So credit only leaves a bidder's account when an auction they win closes. Until then the winning
bid stays locked even after the end time has passed; the close job (be/src/lib/scheduler.ts, plus
the per-request safety net) does the payment. The commission is worked out and stored on
`auction_settlements.commission_amount` at that same moment (tiers in be/src/lib/commission.ts).

A ledger row's `balance_before` / `balance_after` are the **credit balance** before and after (since crd-002;
earlier rows stored the available amount). So `hold` and `release` rows show it unchanged.

## UI labels (crd-002)

| Place | Shows |
|---|---|
| Header pill (customers) | `Credit $x` (`header-credit`) and `Locked credit $y` (`header-locked`) |
| Dashboard | Credit (`dashboard-credit`), Locked credit (`dashboard-locked`) |
| /credit | Credit (`credit-balance`), Locked credit (`credit-held`); history column "Credit after" |
| Bid panel | `Credit: $x · Locked credit: $y` |

No figure is labelled "Available credit". The server messages "Bid exceeds your available credit" and
"Amount exceeds your available credit" stay, because they describe the limit (credit minus locked credit).
`GET /api/credit` still returns `available` for API clients.

## When the UI refreshes (crd-003)

The navbar pills, the dashboard and the bid panel read Credit and Locked credit from a Redux slice
(fe/src/store/creditSlice.ts), not straight from the user object.

| Moment | Credit | Locked credit | Request made |
|---|---|---|---|
| Page load, login | loaded | loaded | `GET /api/auth/me` (as before) |
| Own bid | unchanged | `+ amount - released` (released = own earlier hold when raising) | none; the `POST` response carries `released` |
| Outbid by someone else | unchanged | `- releasedAmount` from the `outbid` event | none |
| Auction the user is in finishes (ended or cancelled), as bidder or seller | fetched again | fetched again | `GET /api/credit` on the `auction-finished` event |
| Deposit or withdrawal on /credit | at once, from the response | at once | the top-up/withdraw `POST` (plus the existing `/auth/me` refresh) |
| Event stream reconnects after a drop | fetched again | fetched again | `GET /api/credit` (events sent while disconnected are lost) |

Events come from the signed-in customer's own stream, `GET /api/me/events` (Server-Sent Events, auth
required; see [realtime.md](realtime.md)):

- `outbid` `{ auctionId, auctionName, bidId, releasedAmount }` to the previous leader when someone else
  bids higher. Raising your own bid sends none.
- `auction-finished` `{ auctionId, auctionName, reason: 'ended' | 'cancelled' }` once per involved user
  (seller and every bidder), sent after the settlement or cancel transaction commits, so a refetch sees
  the settled balances.

## Tests

- be/tests/credit.lock.test.ts - outbid release and ledger, released credit usable at once, raise own bid, sum across auctions
- be/tests/credit.close.test.ts - lock kept past the end time until close, payment/payout/commission, reserve not met, cancel
- e2e/crd-001-credit-lock.spec.ts - the same journey on the /credit page
- be/tests/credit.summary.test.ts - balance unchanged by bid and outbid until close; ledger rows record the balance
- e2e/crd-002-credit-ui.spec.ts - labels on header, dashboard and /credit before and after close
- be/tests/credit.events.test.ts - outbid event with the released amount, auction-finished to winner, outbid bidders and seller after close and on cancel
- fe/src/store/creditSlice.test.ts - bid/outbid change locked only, auction-finished refetches
- e2e/crd-003-credit-stable.spec.ts - no credit refetch while bidding, live locked credit on outbid, credit after close without reload

## Searching transactions (trx-001)

`GET /api/credit/transactions` searches the signed-in user's ledger. Query parameters, all optional and combined with AND:

| Param | Meaning |
|---|---|
| `from`, `to` | Local days (YYYY-MM-DD, inclusive; `tz` = the browser's getTimezoneOffset()). Default: the last 30 days. Neither may be older than 30 days ("Date must be within the last 30 days"), `to` may not be in the future, `from` <= `to`. |
| `name` | Case-insensitive match on the auction name or the transaction description. |
| `id` | Exact transaction id. |
| `min`, `max` | Amount range on the (always positive) amount. `min` >= $1; blank `max` = no upper limit; `max` >= `min`. |
| `page`, `pageSize` | Paging (default 1 / 20, pageSize up to 100). The response has `total`, `page`, `pageSize`, `from`, `to`. |

"Search in parallel" (SRS) is read as: every criterion can be given at once in one query. The count and the page
are queried in parallel. Rules live in be/src/lib/transactions.ts (`transactionFilterSchema`, `transactionWhere`,
`searchTransactions`), reused by the staff list (stf-008). The client repeats the checks with the same messages
(fe/src/transactionSearch.ts) and the search bar is fe/src/components/TransactionSearch.tsx.
`GET /api/credit` (summary) is unchanged.
