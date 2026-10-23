# ui-1a.3 browse: quick bid at the minimum next bid and Custom bid from a card

Source: Auction Mockups 1a ('Bid $X' and 'Custom bid' card buttons).

| File | Change |
|---|---|
| fe/src/components/AuctionCard.tsx | `QuickBid` on live lots (not for the seller): 'Bid $X' (X = `nextMinBid`, already in the list response) opens a confirm, then posts to the existing `POST /api/auctions/:id/bids`; success -> toast + `bidPlaced` (bid limit drops) + list reload; refusal -> the server's message in an error toast + list reload (new minimum). 'Custom bid' -> `/auctions/:id?bid=1`. Guests go to `/login?from=<current url>` (Custom bid: `from` = the lot URL). Buttons sit outside the card link (no button inside `<a>`). |
| fe/src/components/ui/ConfirmDialog.tsx | New reusable confirm (role=dialog). |
| fe/src/components/BidPanel.tsx | `?bid=1` focuses the bid input. |
| fe/src/pages/Login.tsx, fe/src/safeFrom.ts (+ test) | Login also returns to `?from=`, accepted only for paths inside the app. |
| fe/src/pages/Home.tsx | Passes `onChanged` (reload) to cards. |
| fe/src/styles.css | Card action row, dialog. |
| e2e/ui-1a-3-quick-bid.spec.ts | New. |

Decision (reading in the notes, not confirmed by the user): the mockup has no confirm step; bids are binding and lock credit, so a quick bid is guarded by a confirm. Removing it is a one-line change in QuickBid.
