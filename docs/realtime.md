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

The navbar credit figures still come from the auth context; moving them to a credit slice that reacts to
outbid and auction-finished events is crd-003.
