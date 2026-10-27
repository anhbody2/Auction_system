# home-1.2 - Homepage: one 'Trending lots' section as in mockup 1a

SRS: 'system - Ui change' Req-1 (UI sticks with Auction Mockups.dc.html, homepage section).

## Behaviour

- The 'Find something worth bidding on' hero (with the signed-in / guest line) and the 'Starting soon'
  section are gone. Below the chip bar: 'Trending lots', '<n> live auctions' (the real count), 'Sort:'
  select on the right (default 'Most bids'), then the 4-column card grid.
- 'bids update in real time' is not shown: the list reloads every 30 s, cards do not update live.
- Empty: 'No auctions are live right now.' / 'No live auctions match.' when filtered.
- Cards: the user's uncommitted AuctionCard / AuctionBits / styles.css restyle (1a card: thumb + title,
  pills, 'Highest bid' + count, bid strip, Bid $X / Custom bid that open the lot) was taken as the baseline
  and committed with this feature, together with their TopSearch change (no Search button; Enter submits)
  and their matching e2e/ui-1a-3-quick-bid.spec.ts update.

## Changed files

| File | Change |
|---|---|
| fe/src/homeSections.ts | New: `splitSections` (trending = active, completed = ended, server order) and `liveCountLabel`. |
| fe/src/homeSections.test.ts | New unit test. |
| fe/src/pages/Home.tsx | Hero and upcoming section removed; 'Trending lots' section with head row, live count and sort; `LotGrid` shared with the completed section. |
| fe/src/styles.css | `.home-section`, `.browse-title`, `.browse-sub`, sort select styling (plus the user's card restyle). |
| fe/src/components/AuctionCard.tsx, AuctionBits.tsx, TopSearch.tsx | User's restyle (see above). |
| e2e/home-1-2-trending-section.spec.ts | New: guest and customer, heading, live count, no upcoming, most bids first, 'Most bids' selected, bid strip only for the customer, sort in the URL, empty text, 4 columns at 1440px, 1 column at 375px. |
| e2e/ui-1a-3-quick-bid.spec.ts | User's update to the open-the-lot quick bid, plus the upcoming case from home-1.1. |
| docs/design-system.md | 'Homepage' entry. |

Older specs (ui-1a-1, ui-1a-2, guest-002, guest-003) needed no further change: they find cards through
`section-live`, `live-count`, `sort` and the card test ids, which are kept.
