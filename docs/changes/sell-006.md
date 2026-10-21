# sell-006 - Create-auction goods dropdown lists only available goods

SRS: System - UI update - Auction Create Section, Req-1.

## Behaviour

- /auctions/new asks for `GET /api/me/goods?status=available` and lists only those goods. Goods in an
  auction (upcoming or active) or sold are not in the dropdown at all; before, they were disabled options.
- No available goods: the existing message ("You haven't added any goods yet." or "All your goods are in an
  auction or sold.", worded from a second, unfiltered request made only in that case) and the Add goods link.
- `?goodsId=<id>` for goods that are not available (busy, sold, or not the seller's) preselects nothing and
  shows "That goods item is not available for a new auction". Picking an item clears it.
- The server still refuses an auction from busy or sold goods, with 409 and `fields.goodsId`
  ("These goods are already in an auction" / "These goods have been sold") as since sell-003. The feature
  list said 400; the existing 409 was kept (covered by be/tests/auction.create.test.ts).

## API

`GET /api/me/goods` takes an optional `status` = `available` | `in_auction` | `sold` (derived status, as
shown on My goods). Any other value: 400. Without it the response is unchanged (all non-deleted goods).

## Changed files

| File | Change |
|---|---|
| be/src/routes/goods.ts | Optional `status` filter on `GET /api/me/goods` |
| fe/src/pages/CreateAuction.tsx | Lists available goods only; not-available message for `?goodsId=` links |
| be/tests/goods.list.test.ts | New case for the filter |
| e2e/sell-006-available-goods.spec.ts | New |
| e2e/sell-003-auction-from-goods.spec.ts | "Busy Mirror (in auction)" disabled -> absent |
