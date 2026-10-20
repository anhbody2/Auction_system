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

## Tests

- be/tests/credit.lock.test.ts - outbid release and ledger, released credit usable at once, raise own bid, sum across auctions
- be/tests/credit.close.test.ts - lock kept past the end time until close, payment/payout/commission, reserve not met, cancel
- e2e/crd-001-credit-lock.spec.ts - the same journey on the /credit page
- be/tests/credit.summary.test.ts - balance unchanged by bid and outbid until close; ledger rows record the balance
- e2e/crd-002-credit-ui.spec.ts - labels on header, dashboard and /credit before and after close
