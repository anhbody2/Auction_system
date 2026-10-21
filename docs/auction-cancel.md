# Cancelling an auction

Since sell-005 (SRS: Seller - Auction Details, Req-1, Req-2).

## Who can cancel, and when

| Auction state | Seller | Admin | Other customers, staff |
|---|---|---|---|
| Upcoming (start time not reached) | Yes | Yes | No (403) |
| Started (start time reached, not ended) | No (403) | Yes | No (403) |
| Ended | No (400) | No (400) | No (403) |
| Cancelled | No (400) | No (400) | No (403) |

- "Started" is decided by `start_time <= now`, not only by the stored `status`. Between the start time and
  the next run of the hourly start job the row can still say `upcoming`; the seller is refused anyway.
- "Ended" uses the computed status (`effectiveStatus`), so an auction past its end time cannot be cancelled
  even before the close job has run.
- Staff cannot cancel (confirmed by the user, 2026-10-20). The rule is a role check
  (`req.user.role === 'admin'`), not a grantable permission, so it cannot be given to staff from
  /admin/permissions. `req.user.role` is re-read from the database on every request.

## API

`POST /api/auctions/:id/cancel` (signed in)

| Case | Response |
|---|---|
| Allowed (table above) | 200 `{ message: 'Auction cancelled' }` |
| Not the seller and not an admin | 403 "Only the seller can cancel this auction" |
| Seller, auction has started | 403 "This auction has started; only an admin can cancel it" |
| Already cancelled | 400 "This auction is already cancelled" |
| Ended | 400 "An auction that has ended cannot be cancelled" |
| Unknown id | 404 "Auction not found" |

## What a cancel does

All in one transaction, with the auction row locked (`SELECT ... FOR UPDATE`, the same lock bids take):

1. Every `active` bid ticket's held amount is released to its bidder (`credit_transactions` row of type
   `release`, description "Auction cancelled: <name>"). `held_balance` goes back down by that amount;
   the credit balance does not change.
2. All the auction's bid tickets become `cancelled`.
3. The auction becomes `cancelled` and `cancelled_at` is set. Later bids get 400
   "This auction has been cancelled". There is no settlement and no commission.

An upcoming auction cannot have bids, so a seller cancel never has holds to release.

## UI

The auction page shows the cancel button (component `CancelAuction`):

- Seller, upcoming auction: "Cancel auction". When the countdown reaches the start time the page reloads
  and the button is gone.
- Admin, upcoming or active auction: "Cancel auction (admin)".
- Both ask for confirmation ("Yes, cancel auction"), and say how many bids will be voided.

## Staff delete (stf-006)

Staff with `auction.manage` (staff and admin by default) soft-delete auctions with
`DELETE /api/staff/manage/auctions/:id`. The row stays with `deleted_at` set.

- Upcoming or active: exactly like a cancel. Every held bid is released with the ledger row
  "Auction deleted by staff: <name>", all tickets become `cancelled`, the auction `cancelled`. The shared code is
  `voidAuction` in be/src/lib/auctionVoid.ts, also used by the seller/admin cancel route.
- Ended: hiding only. If the close job has not run yet, the auction is settled first, so no money moves after the delete.
- Cancelled: hiding only.

A deleted auction is gone from the homepage, search, the auction page (404), My auctions and My biddings. Staff see
it in /staff/auctions with the "Deleted" filter. `auction.manage` does not open the seller/admin cancel route
(`POST /api/auctions/:id/cancel`): the sell-005 rules stay as they are.
