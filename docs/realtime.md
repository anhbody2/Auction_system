# Real-time auction page

Since rt-001 (SRS: System - UI update - Auction Page, Req-1, Req-2).

## Transport: Server-Sent Events

`GET /api/auctions/:id/events` is a Server-Sent Events stream. It is public, like the bid history, so
guests watching an auction see bids too. Unknown auction: 404 JSON, no stream.

Why SSE and not socket.io: updates only flow server -> browser (bids are still placed with a normal
`POST`), SSE needs no new server or client dependency, it goes through the existing Vite `/api` proxy,
and the browser's `EventSource` reconnects by itself.

Server side (be/src/lib/events.ts):

- An in-process `EventEmitter` is the bus; channel `auction:<id>`. `publishAuctionEvent` sends to every
  open stream of that auction.
- Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `Connection: keep-alive`, `X-Accel-Buffering: no`, flushed immediately so nothing buffers the stream.
  There is no compression middleware.
- The stream starts with `retry: 2000` (reconnect after 2 s) and a `: connected` comment, then sends
  `: ping` every 25 s so idle connections are not cut by proxies.
- The listener is removed when the client disconnects.
- Limit: one API process. Running more than one would need a shared channel (for example Postgres
  `LISTEN/NOTIFY`) so a bid on one process reaches streams on another.

## Event format

```
event: bid
id: <bid ticket id>
data: {"auctionId":7,"bid":{"id":42,"amount":110,"status":"active","createdAt":"...","bidder":{"id":3,"username":"carol"}},
       "outbidBidIds":[41],"currentPrice":110,"nextMinBid":120,"bidCount":2,"reserveMet":true}
```

- Published from `POST /api/auctions/:id/bids` (be/src/routes/bids.ts) only after the bid transaction
  commits. A rejected bid publishes nothing.
- `outbidBidIds`: tickets this bid moved from `active` to `outbid` (the previous leader, or the bidder's
  own earlier bid when they raise it).
- The `POST` response carries the same object as `event`, so the bidder's page applies its own bid
  without waiting for the stream.

```
event: closed
data: {"auctionId":7,"status":"ended"}      (or "cancelled")
```

- cmt-001: sent after the close job settles the auction or after a cancel. Open pages reload the auction,
  so the status, winner and the comment box follow.

## Concurrent bids

Bids on one auction are serialised by `SELECT ... FOR UPDATE` on the auction row. Two bids of the same
amount at the same moment: the first commits, the second then sees the new current price and gets 400
"Bid must be at least <next min bid>". The page reloads the auction after a rejected bid, so the panel
shows the new minimum (be/tests/bid.concurrent.test.ts).

## Reconnect behaviour

`useAuctionEvents` (fe/src/store/useAuctionEvents.ts) opens one `EventSource` per auction page and
closes it on leave. When the connection drops, `EventSource` retries after 2 s; on the reopen the page
reloads the auction and its bids (`loadAuction`), so bids made while disconnected are not missed.
Events are not replayed from `Last-Event-ID`; the reload covers that.

## Store shape (Redux Toolkit)

fe/src/store/index.ts creates the store (`Provider` in fe/src/main.tsx). Slice `auction`
(fe/src/store/auctionSlice.ts):

```ts
{
  requestedId: number | null; // the auction the page asked for; responses for other ids are dropped
  auction: Auction | null;    // GET /api/auctions/:id
  bids: Bid[];                // GET /api/auctions/:id/bids, highest first
  loading: boolean;
  error: string;
}
```

- `loadAuction(id)` (thunk) loads or quietly reloads; old data stays on screen while it runs. Opening a
  different auction clears the old one first.
- `bidReceived(event)` applies a bid event: ignored if it is for another auction or its bid id is already
  in the history (the own-`POST` copy and the pushed copy). Otherwise it marks earlier bids `outbid`, puts
  the new bid on top and sets `currentPrice`, `nextMinBid`, `bidCount`, `reserveMet`.
- The auction page, the bid panel and the bid history all read this slice. The panel shows
  "You are the leading bidder" / "You have been outbid" (`data-testid="my-standing"`) from it.

## Per-user stream (crd-003)

`GET /api/me/events` (signed in; 401 otherwise) is the same kind of stream on channel `user:<id>`. It carries
`outbid` and `auction-finished`; the `credit` slice (fe/src/store/creditSlice.ts) and `useUserEvents` use
it. Credit refresh rules are in [credit-model.md](credit-model.md#when-the-ui-refreshes-crd-003).

Store slices now: `auction` (above) and `credit` (`{ credit, locked }`, both `number | null` until loaded).
Each signed-in customer page holds two streams at most (their user stream and the open auction's).

The per-user stream is reopened after a session renewal (sec-003, `openAuthedStream` in
fe/src/store/authedStream.ts): when the browser's reconnect is answered 401 the client refreshes the session and
opens the stream again with the same handlers.

## Staff approval stream (stf-009)

SRS "Staff - request Approve: Turn all request Approve to realtime". The approval queues are goods review
(stf-005) and credit top-up/withdrawal requests (stf-007); auctions have no approval step.

`GET /api/staff/events` (be/src/routes/staffApprovals.ts): 401 for guests, 403 for users with neither
`goods.manage` nor `credit.manage`. The stream listens to channel `staff:goods` only with `goods.manage` and
`staff:credit` only with `credit.manage`, decided when it connects (a permission change applies from the next
connect). `GET /api/staff/pending-counts` returns `{ goods?, credit? }` (each only with its permission) for the
initial badge values.

Events are published by be/src/lib/approvalEvents.ts after the change has committed, so a refused review (400)
sends nothing. Publishing never fails the request; a problem is logged. Each event has a unique SSE `id`.

| Event | `action` values | Published by |
|---|---|---|
| `goods-request` `{ id, action, status, name, seller, reviewedBy, pendingCount }` | `created` | POST /api/goods |
| | `resubmitted` | PATCH /api/goods/:id of rejected goods (back to pending) |
| | `approved`, `rejected` | POST /api/staff/goods/:id/approve, /reject |
| | `deleted` | soft delete of pending goods by the seller (DELETE /api/goods/:id) or staff (DELETE /api/staff/goods/:id) |
| `credit-request` `{ id, action, status, type, amount, customer, reviewedBy, pendingCount }` | `created` | POST /api/credit/topup, /withdraw |
| | `approved`, `rejected` | POST /api/staff/credit/requests/:id/approve, /reject |
| | `cancelled` | staff soft delete of a pending request (DELETE /api/staff/credit/transactions/:id); customers cannot cancel requests |

`pendingCount` is the queue length right after the change. `reviewedBy` is the staff username, or null for the
customer's own actions.

Client (fe/src/store/useStaffEvents.ts, mounted once in Layout for users with either permission): one
EventSource per session (through `openAuthedStream`), feeding the `approvals` slice
(fe/src/store/approvalsSlice.ts): `{ goodsPending, creditPending, lastEvent, seen, resync }`. A repeated delivery
of an event (same SSE id) is ignored. Nav badges `badge-goods-pending` / `badge-credit-pending` show the counts
(hidden at zero). After a dropped stream reconnects the client reloads the counts and bumps `resync`, so open
lists reload once (events sent meanwhile are not replayed). `sessionEnded` (sec-005) clears the slice.

Pages:

- /staff/goods: a `created`/`resubmitted` event that matches the current filters (status all or pending, name and
  seller text, no category filter) reloads the current page in place; otherwise a notice
  `data-testid="new-requests-notice"` counts them, with "Show" switching to the pending filter. A decision updates
  the row's status in place. Page and filters are kept.
- /staff/goods/:id: a decision by someone else (or the seller's delete) shows `data-testid="decided-elsewhere"`
  ("Approved by admin just now") and disables Approve/Reject; a resubmission reloads the item.
- /staff/credit pending requests: `created` reloads the queue; a decision by someone else replaces the row's
  buttons with `decided-elsewhere`; the transaction table refreshes. /staff/credit/:id shows the same note.

### Requester side (stf-010)

The customer who made the request hears about the decision on their own stream (`/api/me/events`):

| Event | Data | Client |
|---|---|---|
| `goods-reviewed` (new) | `{ id, name, status: 'approved' \| 'rejected', reason }` | `useUserEvents`: toast, then window event `goods-reviewed`; My goods reloads that one row (`GET /api/goods/:id`), the create-auction form reloads its available goods on `approved`. |
| `credit-request` (stf-007, now with `reason`) | `{ id, status, type, amount, reason, balance, held }` | Credit figures and /credit as before; plus a toast "Your top-up of $25.00 was approved" / "Your withdrawal of $5.00 was rejected: <reason>" (only for approved or rejected top-ups and withdrawals). |

Toast wording lives in fe/src/requestToasts.ts. Staff and admin have no own goods or credit requests in the UI,
so their user stream is not opened (it is customer-only, as before).

Store slices now: `auction`, `credit` and `approvals`.
