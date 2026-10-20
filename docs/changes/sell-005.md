# sell-005 - The seller can cancel only before the start time; after that only an admin can

SRS: Seller - Auction Details, Req-1, Req-2. Rules and API: [../auction-cancel.md](../auction-cancel.md).

## Changed files

| File | Change |
|---|---|
| be/src/routes/bids.ts | `POST /auctions/:id/cancel`: admins may cancel any auction that is not ended or cancelled; the seller is refused with 403 once `start_time` has passed. The release logic is unchanged and still in this one route |
| fe/src/components/CancelAuction.tsx | Seller sees the button only while upcoming; admin sees "Cancel auction (admin)" while upcoming or active |
| be/tests/auction.cancel.test.ts | Rewritten for the new seller rules: upcoming cancel, refused when active, refused when start passed but status still `upcoming`, non-owner and staff 403, ended/cancelled 400 |
| be/tests/auction.cancel.admin.test.ts | New: admin cancel with bids (tickets cancelled, holds back, ledger text), admin cancel of an upcoming auction, ended/cancelled 400 |
| e2e/sell-005-cancel-rules.spec.ts | New end-to-end check of the rules |
| e2e/sell-002-cancel-auction.spec.ts | Seller cancel now on an upcoming auction; the cancel with bids is done by the admin |
| be/tests/credit.close.test.ts, homepage.test.ts, my-auctions.test.ts, my-bids.test.ts, search.test.ts | Their "cancelled auction" fixtures were started auctions cancelled by the seller; now cancelled by the admin. What each test checks is unchanged |
| e2e/cust-006-my-auctions.spec.ts | The cancelled fixture is created upcoming so the seller can still cancel it; the cancel call now asserts 200 |
| e2e/cust-007-my-biddings.spec.ts | The cancelled fixture has a bid (started), so the admin cancels it |

## Decision

Role check instead of a new permission code: a permission could be granted to staff from
/admin/permissions, and staff must not be able to cancel.
