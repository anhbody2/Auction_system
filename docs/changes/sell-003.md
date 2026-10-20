# sell-003 - Create auction from existing goods

SRS: Seller - Manage Goods REQ-1 ("before creating a new auction, users must add goods"); Create Auction
(image) Req-1.

## Behaviour

- The create-auction form no longer asks for item details (category, condition) or an image. The seller
  picks one of their goods in **Goods**; goods in an auction or sold are listed but disabled
  ("Busy Mirror (in auction)"). The chosen goods' images and details are shown, and its name and
  description fill in **Auction name** and **Description**, which can still be changed. Starting price,
  reserve price and start/end time stay on the form.
- With no available goods the form is replaced by a message and an **Add goods** link.
- My goods has an **Auction it** button on available goods (`/auctions/new?goodsId=<id>`).
- After creation the goods show "in auction" on My goods (derived status from gds-001).

## API

`POST /api/auctions` body: `{ goodsId, name, description, initialPrice, reservePrice?, startTime, endTime }`.

| Case | Response |
|---|---|
| Valid, available own goods | 201, auction linked to that `goods_id`; no goods row is created |
| `goodsId` missing | 400 `fields.goodsId` "Choose goods to auction" |
| Someone else's, deleted or unknown goods | 404 "Goods not found" |
| Goods in an upcoming/active auction | 409 "These goods are already in an auction" |
| Sold goods | 409 "These goods have been sold" |

`categoryId`, `condition` and `imageUrl` in the body are ignored. The goods row is locked with the same
`lockOwnGoods` as edit/delete (gds-002), so goods cannot be edited, deleted or auctioned twice concurrently.

## Changed files

| File | Change |
|---|---|
| be/src/routes/auctions.ts | Create takes `goodsId`, locks and checks the goods, no longer creates goods or reads imageUrl. |
| fe/src/pages/CreateAuction.tsx | Goods picker, goods preview, prefilled name/description, no-goods state; category/condition/image removed. |
| fe/src/pages/MyGoods.tsx | "Auction it" button on available goods. |
| be/tests/helpers.ts | New `createGoodsFor` (goods straight in the DB); `createAuction` creates goods first and routes categoryId/condition/imageUrl to them, so existing callers (search tests) keep working. |
| be/tests/auction.create.test.ts | Missing-fields case now expects `goodsId`; new sell-003 cases (link, ignored fields, 404, 409, re-auction after cancelled/unsold). |
| be/tests/upload.api.test.ts | The auction-image case now checks the auction shows its goods' uploaded image (the URL rule moved to goods, covered in goods.create.test.ts). |
| e2e/helpers.ts | `createAuctionViaApi` adds goods (with an uploaded image) first; categoryId/condition go to the goods. |
| e2e/sell-001-create-auction.spec.ts | Adds goods first and picks them; 'Item name' is now 'Auction name' and is prefilled. Same checks otherwise. |
| e2e/upl-001-image-upload.spec.ts | The upload happens on Add goods, then the goods are auctioned and the auction page shows the image. Same checks otherwise. |
| e2e/sell-003-auction-from-goods.spec.ts | New spec. |
