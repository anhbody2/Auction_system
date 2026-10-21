# Goods approval and staff goods management (stf-005)

## Status values (`goods.status`)

| Value | Meaning | Set by |
|---|---|---|
| `pending` | Waiting for staff review. Cannot be auctioned. | Customer adds goods (`POST /api/goods`); a customer edits `rejected` goods (sent back for review). |
| `active` | Approved. Can be auctioned by its owner. | Staff approve (`POST /api/staff/goods/:id/approve`); staff add goods for a seller (approved at once). Rows that existed before stf-005 stay `active`. |
| `rejected` | Refused by staff, with an optional reason (`rejection_reason`). Cannot be auctioned. | Staff reject (`POST /api/staff/goods/:id/reject {reason?}`). |
| `deleted` | Soft-deleted. Hidden from My goods and the default staff list; shown with the staff "Deleted" filter. | Customer delete (gds-002) or staff delete. |

Only `pending` goods can be approved or rejected (400 otherwise). Each review records `reviewed_at` and
`reviewed_by` and emails the seller ("approved", or "not approved" with the reason).

Goods won in an auction (gds-003) keep their `active` status: the buyer can re-auction them without a new review.

## What the customer sees (My goods, `GET /api/me/goods`)

The derived status adds `pending` ("pending approval") and `rejected` (with the reason). These goods can still be
edited and deleted, have no "Auction it" button, and are left out of the create-auction dropdown
(`?status=available`). `POST /api/auctions` with them answers **400 "Goods must be approved before auction"**.

## Staff routes (`/api/staff/goods`, permission `goods.manage`, granted to staff and admin)

| Route | Notes |
|---|---|
| `GET /` | `q` (name), `seller` (username or full name), `categoryId`, `status` (`all` = not deleted, or one value), `page`, `pageSize` (20). Combined with AND. Returns `total`. |
| `GET /:id` | Images, seller, buyer, reviewer, auctions (with derived status), `inOpenAuction`. Deleted goods are viewable. |
| `POST /` | Goods fields + `seller` (username or email of a customer). Created `active`. |
| `PATCH /:id` | Name, description, category, condition, images. 409 while in an upcoming/active auction. Status unchanged. |
| `DELETE /:id` | Soft delete. 400 "Goods in an upcoming or active auction cannot be deleted". |
| `POST /:id/approve`, `POST /:id/reject` | See above. |

Customers get 403 on every route. UI: /staff/goods (list), /staff/goods/:id (view, approve/reject, edit, delete),
/staff/goods/new (add for a seller); nav link "Goods".
