# ui-2a.2 dashboard: Goods owned list with Sell

Source: Auction Mockups 2a (Goods owned).

| File | Change |
|---|---|
| be/src/routes/goods.ts | New `GET /api/me/goods/owned`: goods where buyer_id = me and status is not deleted (gds-003 owner), each with `wonPrice` / `wonAt` from the auction the user won, newest win first. Selling them on moves buyer_id to the next winner, so they leave the list. |
| fe/src/components/GoodsOwned.tsx | 'Goods owned · N' card: thumbnail, name, 'Won $X · date', 'Sell' -> `/auctions/new?goodsId=<id>` (CreateAuction already preselects eligible goods), 'Listed' pill while in an auction, empty state 'Nothing won yet.' + Browse link, up to 5 items with 'View all' -> /goods. |
| fe/src/pages/Dashboard.tsx | Renders the card under the credit cards. |
| fe/src/styles.css | Owned list styles. |
| be/tests/goods.owned.test.ts, e2e/ui-2a-2-goods-owned.spec.ts | New. |
| e2e/crd-003-credit-stable.spec.ts | The 'no credit refetch' filter now lists the endpoints that return credit figures (`/api/auth/me`, `/api/me/profile`, `/api/credit`) instead of every `/api/me*` path, which the dashboard's owned goods / summary requests tripped (replaces the ui-2a.1 summary exclusion). |

Notes: 'Goods owned' = bought goods only; the user's own unsold goods stay on My goods (which has no bought filter, so 'View all' opens it unfiltered).
