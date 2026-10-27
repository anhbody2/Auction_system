# home-2.2 - Homepage: 'Just completed' shows the 8 closed lots in the mockup card style

SRS: 'system - Ui change' Req-2 (just completed shows 8 closed auctions) and Req-1 (mockup card style).

## Behaviour

- Below 'Trending lots', `section-completed` with heading 'Just completed (<n>)' (the '(last 7 days)'
  text went with home-2.1). It shows what the API returns: at most 8 closed lots, newest first.
- The mockup has no completed section, so it reuses the 1a card in its ended state: muted 'Ended <date>'
  pill, 'Winning bid' (won) or 'Final price' (no winner) above the price, bid count, 'Won by <user>' or
  'No winner'. No bid strip, no Bid / Custom bid buttons. The card opens the lot in view-only mode.
- Guests and customers see the same 8. Grid collapses to one column at 375px.

## Changed files

| File | Change |
|---|---|
| fe/src/components/auctionCardState.ts | Ended labels 'Sold for' / 'Final' -> 'Winning bid' / 'Final price'. |
| fe/src/components/auctionCardState.test.ts | Label test updated to the new words. |
| fe/src/components/AuctionCard.tsx | Winner line gets `data-testid="card-winner"`. |
| e2e/home-2-2-just-completed-section.spec.ts | New: 9 expired lots (newest won by bob); as guest and customer exactly 8 cards, newest first, oldest absent, heading count 8, labels, 'Won by bob' / 'No winner', no buttons or strip; click opens the ended lot; filtered empty text; 375px one column. |
| docs/design-system.md | 'Homepage' entry: completed section. |

e2e/guest-002-homepage.spec.ts and e2e/guest-003-search.spec.ts needed no change: their just-expired lots are
among the 8 newest, and they pass as they are.
