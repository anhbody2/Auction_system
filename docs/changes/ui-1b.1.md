# ui-1b.1 lot detail: breadcrumb, image gallery and lot information card

Source: Auction Mockups 1b (breadcrumb, gallery, info card).

| File | Change |
|---|---|
| fe/src/pages/AuctionDetail.tsx | Grid layout: breadcrumb (Browse / category -> `/?category=<id>` / Lot #id), gallery, sticky right aside (price, bid count, next minimum, BidPanel, CancelAuction), info card (StatusBadge, NewTag, 'No reserve' when `hasReserve` is false, name, 'Sold by', description, facts grid: Condition, Category, Starts, Ends, Winner only when set). Bid history and Messages below. Testids current-price, bid-count, next-min-bid, end-time, winner, status kept. |
| fe/src/components/Gallery.tsx | Hero (`alt` = lot name, as before) + thumbnails (selected outlined navy, `aria-pressed`), '+N' tile when more than five images, lightbox dialog (arrows wrap, Escape / Close / backdrop). Placeholder without images. |
| fe/src/components/galleryTiles.ts (+ test) | Tile list and wrap-around step. |
| fe/src/styles.css | Lot grid (content \| 480px aside at >= 1100px, one column below with the aside right after the gallery), gallery, lightbox, facts. |
| e2e/ui-1b-1-lot-layout.spec.ts | New. |

Not built (no data in the system): 'Verified authentic', seller rating / sales, 'Ships'. The goods form requires an image, so the no-image placeholder is tested by stripping images from the API response in the spec.
